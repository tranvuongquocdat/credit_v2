-- Money-by-day: cho vay + nợ cũ theo từng ngày, tái dựng từ lịch sử.
-- QĐ-1: mốc "tính đến ngày X" = created_at::date <= X (ngày ghi = ngày thực trả).
-- QĐ-2: "đang chạy tại X" = loan_date<=X và sự kiện đóng/mở/xoá MỚI NHẤT (created_at<=X) không phải close/delete.
-- ADDITIVE: không sửa RPC/hàm cũ. Chỉ ĐỌC + gọi calc_expected_until / calc_pawn_expected_until.
-- Installment tối ưu bằng window cumulative (O(ngày×HĐ)); credit/pawn dùng lateral (số lượng nhỏ/​store).
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
-- ================= INSTALLMENTS (window cumulative) =================
-- payment gộp theo (HĐ, ngày ghi)
ipay as (
  select installment_id as id, created_at::date as cd,
         sum(credit_amount - coalesce(debit_amount,0)) as pd,
         min(effective_date::date) as mineff, max(effective_date::date) as maxeff
  from installment_history
  where transaction_type='payment' and is_deleted=false
    and installment_id in (select id from inst)
  group by installment_id, created_at::date
),
idp as (
  select installment_id as id, created_at::date as cd,
         sum(credit_amount - coalesce(debit_amount,0)) as dpd
  from installment_history
  where transaction_type='debt_payment' and is_deleted=false
    and installment_id in (select id from inst)
  group by installment_id, created_at::date
),
-- seed trước dải (cd < p_start_date) để cumulative không sót lịch sử cũ
ipre as (
  select id,
         sum(case when cd < p_start_date then pd else 0 end) as pd0,
         max(case when cd < p_start_date then maxeff end) as maxeff0,
         min(case when cd < p_start_date then mineff end) as mineff0
  from ipay group by id
),
idppre as (
  select id, sum(case when cd < p_start_date then dpd else 0 end) as dpd0
  from idp group by id
),
-- sự kiện đóng/mở/xoá (ít dòng/HĐ)
istat as (
  select installment_id as id, created_at::date as cd,
         (transaction_type='contract_reopen') as reopened
  from installment_history
  where transaction_type in ('contract_close','contract_delete','contract_reopen')
    and is_deleted=false and installment_id in (select id from inst)
),
inst_cum as (
  select g.d, i.id, i.ld, i.amt, i.period,
         coalesce(pre.pd0,0)  + sum(coalesce(ip.pd,0))  over w as paid,
         coalesce(dpp.dpd0,0) + sum(coalesce(dp.dpd,0)) over w as dpaid,
         greatest(pre.maxeff0, max(ip.maxeff) over w) as maxeff,
         least(pre.mineff0,   min(ip.mineff) over w) as mineff
  from days g
  cross join inst i
  left join ipay   ip  on ip.id = i.id and ip.cd = g.d
  left join idp    dp  on dp.id = i.id and dp.cd = g.d
  left join ipre   pre on pre.id = i.id
  left join idppre dpp on dpp.id = i.id
  where i.ld <= g.d
  window w as (partition by i.id order by g.d rows between unbounded preceding and current row)
),
inst_calc as (
  select x.d,
    sum(case when active then x.amt - x.paid else 0 end) as loan,
    sum(case when active then
          (case when x.maxeff is null then 0
                else (x.maxeff - x.mineff + 1) * x.amt / nullif(x.period,0) end)
          - x.paid - x.dpaid
        else 0 end) as debt
  from (
    select c.*, coalesce(st.reopened, true) as active
    from inst_cum c
    left join lateral (
      select reopened from istat s
      where s.id = c.id and s.cd <= c.d
      order by s.cd desc limit 1
    ) st on true
  ) x
  group by x.d
),
-- ================= CREDITS (lateral; số lượng nhỏ/​store) =================
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
-- ================= PAWNS (lateral; số lượng nhỏ/​store) =================
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
