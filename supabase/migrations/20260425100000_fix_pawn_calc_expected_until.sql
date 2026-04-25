-- Fix: get_pawn_old_debt và get_pawn_expected_interest đang gọi nhầm
-- calc_expected_until (function của credits) thay vì calc_pawn_expected_until.
-- Hậu quả: bất kỳ truy vấn nào đụng 2 hàm này (vd. pawn_get_totals, usePawnsSummary)
-- đều RAISE 'calc_expected_until: credit X không tồn tại' → JS nhận error → ô tổng / dòng tổng = 0 hoặc trống.
--
-- Logic body giữ NGUYÊN, chỉ swap tên function gọi.

CREATE OR REPLACE FUNCTION public.get_pawn_expected_interest(
    p_pawn_ids uuid[]
)
RETURNS TABLE(
    pawn_id          uuid,
    expected_profit  numeric,
    interest_today   numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    /* cả kỳ: loan_date + loan_period - 1 ngày */
    public.calc_pawn_expected_until(
        p.id,
        (p.loan_date::date + (p.loan_period - 1))
    )                                                  AS expected_profit,
    /* tới hôm nay (nếu sau ngày vay) */
    CASE
      WHEN CURRENT_DATE >= p.loan_date::date
      THEN public.calc_pawn_expected_until(p.id, CURRENT_DATE)
      ELSE 0
    END                                                AS interest_today
  FROM public.pawns p
  WHERE p.id = ANY(p_pawn_ids);
END;
$$;


CREATE OR REPLACE FUNCTION public.get_pawn_old_debt(
  p_pawn_ids uuid[]
)
RETURNS TABLE (
  pawn_id  uuid,
  old_debt numeric
)
LANGUAGE sql
STABLE
AS $$
with base as (
  select id as pawn_id
  from pawns
  where id = any(p_pawn_ids)
),
-- Ngày thanh toán cuối cùng của mỗi pawn
last_pay as (
  select pawn_id,
         max(effective_date) as last_paid_date,
         sum(credit_amount)  as paid_amount
  from pawn_history
  where transaction_type = 'payment'
    and is_deleted = false
    and pawn_id = any(p_pawn_ids)
  group by pawn_id
),
-- Tổng tiền debt_payment của mỗi pawn
debt_pay as (
  select pawn_id,
         sum(credit_amount - coalesce(debit_amount,0)) as debt_payment
  from pawn_history
  where transaction_type = 'debt_payment'
    and is_deleted = false
    and pawn_id = any(p_pawn_ids)
  group by pawn_id
),
-- Expected tới lần đóng lãi cuối cùng (chỉ tính nếu đã từng đóng lãi)
expected as (
  select
    lp.pawn_id,
    public.calc_pawn_expected_until(lp.pawn_id, lp.last_paid_date::date) as expected_amount
  from last_pay lp
)
select
  b.pawn_id,
  (
    coalesce(e.expected_amount, 0)
    - coalesce(lp.paid_amount,  0)
    - coalesce(dp.debt_payment, 0)
  )::numeric as old_debt
from base b
left join expected e  on e.pawn_id  = b.pawn_id
left join last_pay lp on lp.pawn_id = b.pawn_id
left join debt_pay dp on dp.pawn_id = b.pawn_id;
$$;
