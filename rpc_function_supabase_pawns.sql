create or replace function public.get_pawn_current_principal(
  p_pawn_ids uuid[]
)
returns table (
  pawn_id         uuid,
  current_principal numeric
)
language sql
stable
as $$
  with ids as (
    select unnest(p_pawn_ids) as id
  ),
  delta as (
    select
      ph.pawn_id,
      sum(
        case
          when ph.transaction_type = 'additional_loan'     then  coalesce(ph.debit_amount ,0)
          when ph.transaction_type = 'principal_repayment' then -coalesce(ph.credit_amount,0)
          else 0
        end
      ) as delta
    from pawn_history ph
    where ph.transaction_type in ('additional_loan','principal_repayment')
      and ph.is_deleted = false
      and ph.pawn_id = any(p_pawn_ids)
    group by ph.pawn_id
  )
  select
    ids.id,
    p.loan_amount + coalesce(d.delta,0) as current_principal
  from ids
  join pawns p on p.id = ids.id
  left join delta d on d.pawn_id = ids.id;
$$;

create or replace function public.get_pawn_paid_interest(
  p_pawn_ids uuid[],
  p_start_date timestamptz default null,
  p_end_date   timestamptz default null
)
returns table (
  pawn_id     uuid,
  paid_interest numeric
)
language sql
stable
as $$
  with ids as (
    select unnest(p_pawn_ids) as id        -- bảo đảm đủ dòng
  )
  select
    ids.id as pawn_id,
    coalesce(sum(ph.credit_amount), 0)::numeric as paid_interest
  from ids
  left join pawn_history ph
    on ph.pawn_id     = ids.id
   and ph.is_deleted    = false
   and ph.transaction_type = 'payment'
   and (p_start_date is null or ph.created_at >= p_start_date)
   and (p_end_date   is null or ph.created_at <= p_end_date)
  group by ids.id
$$;

