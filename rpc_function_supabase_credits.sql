create or replace function public.get_current_principal(
  p_credit_ids uuid[]
)
returns table (
  credit_id         uuid,
  current_principal numeric
)
language sql
stable
as $$
  with ids as (
    select unnest(p_credit_ids) as id
  ),
  delta as (
    select
      ch.credit_id,
      sum(
        case
          when ch.transaction_type = 'additional_loan'     then  coalesce(ch.debit_amount ,0)
          when ch.transaction_type = 'principal_repayment' then -coalesce(ch.credit_amount,0)
          else 0
        end
      ) as delta
    from credit_history ch
    where ch.transaction_type in ('additional_loan','principal_repayment')
      and ch.is_deleted = false
      and ch.credit_id = any(p_credit_ids)
    group by ch.credit_id
  )
  select
    ids.id,
    c.loan_amount + coalesce(d.delta,0) as current_principal
  from ids
  join credits c on c.id = ids.id
  left join delta d on d.credit_id = ids.id;
$$;

create or replace function public.get_paid_interest(
  p_credit_ids uuid[],
  p_start_date timestamptz default null,
  p_end_date   timestamptz default null
)
returns table (
  credit_id     uuid,
  paid_interest numeric
)
language sql
stable
as $$
  with ids as (
    select unnest(p_credit_ids) as id        -- bảo đảm đủ dòng
  )
  select
    ids.id as credit_id,
    coalesce(sum(ch.credit_amount), 0)::numeric as paid_interest
  from ids
  left join credit_history ch
    on ch.credit_id     = ids.id
   and ch.is_deleted    = false
   and ch.transaction_type = 'payment'
   and (p_start_date is null or ch.created_at >= p_start_date)
   and (p_end_date   is null or ch.created_at <= p_end_date)
  group by ids.id
$$;

create or replace function public.calc_interest_segment(
  p_principal   numeric,
  p_daily_rate  numeric,
  p_start       date,
  p_end         date
) returns numeric
language sql
immutable
as $$
  select case
           when p_end < p_start then 0
           else (p_end - p_start + 1)           -- số ngày
                * p_principal
                * p_daily_rate
         end;
$$;

