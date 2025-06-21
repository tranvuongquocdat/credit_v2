create or replace function public.get_old_debt(
  p_credit_ids uuid[]
)
returns table (
  credit_id uuid,
  old_debt  numeric
)
language sql
stable
as $$
# Base set: tất cả credit_id được truyền vào và có trong bảng credits
with base as (
  select id as credit_id
  from credits
  where id = any(p_credit_ids)
),
-- Ngày thanh toán cuối cùng của mỗi credit
last_pay as (
  select credit_id,
         max(effective_date)          as last_paid_date,
         sum(credit_amount)           as paid_amount
  from credit_history
  where transaction_type = 'payment'
    and is_deleted = false
    and credit_id = any(p_credit_ids)
  group by credit_id
),
-- Tổng tiền debt_payment của mỗi credit
debt_pay as (
  select credit_id,
         sum(credit_amount - coalesce(debit_amount,0)) as debt_payment
  from credit_history
  where transaction_type = 'debt_payment'
    and is_deleted = false
    and credit_id = any(p_credit_ids)
  group by credit_id
),
-- Expected tới lần đóng lãi cuối cùng (chỉ tính nếu đã từng đóng lãi)
expected as (
  select
    lp.credit_id,
    calc_expected_until(lp.credit_id, lp.last_paid_date::date) as expected_amount
  from last_pay lp
)
select
  b.credit_id,
  (
    coalesce(e.expected_amount,0)
    - coalesce(lp.paid_amount,0)
    - coalesce(dp.debt_payment,0)
  )::numeric as old_debt
from base b
left join expected   e  on e.credit_id = b.credit_id
left join last_pay   lp on lp.credit_id = b.credit_id
left join debt_pay   dp on dp.credit_id = b.credit_id;
$$;