create or replace function public.calc_pawn_pawn_interest_segment(
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

CREATE OR REPLACE FUNCTION public.calc_pawn_expected_until(
    p_pawn_id UUID,
    p_end_date  DATE          -- nên truyền date 'YYYY-MM-DD'
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $func$
DECLARE
    -- Thông tin hợp đồng
    v_pawn            public.pawns%ROWTYPE;

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
    INTO   v_pawn
    FROM   public.pawns
    WHERE  id = p_pawn_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'calc_expected_until: pawn % không tồn tại', p_pawn_id;
    END IF;

    --------------------------------------------------------------------
    -- 2. Xác định daily_rate (chuẩn hoá giống FE – normalizeToStandardRate)
    --------------------------------------------------------------------
    v_ui_type  := COALESCE(v_pawn.interest_ui_type, 'daily');
    v_notation := COALESCE(
                    v_pawn.interest_notation,
                    CASE
                        WHEN v_pawn.interest_type = 'percentage'
                             THEN 'percent_per_month'
                        ELSE 'k_per_million'
                    END
                  );

    IF v_ui_type = 'daily' THEN
        IF v_notation = 'k_per_million' THEN
            -- 5k / triệu / ngày  ⇒ 0.5%/ngày  (tức 0.005 dạng decimal)
            v_daily_rate := (v_pawn.interest_value * 1000)::NUMERIC / 1000000;
        ELSE
            -- 'k_per_day' – số k cố định / ngày
            v_daily_rate := (v_pawn.interest_value * 1000)::NUMERIC / v_pawn.loan_amount;
        END IF;

    ELSIF v_ui_type IN ('monthly_30', 'monthly_custom') THEN
        v_daily_rate := v_pawn.interest_value::NUMERIC / 100 / 30;      -- %/tháng → %/ngày

    ELSIF v_ui_type = 'weekly_percent' THEN
        v_daily_rate := v_pawn.interest_value::NUMERIC / 100 / 7;       -- %/tuần → %/ngày

    ELSE -- 'weekly_k'
        v_daily_rate := (v_pawn.interest_value * 1000)::NUMERIC / v_pawn.loan_amount / 7;
    END IF;

    --------------------------------------------------------------------
    -- 3. Khởi tạo các biến duyệt đoạn
    --------------------------------------------------------------------
    v_current_principal := v_pawn.loan_amount;
    v_prev_date         := v_pawn.loan_date::DATE;

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
        FROM   public.pawn_history
        WHERE  pawn_id = p_pawn_id
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

CREATE OR REPLACE FUNCTION public.get_pawn_expected_interest(
    p_pawn_ids uuid[]
)
RETURNS TABLE(
    pawn_id        uuid,
    expected_profit  numeric,   -- lãi phí cả kỳ
    interest_today   numeric    -- lãi phí tích luỹ tới CURRENT_DATE
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    /* cả kỳ: loan_date + loan_period - 1 ngày */
    public.calc_expected_until(
        p.id,
        (p.loan_date::date + (p.loan_period - 1))
    )                                                  AS expected_profit,
    /* tới hôm nay (nếu sau ngày vay) */
    CASE
      WHEN CURRENT_DATE >= p.loan_date::date
      THEN public.calc_expected_until(p.id, CURRENT_DATE)
      ELSE 0
    END                                                AS interest_today
  FROM public.pawns p
  WHERE p.id = ANY(p_pawn_ids);
END;
$$;

--
create or replace function public.get_pawn_old_debt(
  p_pawn_ids uuid[]
)
returns table (
  pawn_id uuid,
  old_debt  numeric
)
language sql
stable
as $$
with base as (
  select id as pawn_id
  from pawns
  where id = any(p_pawn_ids)
),
-- Ngày thanh toán cuối cùng của mỗi pawn
last_pay as (
  select pawn_id,
         max(effective_date)          as last_paid_date,
         sum(credit_amount)           as paid_amount
  from pawn_history
  where transaction_type = 'payment'
    and is_deleted = false
    and pawn_id = any(p_pawn_ids)
  group by pawn_id
),
-- Tổng tiền debt_payment của mỗi credit
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
    calc_expected_until(lp.pawn_id, lp.last_paid_date::date) as expected_amount
  from last_pay lp
)
select
  b.pawn_id,
  (
    coalesce(e.expected_amount,0)
    - coalesce(lp.paid_amount,0)
    - coalesce(dp.debt_payment,0)
  )::numeric as old_debt
from base b
left join expected   e  on e.pawn_id = b.pawn_id
left join last_pay   lp on lp.pawn_id = b.pawn_id
left join debt_pay   dp on dp.pawn_id = b.pawn_id;
$$;

create or replace function get_pawn_next_payment_info(p_pawn_ids uuid[])
returns table (
  pawn_id    uuid,
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
         interest_period,
         is_advance_payment
  from pawns
  where id = any(p_pawn_ids)
),
latest_pay as (
  select pawn_id,
         max(effective_date::date)  as last_paid
  from pawn_history
  where transaction_type = 'payment'
    and is_deleted = false
    and pawn_id = any(p_pawn_ids)
  group by pawn_id
)
select
  b.id as pawn_id,
  case
    -- Hợp đồng thu lãi trước (đã có thanh toán): hạn = ngày đầu kỳ kế (last_paid + 1)
    when b.is_advance_payment and lp.last_paid is not null
      then lp.last_paid + INTERVAL '1 day'
    -- Còn lại: giữ logic cũ (ngày cuối kỳ)
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
left join latest_pay lp on lp.pawn_id = b.id;
$$;

create or replace function public.get_pawn_statuses(
  p_pawn_ids uuid[]
)
returns table(
  pawn_id   uuid,
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
    select  p.id,
            p.status::text,          -- enum pawn_status
            p.loan_date,
            p.loan_period,
            coalesce(p.interest_period,30) as int_period,
            p.is_advance_payment
    from    pawns p
    where   p.id = any (p_pawn_ids)
  loop
    -- 1.  Trạng thái đã cố định trong c.status → chỉ cần map
    if r.status in ('closed','deleted','bad_debt') then
      status_code := upper(r.status);          -- → CLOSED | DELETED | BAD_DEBT
      pawn_id   := r.id;   return next;      -- sang record tiếp theo
      continue;
    end if;

    -- 2.  Hợp đồng ON_TIME → tính thêm
    contract_end_date := r.loan_date
                     + (r.loan_period - 1) * interval '1 day';
    if contract_end_date < today then
      status_code := 'OVERDUE';  pawn_id := r.id;  return next;  continue;
    end if;

    -- 3.  Lấy ngày thanh toán lãi gần nhất
    select max(effective_date)::date
    into   latest_payment_date
    from   pawn_history
    where  pawn_history.pawn_id = r.id and is_deleted = false and transaction_type = 'payment';

    -- 3a. Hoàn thành
    if latest_payment_date is not null
       and latest_payment_date = contract_end_date then
       status_code := 'FINISHED';  pawn_id := r.id;  return next;  continue;
    end if;

    -- 4.  Tính hạn đóng lãi kế tiếp → chậm lãi?
    iperiod := r.int_period;
    if r.is_advance_payment and latest_payment_date is not null then
      -- Hợp đồng thu lãi trước: hạn = ngày đầu kỳ kế (last_paid + 1)
      -- → trễ khi today >= last_paid + 2 (1 ngày sau hạn)
      next_interest_date := latest_payment_date + interval '2 day';
    else
      next_interest_date :=
        coalesce(latest_payment_date, r.loan_date)
        + iperiod * interval '1 day';
    end if;

    if next_interest_date <= today then
      status_code := 'LATE_INTEREST';
    else
      status_code := 'ON_TIME';
    end if;

    pawn_id := r.id;
    return next;
  end loop;
end;
$$;

create or replace function public.pawn_get_totals(
  p_store_id uuid,
  p_filters  jsonb default null
)
returns table (
  total_loan_amount    numeric,   -- số tiền đang cho vay thực tế
  total_paid_interest  numeric,   -- lãi phí đã đóng
  total_old_debt       numeric,   -- nợ cũ
  total_interest_today numeric    -- lãi phí tính đến hôm nay
)
language sql
as $$
/* 1. Lấy pawns theo filter cơ bản (chưa tính due_tomorrow) */
with base as (
  select *
  from   pawns p
  where  p.store_id = p_store_id

    /* ----- status (loại trừ các trạng thái đặc biệt tính động) ----- */
    and (
          coalesce(p_filters->>'status','') in ('', 'all', 'due_tomorrow', 'overdue', 'late_interest')
          or p.status = (p_filters->>'status')::pawn_status
        )

    /* ----- contract_code LIKE ----- */
    and (
          coalesce(p_filters->>'contract_code','') = ''
          or p.contract_code ilike '%' || (p_filters->>'contract_code') || '%'
        )

    /* ----- loan_period = duration ----- */
    and (
          coalesce(p_filters->>'duration','') = ''
          or p.loan_period = (p_filters->>'duration')::int
        )

    /* ----- loan_date range ----- */
    and (
          coalesce(p_filters->>'start_date','') = ''
          or p.loan_date >= (p_filters->>'start_date')::date
        )
    and (
          coalesce(p_filters->>'end_date','') = ''
          or (p.loan_date - INTERVAL '1 day' + INTERVAL '1 day' * p.loan_period)::date <= (p_filters->>'end_date')::date
        )

    /* ----- customer_name LIKE ----- */
    and (
          coalesce(p_filters->>'customer_name','') = ''
          or exists (
               select 1
               from   customers cu
               where  cu.id = p.customer_id
                 and  (cu.name ilike '%' || (p_filters->>'customer_name') || '%'
                       or unaccent(cu.name) ilike unaccent('%' || (p_filters->>'customer_name') || '%'))
          )
        )
),

/* 2. Lọc thêm khi client yêu cầu các trạng thái đặc biệt */
base2 as (
  select b.*
  from   base b
  where
    /* -------------------------------------------------------------
       Các trường hợp không phải status đặc biệt → giữ nguyên hàng
       ------------------------------------------------------------- */
    (p_filters->>'status' is null
     or p_filters->>'status' = ''
     or p_filters->>'status' = 'all'
     or p_filters->>'status' not in ('due_tomorrow', 'overdue', 'late_interest'))

    /* -------------------- status = due_tomorrow ------------------ */
    or (
      p_filters->>'status' = 'due_tomorrow'
      and exists (
        select 1
        from   get_pawn_next_payment_info( array[b.id] ) np
        where  np.pawn_id = b.id
          and  np.next_date = (current_date + interval '1 day')::date
      )
    )

    /* -------------------- status = overdue ----------------------- */
    or (
      p_filters->>'status' = 'overdue'
      and exists (
        select 1
        from   get_pawn_statuses( array[b.id] ) st
        where  st.pawn_id  = b.id
          and  st.status_code = 'OVERDUE'
      )
    )

    /* -------------------- status = late_interest ----------------- */
    or (
      p_filters->>'status' = 'late_interest'
      and exists (
        select 1
        from   get_pawn_statuses( array[b.id] ) st
        where  st.pawn_id  = b.id
          and  st.status_code = 'LATE_INTEREST'
      )
    )
),

/* 3. Gom ID thành mảng */
ids as ( select array_agg(id) arr_ids from base2 ),

/* 4. Các số liệu phụ y chang logic React ----------------------------- */

/* 4.1 Tiền thực vay (principal hiện tại) */
principal as (
  select p.pawn_id, p.current_principal
  from   ids
  join   lateral get_pawn_current_principal(arr_ids) p on true
),

/* 4.2 Lãi phí đã đóng (tổng toàn đời hợp đồng)*/
paid_int as (
  select i.pawn_id,
         i.paid_interest
  from   ids
  join   lateral get_pawn_paid_interest(arr_ids) i  -- ⬅ hàm đã có
        on true
),

/* 4.3 Nợ cũ */
old_debt as (
  select d.pawn_id, d.old_debt
  from   ids
  join   lateral get_pawn_old_debt(arr_ids) d on true
),

/* 4.4 Lãi phí tính đến hôm nay */
today_int as (
  select e.pawn_id, e.interest_today
  from   ids
  join   lateral get_pawn_expected_interest(arr_ids) e on true
)

/* 5. SUM kết quả ------------------------------------------------------ */
select
  sum(coalesce(pr.current_principal, b.loan_amount)) as total_loan_amount,
  sum(coalesce(pi.paid_interest,0))                 as total_paid_interest,
  sum(coalesce(od.old_debt,0))                      as total_old_debt,
  sum(coalesce(ti.interest_today,0))                as total_interest_today
from base2 b
left join principal pr on pr.pawn_id = b.id
left join paid_int  pi on pi.pawn_id = b.id
left join old_debt  od on od.pawn_id = b.id
left join today_int ti on ti.pawn_id = b.id;
$$;