CREATE OR REPLACE FUNCTION public.calc_expected_until(
    p_credit_id UUID,
    p_end_date  DATE          -- nên truyền date 'YYYY-MM-DD'
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $func$
DECLARE
    -- Thông tin hợp đồng
    v_credit            public.credits%ROWTYPE;

    -- Lãi suất chuẩn hoá về %/ngày (dạng thập phân, vd 0.005 = 0.5%)
    v_daily_rate        NUMERIC;

    -- Dùng để duyệt các đoạn
    v_prev_date         DATE;
    v_current_principal NUMERIC;
    v_expected          NUMERIC := 0;

    -- Bản ghi thay đổi gốc
    rec                 RECORD;

    -- Biến trung gian cho kiểu lãi UI / notation (hoà hợp với FE)
    v_ui_type           TEXT;
    v_notation          TEXT;
BEGIN
    --------------------------------------------------------------------
    -- 1. Lấy thông tin hợp đồng
    --------------------------------------------------------------------
    SELECT *
    INTO   v_credit
    FROM   public.credits
    WHERE  id = p_credit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'calc_expected_until: credit % không tồn tại', p_credit_id;
    END IF;

    --------------------------------------------------------------------
    -- 2. Xác định daily_rate (chuẩn hoá giống FE – normalizeToStandardRate)
    --------------------------------------------------------------------
    v_ui_type  := COALESCE(v_credit.interest_ui_type, 'daily');
    v_notation := COALESCE(
                    v_credit.interest_notation,
                    CASE
                        WHEN v_credit.interest_type = 'percentage'
                             THEN 'percent_per_month'
                        ELSE 'k_per_million'
                    END
                  );

    IF v_ui_type = 'daily' THEN
        IF v_notation = 'k_per_million' THEN
            -- 5k / triệu / ngày  ⇒ 0.5%/ngày  (tức 0.005 dạng decimal)
            v_daily_rate := (v_credit.interest_value * 1000)::NUMERIC / 1000000;
        ELSE
            -- 'k_per_day' – số k cố định / ngày
            v_daily_rate := (v_credit.interest_value * 1000)::NUMERIC / v_credit.loan_amount;
        END IF;

    ELSIF v_ui_type IN ('monthly_30', 'monthly_custom') THEN
        v_daily_rate := v_credit.interest_value::NUMERIC / 100 / 30;      -- %/tháng → %/ngày

    ELSIF v_ui_type = 'weekly_percent' THEN
        v_daily_rate := v_credit.interest_value::NUMERIC / 100 / 7;       -- %/tuần → %/ngày

    ELSE -- 'weekly_k'
        v_daily_rate := (v_credit.interest_value * 1000)::NUMERIC / v_credit.loan_amount / 7;
    END IF;

    --------------------------------------------------------------------
    -- 3. Khởi tạo các biến duyệt đoạn
    --------------------------------------------------------------------
    v_current_principal := v_credit.loan_amount;
    v_prev_date         := v_credit.loan_date::DATE;

    -- Nếu p_end_date nhỏ hơn ngày vay thì không có lãi
    IF p_end_date < v_prev_date THEN
        RETURN 0;
    END IF;

    --------------------------------------------------------------------
    -- 4. Duyệt qua các thay đổi gốc (thêm / trả) trước hoặc bằng p_end_date
    --------------------------------------------------------------------
    FOR rec IN
        SELECT
            effective_date::DATE          AS change_date,
            transaction_type,
            debit_amount,
            credit_amount
        FROM   public.credit_history
        WHERE  credit_id = p_credit_id
          AND  is_deleted = FALSE
          AND  transaction_type IN ('additional_loan', 'principal_repayment')
          AND  effective_date IS NOT NULL
          AND  effective_date::DATE <= p_end_date
        ORDER BY effective_date
    LOOP
        -- 4.a Tính lãi cho đoạn từ v_prev_date đến ngày trước khi change_date
        IF rec.change_date > v_prev_date THEN
            v_expected := v_expected
                       + public.calc_interest_segment(
                             v_current_principal,
                             v_daily_rate,
                             v_prev_date,
                             rec.change_date - 1
                         );
        END IF;

        -- 4.b Cập nhật principal tại change_date
        IF rec.transaction_type = 'additional_loan' THEN
            v_current_principal := v_current_principal + COALESCE(rec.debit_amount, 0);
        ELSIF rec.transaction_type = 'principal_repayment' THEN
            v_current_principal := v_current_principal - COALESCE(rec.credit_amount, 0);
        END IF;

        -- 4.c Cập nhật v_prev_date sang change_date
        v_prev_date := rec.change_date;
    END LOOP;

    --------------------------------------------------------------------
    -- 5. Tính lãi cho đoạn cuối tới p_end_date (bao gồm p_end_date)
    --------------------------------------------------------------------
    IF p_end_date >= v_prev_date THEN
        v_expected := v_expected
                   + public.calc_interest_segment(
                         v_current_principal,
                         v_daily_rate,
                         v_prev_date,
                         p_end_date::date
                     );
    END IF;

    --------------------------------------------------------------------
    -- 6. Trả kết quả (làm tròn nếu cần)
    --------------------------------------------------------------------
    RETURN ROUND(v_expected);
END;
$func$;

CREATE OR REPLACE FUNCTION public.get_expected_interest(
    p_credit_ids uuid[]
)
RETURNS TABLE(
    credit_id        uuid,
    expected_profit  numeric,   -- lãi phí cả kỳ
    interest_today   numeric    -- lãi phí tích luỹ tới CURRENT_DATE
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    /* cả kỳ: loan_date + loan_period - 1 ngày */
    public.calc_expected_until(
        c.id,
        (c.loan_date::date + (c.loan_period - 1))
    )                                                  AS expected_profit,
    /* tới hôm nay (nếu sau ngày vay) */
    CASE
      WHEN CURRENT_DATE >= c.loan_date::date
      THEN public.calc_expected_until(c.id, CURRENT_DATE)
      ELSE 0
    END                                                AS interest_today
  FROM public.credits c
  WHERE c.id = ANY(p_credit_ids);
END;
$$;

--
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

create or replace function get_next_payment_info(p_credit_ids uuid[])
returns table (
  credit_id    uuid,
  next_date    date,
  is_completed boolean,
  has_paid     boolean
)
language sql
as $$
with base as (
  select id,
         loan_date,
         loan_period,
         interest_period
  from credits
  where id = any(p_credit_ids)
),
latest_pay as (
  select credit_id,
         max(effective_date::date)  as last_paid
  from credit_history
  where transaction_type = 'payment'
    and is_deleted = false
    and credit_id = any(p_credit_ids)
  group by credit_id
)
select
  b.id as credit_id,
  case
    when lp.last_paid is null
      then b.loan_date + ((b.interest_period - 1) * INTERVAL '1 day')
    else lp.last_paid + (b.interest_period * INTERVAL '1 day')
  end as next_date,
  (case
     when lp.last_paid is null then false
     when lp.last_paid >=
       (b.loan_date + (b.loan_period - 1) * INTERVAL '1 day')
       then true
     else false
   end) as is_completed,
  (lp.last_paid is not null) as has_paid
from base b
left join latest_pay lp on lp.credit_id = b.id;
$$;

create or replace function public.get_credit_statuses(
  p_credit_ids uuid[]
)
returns table(
  credit_id   uuid,
  status_code text   -- CLOSED | OVERDUE | LATE_INTEREST | BAD_DEBT | DELETED | FINISHED | ON_TIME
) language plpgsql
as $$
declare
  r                   record;
  today               date := current_date;      -- “00:00:00” để khớp với phía TS
  contract_end_date   date;
  latest_payment_date date;
  next_interest_date  date;
  iperiod             int;
begin
  for r in
    select  c.id,
            c.status::text,          -- enum credit_status
            c.loan_date,
            c.loan_period,
            coalesce(c.interest_period,30) as int_period
    from    credits c
    where   c.id = any (p_credit_ids)
  loop
    -- 1.  Trạng thái đã cố định trong c.status → chỉ cần map
    if r.status in ('closed','deleted','bad_debt') then
      status_code := upper(r.status);          -- → CLOSED | DELETED | BAD_DEBT
      credit_id   := r.id;   return next;      -- sang record tiếp theo
      continue;
    end if;

    -- 2.  Hợp đồng ON_TIME → tính thêm
    contract_end_date := r.loan_date
                     + (r.loan_period - 1) * interval '1 day';
    if contract_end_date < today then
      status_code := 'OVERDUE';  credit_id := r.id;  return next;  continue;
    end if;

    -- 3.  Lấy ngày thanh toán lãi gần nhất
    select max(effective_date)::date
    into   latest_payment_date
    from   credit_history
    where  credit_history.credit_id = r.id and is_deleted = false and transaction_type = 'payment';

    -- 3a. Hoàn thành
    if latest_payment_date is not null
       and latest_payment_date = contract_end_date then
       status_code := 'FINISHED';  credit_id := r.id;  return next;  continue;
    end if;

    -- 4.  Tính hạn đóng lãi kế tiếp → chậm lãi?
    iperiod := r.int_period;
    next_interest_date :=
      coalesce(latest_payment_date, r.loan_date)
      + iperiod * interval '1 day';

    if next_interest_date <= today then
      status_code := 'LATE_INTEREST';
    else
      status_code := 'ON_TIME';
    end if;

    credit_id := r.id;
    return next;
  end loop;
end;
$$;