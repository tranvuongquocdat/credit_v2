-- Chi tiết lãi trả góp theo kỳ: mỗi HĐ trả 'lãi lũy kế đến cuối kỳ' (khớp JS interestDetail).
-- credit_amount thuần + transaction_date (timestamptz instant khớp startOfDay/endOfDay JS).
-- Chỉ HĐ có interestAtEnd <> interestAtStart. Lặp MỌI HĐ store bất kể status. ADDITIVE.
create or replace function public.rpc_installment_interest_detail(
  p_store_id uuid, p_start_date timestamptz, p_end_date timestamptz
) returns table (
  installment_id     uuid,
  contract_code      text,
  customer_name      text,
  installment_amount numeric,
  interest_through_end numeric
) language sql stable as $$
with inst as (
  select i.id, i.contract_code, i.installment_amount::numeric as amt,
         coalesce(i.down_payment,0)::numeric as down, cu.name as customer_name
  from installments i
  join employees e on e.id = i.employee_id and e.store_id = p_store_id
  left join customers cu on cu.id = i.customer_id
),
cum as (
  select i.id, i.down,
    greatest(0, coalesce(sum(ih.credit_amount) filter (where ih.transaction_date <  p_start_date), 0) - i.down) as interest_start,
    greatest(0, coalesce(sum(ih.credit_amount) filter (where ih.transaction_date <= p_end_date),   0) - i.down) as interest_end
  from inst i
  left join installment_history ih
    on ih.installment_id = i.id and ih.transaction_type = 'payment' and ih.is_deleted is not true
  group by i.id, i.down
)
select i.id, i.contract_code, i.customer_name, i.amt, c.interest_end
from inst i join cum c on c.id = i.id
where c.interest_end <> c.interest_start;
$$;
