-- Money-by-day: cho vay + nợ cũ theo từng ngày, tái dựng từ lịch sử.
-- QĐ-1: mốc "tính đến ngày X" = created_at::date <= X (ngày ghi = ngày thực trả).
-- QĐ-2: "đang chạy tại X" = loan_date<=X và sự kiện đóng/mở/xoá MỚI NHẤT (created_at<=X) không phải close/delete.
-- ADDITIVE: không sửa RPC/hàm cũ. Chỉ ĐỌC + gọi calc_expected_until / calc_pawn_expected_until.
create or replace function public.rpc_money_by_day_loans_debt(
  p_store_id   uuid,
  p_start_date date,
  p_end_date   date
)
returns table (
  as_of_date       date,
  pawn_loan        numeric,
  credit_loan      numeric,
  installment_loan numeric,
  pawn_debt        numeric,
  credit_debt      numeric,
  installment_debt numeric
)
language sql
stable
as $$
with days as (
  select generate_series(p_start_date, p_end_date, interval '1 day')::date as d
),
inst as (
  select i.id, i.loan_date::date as ld, i.installment_amount::numeric as amt, i.loan_period::numeric as period
  from installments i
  join employees e on e.id = i.employee_id
  where e.store_id = p_store_id
),
cr as (
  select c.id, c.loan_date::date as ld, c.loan_amount::numeric as amt
  from credits c where c.store_id = p_store_id
),
pw as (
  select p.id, p.loan_date::date as ld, p.loan_amount::numeric as amt
  from pawns p where p.store_id = p_store_id
),
-- ================= INSTALLMENTS =================
inst_calc as (
  select dy.d,
    sum(case when i.ld <= dy.d and coalesce(st.reopened, true)
             then i.amt - coalesce(p.paid, 0) else 0 end) as loan,
    sum(case when i.ld <= dy.d and coalesce(st.reopened, true)
             then (case when p.maxeff is null then 0
                        else (p.maxeff - p.mineff + 1) * i.amt / nullif(i.period, 0) end)
                  - coalesce(p.paid, 0) - coalesce(dp.dpaid, 0)
             else 0 end) as debt
  from days dy cross join inst i
  left join lateral (
    select sum(credit_amount - coalesce(debit_amount,0)) as paid,
           min(effective_date::date) as mineff, max(effective_date::date) as maxeff
    from installment_history
    where installment_id = i.id and transaction_type='payment' and is_deleted=false
      and created_at::date <= dy.d
  ) p on true
  left join lateral (
    select sum(credit_amount - coalesce(debit_amount,0)) as dpaid
    from installment_history
    where installment_id = i.id and transaction_type='debt_payment' and is_deleted=false
      and created_at::date <= dy.d
  ) dp on true
  left join lateral (
    select (transaction_type='contract_reopen') as reopened
    from installment_history
    where installment_id = i.id
      and transaction_type in ('contract_close','contract_delete','contract_reopen')
      and is_deleted=false and created_at::date <= dy.d
    order by created_at desc limit 1
  ) st on true
  group by dy.d
),
-- ================= CREDITS =================
cr_calc as (
  select dy.d,
    sum(case when c.ld <= dy.d and coalesce(st.reopened, true)
             then c.amt + coalesce(pr.delta,0) else 0 end) as loan,
    sum(case when c.ld <= dy.d and coalesce(st.reopened, true)
             then (case when p.last_eff is null then 0
                        else coalesce(public.calc_expected_until(c.id, p.last_eff), 0) end)
                  - coalesce(p.paid,0) - coalesce(dp.dpaid,0)
             else 0 end) as debt
  from days dy cross join cr c
  left join lateral (
    select max(effective_date::date) as last_eff, sum(credit_amount) as paid
    from credit_history
    where credit_id=c.id and transaction_type='payment' and is_deleted=false
      and created_at::date <= dy.d
  ) p on true
  left join lateral (
    select sum(credit_amount - coalesce(debit_amount,0)) as dpaid
    from credit_history
    where credit_id=c.id and transaction_type='debt_payment' and is_deleted=false
      and created_at::date <= dy.d
  ) dp on true
  left join lateral (
    select sum(case when transaction_type='additional_loan' then coalesce(debit_amount,0)
                    when transaction_type='principal_repayment' then -coalesce(credit_amount,0)
                    else 0 end) as delta
    from credit_history
    where credit_id=c.id and transaction_type in ('additional_loan','principal_repayment')
      and is_deleted=false and created_at::date <= dy.d
  ) pr on true
  left join lateral (
    select (transaction_type='contract_reopen') as reopened
    from credit_history
    where credit_id=c.id
      and transaction_type in ('contract_close','contract_delete','contract_reopen')
      and is_deleted=false and created_at::date <= dy.d
    order by created_at desc limit 1
  ) st on true
  group by dy.d
),
-- ================= PAWNS =================
pw_calc as (
  select dy.d,
    sum(case when w.ld <= dy.d and coalesce(st.reopened, true)
             then w.amt + coalesce(pr.delta,0) else 0 end) as loan,
    sum(case when w.ld <= dy.d and coalesce(st.reopened, true)
             then (case when p.last_eff is null then 0
                        else coalesce(public.calc_pawn_expected_until(w.id, p.last_eff), 0) end)
                  - coalesce(p.paid,0) - coalesce(dp.dpaid,0)
             else 0 end) as debt
  from days dy cross join pw w
  left join lateral (
    select max(effective_date::date) as last_eff, sum(credit_amount) as paid
    from pawn_history
    where pawn_id=w.id and transaction_type='payment' and is_deleted=false
      and created_at::date <= dy.d
  ) p on true
  left join lateral (
    select sum(credit_amount - coalesce(debit_amount,0)) as dpaid
    from pawn_history
    where pawn_id=w.id and transaction_type='debt_payment' and is_deleted=false
      and created_at::date <= dy.d
  ) dp on true
  left join lateral (
    select sum(case when transaction_type='additional_loan' then coalesce(debit_amount,0)
                    when transaction_type='principal_repayment' then -coalesce(credit_amount,0)
                    else 0 end) as delta
    from pawn_history
    where pawn_id=w.id and transaction_type in ('additional_loan','principal_repayment')
      and is_deleted=false and created_at::date <= dy.d
  ) pr on true
  left join lateral (
    select (transaction_type='contract_reopen') as reopened
    from pawn_history
    where pawn_id=w.id
      and transaction_type in ('contract_close','contract_delete','contract_reopen')
      and is_deleted=false and created_at::date <= dy.d
    order by created_at desc limit 1
  ) st on true
  group by dy.d
)
select
  d.d as as_of_date,
  coalesce(pw_calc.loan,0)   as pawn_loan,
  coalesce(cr_calc.loan,0)   as credit_loan,
  coalesce(inst_calc.loan,0) as installment_loan,
  coalesce(pw_calc.debt,0)   as pawn_debt,
  coalesce(cr_calc.debt,0)   as credit_debt,
  coalesce(inst_calc.debt,0) as installment_debt
from days d
left join inst_calc on inst_calc.d = d.d
left join cr_calc   on cr_calc.d   = d.d
left join pw_calc   on pw_calc.d   = d.d
order by d.d;
$$;
