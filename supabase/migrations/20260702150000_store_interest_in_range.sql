-- Fix bug tổng kết lợi nhuận sai khi store > 1000 hợp đồng (PostgREST cắt 1000 dòng khi FE
-- lấy mảng id rồi truyền vào get_*_paid_interest / get_installment_interest_for_date_range).
-- Cách fix: RPC store-level, gom toàn bộ hợp đồng ngay trong DB, không truyền id từ client.
-- ADDITIVE: chỉ thêm RPC mới, không sửa RPC cũ (v1 + v2 dùng chung DB).

-- 1) Tổng lãi phát sinh trong kỳ của cả 3 loại hợp đồng, trả về 1 dòng.
--    - Cầm đồ / Tín chấp: tổng credit_amount các lần đóng lãi (payment) trong kỳ
--      (cùng công thức get_pawn_paid_interest / get_paid_interest).
--    - Trả góp: lãi = max(0, lũy kế đã đóng - tiền đưa khách); lấy phần chênh
--      giữa cuối kỳ và trước kỳ (cùng công thức get_installment_interest_for_date_range,
--      nhưng cộng cả delta âm để khớp trang chi tiết khi có hủy đóng).
create or replace function public.rpc_store_paid_interest_in_range(
  p_store_id   uuid,
  p_start_date timestamptz,
  p_end_date   timestamptz
) returns table (
  pawn_interest        numeric,
  credit_interest      numeric,
  installment_interest numeric
) language sql stable as $$
with pawn_sum as (
  select coalesce(sum(ph.credit_amount), 0)::numeric as v
  from pawn_history ph
  join pawns p on p.id = ph.pawn_id
  where p.store_id = p_store_id
    and ph.transaction_type = 'payment'
    and ph.is_deleted = false
    and ph.created_at >= p_start_date
    and ph.created_at <= p_end_date
),
credit_sum as (
  select coalesce(sum(ch.credit_amount), 0)::numeric as v
  from credit_history ch
  join credits c on c.id = ch.credit_id
  where c.store_id = p_store_id
    and ch.transaction_type = 'payment'
    and ch.is_deleted = false
    and ch.created_at >= p_start_date
    and ch.created_at <= p_end_date
),
inst as (
  select i.id, coalesce(i.down_payment, 0)::numeric as down
  from installments i
  join employees e on e.id = i.employee_id and e.store_id = p_store_id
),
inst_cum as (
  select i.id,
    greatest(0, coalesce(sum(ih.credit_amount - coalesce(ih.debit_amount, 0))
      filter (where ih.transaction_date <  p_start_date), 0) - i.down) as interest_start,
    greatest(0, coalesce(sum(ih.credit_amount - coalesce(ih.debit_amount, 0))
      filter (where ih.transaction_date <= p_end_date),   0) - i.down) as interest_end
  from inst i
  left join installment_history ih
    on ih.installment_id = i.id
   and ih.transaction_type = 'payment'
   and ih.is_deleted is not true
  group by i.id, i.down
),
inst_sum as (
  select coalesce(sum(interest_end - interest_start), 0)::numeric as v
  from inst_cum
)
select pawn_sum.v, credit_sum.v, inst_sum.v
from pawn_sum, credit_sum, inst_sum;
$$;

-- 2) Chi tiết lãi trả góp PHÁT SINH TRONG KỲ (thay cách hiển thị lũy kế của
--    rpc_installment_interest_detail — RPC cũ giữ nguyên, không xóa).
--    Chỉ trả các HĐ có lãi thay đổi trong kỳ; interest_in_range có thể âm nếu hủy đóng.
create or replace function public.rpc_installment_interest_detail_in_range(
  p_store_id   uuid,
  p_start_date timestamptz,
  p_end_date   timestamptz
) returns table (
  installment_id     uuid,
  contract_code      text,
  customer_name      text,
  installment_amount numeric,
  interest_in_range  numeric
) language sql stable as $$
with inst as (
  select i.id, i.contract_code, i.installment_amount::numeric as amt,
         coalesce(i.down_payment, 0)::numeric as down, cu.name as customer_name
  from installments i
  join employees e on e.id = i.employee_id and e.store_id = p_store_id
  left join customers cu on cu.id = i.customer_id
),
cum as (
  select i.id,
    greatest(0, coalesce(sum(ih.credit_amount - coalesce(ih.debit_amount, 0))
      filter (where ih.transaction_date <  p_start_date), 0) - i.down) as interest_start,
    greatest(0, coalesce(sum(ih.credit_amount - coalesce(ih.debit_amount, 0))
      filter (where ih.transaction_date <= p_end_date),   0) - i.down) as interest_end
  from inst i
  left join installment_history ih
    on ih.installment_id = i.id
   and ih.transaction_type = 'payment'
   and ih.is_deleted is not true
  group by i.id, i.down
)
select i.id, i.contract_code, i.customer_name, i.amt,
       (c.interest_end - c.interest_start) as interest_in_range
from inst i
join cum c on c.id = i.id
where c.interest_end <> c.interest_start;
$$;
