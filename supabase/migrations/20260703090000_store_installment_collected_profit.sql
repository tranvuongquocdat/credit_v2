-- Fix bug cắt 1000 dòng ở "Lãi phí đã thu" trả góp (dashboard + tổng quan cửa hàng):
-- FE cũ lấy mảng id closed (Nam sms 1178 id → cắt còn 1000) rồi truyền vào
-- installment_get_collected_profit; response RPC cũng bị PostgREST cắt 1000 dòng.
-- Cách fix: RPC store-level tính TỔNG ngay trong DB (SQL không có row cap),
-- tái dùng nguyên installment_get_collected_profit để công thức khớp 100%.
-- ADDITIVE: chỉ thêm RPC mới, không sửa RPC cũ (v1 + v2 dùng chung DB).
--
-- Semantics: tổng profit_collected (tháng hiện tại, công thức B-A) của MỌI hợp đồng
-- trả góp thuộc store trừ status 'deleted' — khớp cả 2 caller hiện tại:
--   - lib/overview.ts:      on_time + closed + finished  (data thực tế không có finished)
--   - useInstallmentsSummary: status_code active + CLOSED (= mọi status trừ deleted)

create or replace function public.rpc_store_installment_collected_profit(
  p_store_id uuid
) returns numeric
language sql stable as $$
  select coalesce(sum(p.profit_collected), 0)::numeric
  from installment_get_collected_profit(
    (
      select coalesce(array_agg(i.id), '{}'::uuid[])
      from installments i
      join employees e on e.id = i.employee_id and e.store_id = p_store_id
      where i.status <> 'deleted'
    )
  ) p;
$$;
