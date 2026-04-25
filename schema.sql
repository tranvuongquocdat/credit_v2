

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."credit_status" AS ENUM (
    'on_time',
    'overdue',
    'late_interest',
    'bad_debt',
    'closed',
    'deleted'
);


ALTER TYPE "public"."credit_status" OWNER TO "postgres";


CREATE TYPE "public"."credit_transaction_type" AS ENUM (
    'principal_repayment',
    'additional_loan',
    'initial_loan',
    'payment',
    'payment_cancel',
    'contract_close',
    'contract_reopen',
    'cancel_additional_loan',
    'cancel_principal_repayment',
    'contract_extension',
    'contract_delete',
    'debt_payment',
    'update_contract'
);


ALTER TYPE "public"."credit_transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."installment_payment_status" AS ENUM (
    'pending',
    'paid',
    'partial',
    'overdue',
    'cancelled'
);


ALTER TYPE "public"."installment_payment_status" OWNER TO "postgres";


CREATE TYPE "public"."installment_status" AS ENUM (
    'on_time',
    'overdue',
    'late_interest',
    'bad_debt',
    'closed',
    'deleted',
    'finished'
);


ALTER TYPE "public"."installment_status" OWNER TO "postgres";


CREATE TYPE "public"."installment_transaction_type" AS ENUM (
    'payment',
    'payment_cancel',
    'contract_close',
    'contract_reopen',
    'initial_loan',
    'contract_delete'
);


ALTER TYPE "public"."installment_transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."interest_type" AS ENUM (
    'percentage',
    'fixed_amount'
);


ALTER TYPE "public"."interest_type" OWNER TO "postgres";


CREATE TYPE "public"."pawn_status" AS ENUM (
    'on_time',
    'overdue',
    'late_interest',
    'bad_debt',
    'closed',
    'deleted'
);


ALTER TYPE "public"."pawn_status" OWNER TO "postgres";


CREATE TYPE "public"."pawn_transaction_type" AS ENUM (
    'payment',
    'initial_loan',
    'principal_repayment',
    'contract_close',
    'additional_loan',
    'payment_cancel',
    'contract_reopen',
    'cancel_additional_loan',
    'cancel_principal_repayment',
    'contract_delete',
    'debt_payment',
    'update_contract'
);


ALTER TYPE "public"."pawn_transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_period_status" AS ENUM (
    'pending',
    'paid',
    'overdue',
    'partially_paid'
);


ALTER TYPE "public"."payment_period_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calc_expected_until"("p_credit_id" "uuid", "p_end_date" "date") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
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

    -- DEBUG
    v_segment_interest  NUMERIC;
    v_days              INT;
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

    RAISE LOG '===> credit %, daily_rate %', p_credit_id, v_daily_rate;

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
            v_days := (rec.change_date - 1) - v_prev_date + 1;
            v_segment_interest := public.calc_interest_segment(
                                      v_current_principal,
                                      v_daily_rate,
                                      v_prev_date,
                                      rec.change_date - 1
                                  );
            v_expected := v_expected + v_segment_interest;

            RAISE LOG
              'segment % → %  |  days %  |  principal %  |  +interest %   |  total_so_far %',
              v_prev_date, rec.change_date - 1,
              v_days, v_current_principal, v_segment_interest, v_expected;
        END IF;

        -- 4.b Cập nhật principal tại change_date
        IF rec.transaction_type = 'additional_loan' THEN
            v_current_principal := v_current_principal + COALESCE(rec.debit_amount, 0);
        ELSIF rec.transaction_type = 'principal_repayment' THEN
            v_current_principal := v_current_principal - COALESCE(rec.credit_amount, 0);
        END IF;

        RAISE LOG 'principal changed to % on %', v_current_principal, rec.change_date;

        -- 4.c Cập nhật v_prev_date sang change_date
        v_prev_date := rec.change_date;
    END LOOP;

    --------------------------------------------------------------------
    -- 5. Tính lãi cho đoạn cuối tới p_end_date (bao gồm p_end_date)
    --------------------------------------------------------------------
    IF p_end_date >= v_prev_date THEN
        v_days := p_end_date - v_prev_date + 1;
        v_segment_interest := public.calc_interest_segment(
                                  v_current_principal,
                                  v_daily_rate,
                                  v_prev_date,
                                  p_end_date
                              );
        v_expected := v_expected + v_segment_interest;

        RAISE LOG
          'final segment % → %  |  days %  |  principal %  |  +interest %   |  total_so_far %',
          v_prev_date, p_end_date,
          v_days, v_current_principal, v_segment_interest, v_expected;
    END IF;

    RAISE LOG '=== TOTAL expected % ===', v_expected;

    --------------------------------------------------------------------
    -- 6. Trả kết quả (làm tròn nếu cần)
    --------------------------------------------------------------------
    RETURN ROUND(v_expected);
END;
$$;


ALTER FUNCTION "public"."calc_expected_until"("p_credit_id" "uuid", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calc_interest_segment"("p_principal" numeric, "p_daily_rate" numeric, "p_start" "date", "p_end" "date") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
           when p_end < p_start then 0
           else (p_end - p_start + 1)           -- số ngày
                * p_principal
                * p_daily_rate
         end;
$$;


ALTER FUNCTION "public"."calc_interest_segment"("p_principal" numeric, "p_daily_rate" numeric, "p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calc_pawn_expected_until"("p_pawn_id" "uuid", "p_end_date" "date") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
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
        RAISE EXCEPTION 'calc_pawn_expected_until: pawn % không tồn tại', p_pawn_id;
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
$$;


ALTER FUNCTION "public"."calc_pawn_expected_until"("p_pawn_id" "uuid", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calc_pawn_pawn_interest_segment"("p_principal" numeric, "p_daily_rate" numeric, "p_start" "date", "p_end" "date") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
           when p_end < p_start then 0
           else (p_end - p_start + 1)           -- số ngày
                * p_principal
                * p_daily_rate
         end;
$$;


ALTER FUNCTION "public"."calc_pawn_pawn_interest_segment"("p_principal" numeric, "p_daily_rate" numeric, "p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credit_get_totals"("p_store_id" "uuid", "p_filters" "jsonb" DEFAULT NULL::"jsonb") RETURNS TABLE("total_loan_amount" numeric, "total_paid_interest" numeric, "total_old_debt" numeric, "total_interest_today" numeric)
    LANGUAGE "sql"
    AS $$
/* 1. Lấy credits theo filter cơ bản (chưa tính due_tomorrow) */
with base as (
  select *
  from   credits c
  where  c.store_id = p_store_id

    /* ----- status (loại trừ các trạng thái đặc biệt tính động) ----- */
    and (
          coalesce(p_filters->>'status','') in ('', 'all', 'due_tomorrow', 'overdue', 'late_interest')
          or c.status = (p_filters->>'status')::credit_status
        )

    /* ----- contract_code LIKE ----- */
    and (
          coalesce(p_filters->>'contract_code','') = ''
          or c.contract_code ilike '%' || (p_filters->>'contract_code') || '%'
        )

    /* ----- loan_period = duration ----- */
    and (
          coalesce(p_filters->>'duration','') = ''
          or c.loan_period = (p_filters->>'duration')::int
        )

    /* ----- loan_date range ----- */
    and (
          coalesce(p_filters->>'start_date','') = ''
          or c.loan_date >= (p_filters->>'start_date')::date
        )
    and (
          coalesce(p_filters->>'end_date','') = ''
          or c.loan_date <= (p_filters->>'end_date')::date
        )

    /* ----- customer_name LIKE ----- */
    and (
          coalesce(p_filters->>'customer_name','') = ''
          or exists (
               select 1
               from   customers cu
               where  cu.id = c.customer_id
                 and  cu.name ilike '%' || (p_filters->>'customer_name') || '%'
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
        from   get_next_payment_info( array[b.id] ) np
        where  np.credit_id = b.id
          and  np.next_date = (current_date + interval '1 day')::date
      )
    )

    /* -------------------- status = overdue ----------------------- */
    or (
      p_filters->>'status' = 'overdue'
      and exists (
        select 1
        from   get_credit_statuses( array[b.id] ) st
        where  st.credit_id  = b.id
          and  st.status_code = 'OVERDUE'
      )
    )

    /* -------------------- status = late_interest ----------------- */
    or (
      p_filters->>'status' = 'late_interest'
      and exists (
        select 1
        from   get_credit_statuses( array[b.id] ) st
        where  st.credit_id  = b.id
          and  st.status_code = 'LATE_INTEREST'
      )
    )
),

/* 3. Gom ID thành mảng */
ids as ( select array_agg(id) arr_ids from base2 ),

/* 4. Các số liệu phụ y chang logic React ----------------------------- */

/* 4.1 Tiền thực vay (principal hiện tại) */
principal as (
  select p.credit_id, p.current_principal
  from   ids
  join   lateral get_current_principal(arr_ids) p on true
),

/* 4.2 Lãi phí đã đóng (tổng toàn đời hợp đồng)*/
paid_int as (
  select i.credit_id,
         i.paid_interest
  from   ids
  join   lateral get_paid_interest(arr_ids) i  -- ⬅ hàm đã có
        on true
),

/* 4.3 Nợ cũ */
old_debt as (
  select d.credit_id, d.old_debt
  from   ids
  join   lateral get_old_debt(arr_ids) d on true
),

/* 4.4 Lãi phí tính đến hôm nay */
today_int as (
  select e.credit_id, e.interest_today
  from   ids
  join   lateral get_expected_interest(arr_ids) e on true
)

/* 5. SUM kết quả ------------------------------------------------------ */
select
  sum(coalesce(pr.current_principal, b.loan_amount)) as total_loan_amount,
  sum(coalesce(pi.paid_interest,0))                 as total_paid_interest,
  sum(coalesce(od.old_debt,0))                      as total_old_debt,
  sum(coalesce(ti.interest_today,0))                as total_interest_today
from base2 b
left join principal pr on pr.credit_id = b.id
left join paid_int  pi on pi.credit_id = b.id
left join old_debt  od on od.credit_id = b.id
left join today_int ti on ti.credit_id = b.id;
$$;


ALTER FUNCTION "public"."credit_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_credit_statuses"("p_credit_ids" "uuid"[]) RETURNS TABLE("credit_id" "uuid", "status_code" "text")
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."get_credit_statuses"("p_credit_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_credits_with_latest_payments"("store_id" "uuid") RETURNS TABLE("credit_id" "uuid", "loan_date" timestamp with time zone, "loan_period" integer, "interest_period" integer, "latest_payment_date" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as credit_id,
    c.loan_date,
    c.loan_period,
    c.interest_period,
    lp.effective_date as latest_payment_date
  FROM credits c
  LEFT JOIN (
    SELECT DISTINCT ON (ch.credit_id) 
      ch.credit_id,
      ch.effective_date
    FROM credit_history ch
    WHERE ch.transaction_type = 'payment' 
      AND ch.is_deleted = false
    ORDER BY ch.credit_id, ch.effective_date DESC
  ) lp ON c.id = lp.credit_id
  WHERE c.status = 'on_time' 
    AND c.store_id = get_credits_with_latest_payments.store_id;
END;
$$;


ALTER FUNCTION "public"."get_credits_with_latest_payments"("store_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_principal"("p_credit_ids" "uuid"[]) RETURNS TABLE("credit_id" "uuid", "current_principal" numeric)
    LANGUAGE "sql" STABLE
    AS $$
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


ALTER FUNCTION "public"."get_current_principal"("p_credit_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_expected_interest"("p_credit_ids" "uuid"[]) RETURNS TABLE("credit_id" "uuid", "expected_profit" numeric, "interest_today" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS credit_id,
    /* cả kỳ: loan_date + loan_period - 1 ngày */
    public.calc_expected_until(
        c.id,
        (c.loan_date::date + (c.loan_period - 1))
    )                                                  AS expected_profit,
    /* tới hôm nay (nếu sau ngày vay) */
    CASE
      WHEN CURRENT_DATE >= c.loan_date::date THEN
           public.calc_expected_until(c.id, CURRENT_DATE)
         - COALESCE(
             public.calc_expected_until(c.id, lp.last_paid_date),
             0
           )
      ELSE 0
    END                                                AS interest_today
  FROM public.credits c
  /* Tìm ngày thanh toán lãi cuối cùng bằng lateral, trả về 1 cột duy nhất */
  LEFT JOIN LATERAL (
    SELECT max(ch.effective_date)::date AS last_paid_date
    FROM   credit_history ch
    WHERE  ch.credit_id = c.id
      AND  ch.transaction_type = 'payment'
      AND  ch.is_deleted = FALSE
  ) lp ON true
  WHERE c.id = ANY(p_credit_ids);
END;
$$;


ALTER FUNCTION "public"."get_expected_interest"("p_credit_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_installment_old_debt"("p_installment_ids" "uuid"[]) RETURNS TABLE("installment_id" "uuid", "old_debt" numeric)
    LANGUAGE "sql" STABLE
    AS $$
with base as (                                   -- bảo đảm đủ dòng cho mọi id
  select id
       , installment_amount::numeric
       , loan_period
  from   installments
  where  id = any(p_installment_ids)
),
pay_stats as (                                   -- thống kê payment
  select  ih.installment_id,
          min(ih.effective_date)::date  as first_paid_date,
          max(ih.effective_date)::date  as last_paid_date,
          sum(ih.credit_amount
              - coalesce(ih.debit_amount,0))      as paid_amount
  from    installment_history ih
  where   ih.transaction_type = 'payment'
    and   ih.is_deleted = false
    and   ih.installment_id = any(p_installment_ids)
  group by ih.installment_id
),
debt_pay as (                                    -- tổng debt_payment
  select  ih.installment_id,
          sum(ih.credit_amount
              - coalesce(ih.debit_amount,0))      as debt_payment
  from    installment_history ih
  where   ih.transaction_type = 'debt_payment'
    and   ih.is_deleted = false
    and   ih.installment_id = any(p_installment_ids)
  group by ih.installment_id
)
select
  b.id                                            as installment_id,
  (
    /* expected */
    case
      when p.last_paid_date is null
        then 0                                   -- chưa đóng lần nào → 0
      else
        ((p.last_paid_date - p.first_paid_date + 1)        -- #days
          * (b.installment_amount / nullif(b.loan_period,1))
        )
    end
    /* minus what client đã đóng và debt_payment */
    - coalesce(p.paid_amount,0)
    - coalesce(d.debt_payment,0)
  )::numeric           as old_debt
from  base b
left join pay_stats p on p.installment_id = b.id
left join debt_pay  d on d.installment_id = b.id;
$$;


ALTER FUNCTION "public"."get_installment_old_debt"("p_installment_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_installment_statuses"("p_installment_ids" "uuid"[]) RETURNS TABLE("installment_id" "uuid", "status_code" "text", "status" "text", "description" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
    v_today date := current_date;
    r record;
begin
    for r in
        select i.*,
               /* ngày kết thúc hợp đồng */
               (i.loan_date + (i.loan_period - 1) * interval '1 day')::date               as contract_end,
               /* ngày phải đóng tiếp theo nếu chưa có payment_due_date */
               coalesce(i.payment_due_date,
                        (select max(ph.effective_date)::date from installment_history ph
                         where ph.installment_id = i.id and ph.transaction_type = 'payment' and ph.is_deleted = false)
                        + (i.payment_period * interval '1 day')
               )::date                                                                   as next_due
        from installments i
        where i.id = any(p_installment_ids)
    loop
        /* CLOSED / DELETED / FINISHED / BAD_DEBT giữ nguyên */
        if r.status = 'closed' then
            status_code := 'CLOSED';     status := 'Đã đóng';
        elsif r.status = 'deleted' then
            status_code := 'DELETED';    status := 'Đã xóa';
        elsif r.status = 'finished' or r.payment_due_date is null then
            status_code := 'FINISHED';   status := 'Hoàn thành';
        elsif r.status = 'bad_debt' then
            status_code := 'BAD_DEBT';   status := 'Nợ xấu';

        /* còn lại – ON_TIME trước, kiểm tra quá hạn & chậm trả */
        else
            if r.contract_end < v_today then
                status_code := 'OVERDUE';
                status := format('Quá hạn %s ngày', v_today - r.contract_end);
            elsif r.next_due <= v_today then
                status_code := 'LATE_INTEREST';
                status := format('Chậm trả %s ngày', v_today - r.next_due + 1);
            else
                status_code := 'ON_TIME';  status := 'Đang vay';
            end if;
        end if;

        description := status;
        installment_id := r.id;
        return next;
    end loop;
end $$;


ALTER FUNCTION "public"."get_installment_statuses"("p_installment_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_latest_installment_payment_paid_dates"("p_installment_ids" "uuid"[]) RETURNS TABLE("installment_id" "uuid", "latest_paid_date" "date")
    LANGUAGE "sql" STABLE
    AS $$
with ids as (
  select unnest(p_installment_ids) as installment_id
)
select
  ids.installment_id,
  max(ih.effective_date)::date as latest_paid_date
from ids
left join installment_history ih
  on ih.installment_id = ids.installment_id
  and ih.transaction_type = 'payment'
  and ih.is_deleted = false
group by ids.installment_id;
$$;


ALTER FUNCTION "public"."get_latest_installment_payment_paid_dates"("p_installment_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_latest_payment_paid_dates"("p_credit_ids" "uuid"[]) RETURNS TABLE("credit_id" "uuid", "latest_paid_date" "date")
    LANGUAGE "sql"
    AS $$
with ids as (
  select unnest(p_credit_ids) as credit_id
)
select
  ids.credit_id,
  max(ch.effective_date)::date as latest_paid_date
from ids
left join credit_history ch
  on ch.credit_id = ids.credit_id
  and ch.transaction_type = 'payment'
  and ch.is_deleted = false
group by ids.credit_id;
$$;


ALTER FUNCTION "public"."get_latest_payment_paid_dates"("p_credit_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_payment_info"("p_credit_ids" "uuid"[]) RETURNS TABLE("credit_id" "uuid", "next_date" "date", "is_completed" boolean, "has_paid" boolean)
    LANGUAGE "sql"
    AS $$
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


ALTER FUNCTION "public"."get_next_payment_info"("p_credit_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_old_debt"("p_credit_ids" "uuid"[]) RETURNS TABLE("credit_id" "uuid", "old_debt" numeric)
    LANGUAGE "sql" STABLE
    AS $$
with base as (
  select id as credit_id
  from credits
  where id = any(p_credit_ids)
),
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
debt_pay as (
  select credit_id,
         sum(credit_amount - coalesce(debit_amount,0)) as debt_payment
  from credit_history
  where transaction_type = 'debt_payment'
    and is_deleted = false
    and credit_id = any(p_credit_ids)
  group by credit_id
),
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


ALTER FUNCTION "public"."get_old_debt"("p_credit_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_paid_interest"("p_credit_ids" "uuid"[], "p_start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("credit_id" "uuid", "paid_interest" numeric)
    LANGUAGE "sql" STABLE
    AS $$
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


ALTER FUNCTION "public"."get_paid_interest"("p_credit_ids" "uuid"[], "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pawn_current_principal"("p_pawn_ids" "uuid"[]) RETURNS TABLE("pawn_id" "uuid", "current_principal" numeric)
    LANGUAGE "sql" STABLE
    AS $$
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


ALTER FUNCTION "public"."get_pawn_current_principal"("p_pawn_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pawn_expected_interest"("p_pawn_ids" "uuid"[]) RETURNS TABLE("pawn_id" "uuid", "expected_profit" numeric, "interest_today" numeric)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."get_pawn_expected_interest"("p_pawn_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pawn_next_payment_info"("p_pawn_ids" "uuid"[]) RETURNS TABLE("pawn_id" "uuid", "next_date" "date", "is_completed" boolean, "has_paid" boolean)
    LANGUAGE "sql"
    AS $$
with base as (
  select id,
         loan_date,
         loan_period,
         interest_period
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
    when lp.last_paid is null
      then b.loan_date + ((b.interest_period - 1) * INTERVAL '1 day')
    else lp.last_paid + (b.interest_period * INTERVAL '1 day')
  end as next_date,
  (case
     when lp.last_paid is null then false
     when lp.last_paid >=
       (b.loan_date + (b.loan_period - 1) * INTERVAL '1 day')
       then true        -- hoàn thành
     else false
   end) as is_completed,
  (lp.last_paid is not null) as has_paid
from base b
left join latest_pay lp on lp.pawn_id = b.id;
$$;


ALTER FUNCTION "public"."get_pawn_next_payment_info"("p_pawn_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pawn_old_debt"("p_pawn_ids" "uuid"[]) RETURNS TABLE("pawn_id" "uuid", "old_debt" numeric)
    LANGUAGE "sql" STABLE
    AS $$
with base as (
  select id as pawn_id
  from pawns
  where id = any(p_pawn_ids)
),
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
debt_pay as (
  select pawn_id,
         sum(credit_amount - coalesce(debit_amount,0)) as debt_payment
  from pawn_history
  where transaction_type = 'debt_payment'
    and is_deleted = false
    and pawn_id = any(p_pawn_ids)
  group by pawn_id
),
expected as (
  select
    lp.pawn_id,
    calc_pawn_expected_until(lp.pawn_id, lp.last_paid_date::date) as expected_amount
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


ALTER FUNCTION "public"."get_pawn_old_debt"("p_pawn_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pawn_paid_interest"("p_pawn_ids" "uuid"[], "p_start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("pawn_id" "uuid", "paid_interest" numeric)
    LANGUAGE "sql" STABLE
    AS $$
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


ALTER FUNCTION "public"."get_pawn_paid_interest"("p_pawn_ids" "uuid"[], "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pawn_statuses"("p_pawn_ids" "uuid"[]) RETURNS TABLE("pawn_id" "uuid", "status_code" "text")
    LANGUAGE "plpgsql"
    AS $$
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
            coalesce(p.interest_period,30) as int_period
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
    next_interest_date :=
      coalesce(latest_payment_date, r.loan_date)
      + iperiod * interval '1 day';

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


ALTER FUNCTION "public"."get_pawn_statuses"("p_pawn_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pawns_with_latest_payments"("store_id" "uuid") RETURNS TABLE("pawn_id" "uuid", "loan_date" timestamp with time zone, "loan_period" integer, "interest_period" integer, "latest_payment_date" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as pawn_id,
    p.loan_date,
    p.loan_period,
    p.interest_period,
    lp.effective_date as latest_payment_date
  FROM pawns p
  LEFT JOIN (
    SELECT DISTINCT ON (ph.pawn_id) 
      ph.pawn_id,
      ph.effective_date
    FROM pawn_history ph
    WHERE ph.transaction_type = 'payment' 
      AND ph.is_deleted = false
    ORDER BY ph.pawn_id, ph.effective_date DESC
  ) lp ON p.id = lp.pawn_id
  WHERE p.status = 'on_time'
    AND p.store_id = get_pawns_with_latest_payments.store_id;
END;
$$;


ALTER FUNCTION "public"."get_pawns_with_latest_payments"("store_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$begin
  return new;
end;$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$begin
  return new;
end;$$;


ALTER FUNCTION "public"."handle_user_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."installment_get_collected_profit"("p_installment_ids" "uuid"[]) RETURNS TABLE("installment_id" "uuid", "profit_collected" numeric)
    LANGUAGE "sql" STABLE
    AS $$
with ids as (                           -- 0 → n dòng đầu vào
  select unnest(p_installment_ids) as id
),
pay as (                                -- tổng payment A & B
  select
    ids.id                                           ,
    -- B: đến CURRENT_DATE
    coalesce(
      sum(ih.credit_amount - coalesce(ih.debit_amount,0))
      filter (where ih.transaction_date::date <= current_date)
    ,0)                                as total_b,
    -- A: đến cuối tháng trước
    coalesce(
      sum(ih.credit_amount - coalesce(ih.debit_amount,0))
      filter (where ih.transaction_date::date <= (date_trunc('month', current_date) - interval '1 day')::date)
    ,0)                                as total_a
  from       ids
  left join  installment_history ih
         on  ih.installment_id = ids.id
        and ih.transaction_type = 'payment'
        and ih.is_deleted = false
  group by ids.id
)
select
  pay.id                                as installment_id,
  greatest(0, pay.total_b - inst.down_payment)
    - greatest(0, pay.total_a - inst.down_payment)  as profit_collected
from       pay
left join  installments inst on inst.id = pay.id;
$$;


ALTER FUNCTION "public"."installment_get_collected_profit"("p_installment_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."installment_get_paid_amount"("p_installment_ids" "uuid"[]) RETURNS TABLE("installment_id" "uuid", "paid_amount" numeric)
    LANGUAGE "sql" STABLE
    AS $$
with ids as (                                -- bảo đảm đủ dòng
  select unnest(p_installment_ids) as id
)
select
  ids.id               as installment_id,
  coalesce(
    sum(ih.credit_amount - coalesce(ih.debit_amount,0)), 0
  )                    as paid_amount
from       ids
left join  installment_history ih
       on  ih.installment_id = ids.id
      and  ih.transaction_type = 'payment'
      and  ih.is_deleted = false
group by ids.id;
$$;


ALTER FUNCTION "public"."installment_get_paid_amount"("p_installment_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."installment_get_totals"("p_store_id" "uuid", "p_filters" "jsonb" DEFAULT NULL::"jsonb") RETURNS TABLE("total_amount_given" numeric, "total_paid" numeric, "total_debt" numeric, "total_daily_amount" numeric, "total_remaining" numeric)
    LANGUAGE "plpgsql"
    AS $$
declare
  v_ids uuid[];
begin
  /* =========== 1. Base set =========== */
  with base as (
    select *
    from   installments_by_store i
    where  i.store_id = p_store_id

      /* ---- status ---- */
      and (
            coalesce(p_filters->>'status','') in ('', 'all')             -- không lọc
            or (p_filters->>'status') in ('due_tomorrow','overdue','late_interest')
            or i.status = (p_filters->>'status')::installment_status     -- enum tĩnh
          )

      /* ---- due_tomorrow đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'due_tomorrow'
            or i.payment_due_date = (current_date + interval '1 day')::date
          )

      /* ---- overdue đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'overdue'
            or exists (
                  select 1
                  from   get_installment_statuses( array[i.id] ) st
                  where  st.installment_id = i.id
                    and  st.status_code    = 'OVERDUE'
            )
          )

      /* ---- late_interest đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'late_interest'
            or exists (
                  select 1
                  from   get_installment_statuses( array[i.id] ) st
                  where  st.installment_id = i.id
                    and  st.status_code    = 'LATE_INTEREST'
            )
          )

      /* ---- mã hợp đồng ---- */
      and (
            coalesce(p_filters->>'contract_code','') = ''
            or i.contract_code ilike '%' || (p_filters->>'contract_code') || '%'
          )

      /* ---- thời hạn vay (loan_period) ---- */
      and (
            coalesce(p_filters->>'duration','') = ''
            or i.loan_period = (p_filters->>'duration')::int
          )

      /* ---- khoảng ngày vay ---- */
      and (
            coalesce(p_filters->>'start_date','') = ''
            or CASE 
                 WHEN (p_filters->>'status') IN ('deleted', 'closed') THEN i.updated_at::DATE >= (p_filters->>'start_date')::date
                 ELSE i.loan_date >= (p_filters->>'start_date')::date
               END
          )
      and (
            coalesce(p_filters->>'end_date','') = ''
            or CASE 
                 WHEN (p_filters->>'status') IN ('deleted', 'closed') THEN i.updated_at::DATE <= (p_filters->>'end_date')::date
                 ELSE i.loan_date <= (p_filters->>'end_date')::date
               END
          )

      /* ---- tên khách hàng ---- */
      and (
            coalesce(p_filters->>'customer_name','') = ''
            or exists (
                  select 1
                  from   customers c
                  where  c.id   = i.customer_id
                    and  (c.name ilike '%' || (p_filters->>'customer_name') || '%'
                          or unaccent(c.name) ilike unaccent('%' || (p_filters->>'customer_name') || '%'))
            )
          )
  )
  select array_agg(id) into v_ids from base;

  -- DEBUG
  raise log 'installment_get_totals – IDs after filter: %', v_ids;

  /* =========== 2. Phần còn lại giống cũ =========== */
  return query
  with base as (
    select *
    from   installments_by_store i
    where  i.store_id = p_store_id

      /* ---- status ---- */
      and (
            coalesce(p_filters->>'status','') in ('', 'all')             -- không lọc
            or (p_filters->>'status') in ('due_tomorrow','overdue','late_interest')
            or i.status = (p_filters->>'status')::installment_status     -- enum tĩnh
          )

      /* ---- due_tomorrow đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'due_tomorrow'
            or i.payment_due_date = (current_date + interval '1 day')::date
          )

      /* ---- overdue đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'overdue'
            or exists (
                  select 1
                  from   get_installment_statuses( array[i.id] ) st
                  where  st.installment_id = i.id
                    and  st.status_code    = 'OVERDUE'
            )
          )

      /* ---- late_interest đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'late_interest'
            or exists (
                  select 1
                  from   get_installment_statuses( array[i.id] ) st
                  where  st.installment_id = i.id
                    and  st.status_code    = 'LATE_INTEREST'
            )
          )

      /* ---- mã hợp đồng ---- */
      and (
            coalesce(p_filters->>'contract_code','') = ''
            or i.contract_code ilike '%' || (p_filters->>'contract_code') || '%'
          )

      /* ---- thời hạn vay (loan_period) ---- */
      and (
            coalesce(p_filters->>'duration','') = ''
            or i.loan_period = (p_filters->>'duration')::int
          )

      /* ---- khoảng ngày vay ---- */
      and (
            coalesce(p_filters->>'start_date','') = ''
            or CASE 
                 WHEN (p_filters->>'status') IN ('deleted', 'closed') THEN i.updated_at::DATE >= (p_filters->>'start_date')::date
                 ELSE i.loan_date >= (p_filters->>'start_date')::date
               END
          )
      and (
            coalesce(p_filters->>'end_date','') = ''
            or CASE 
                 WHEN (p_filters->>'status') IN ('deleted', 'closed') THEN i.updated_at::DATE <= (p_filters->>'end_date')::date
                 ELSE i.loan_date <= (p_filters->>'end_date')::date
               END
          )

      /* ---- tên khách hàng ---- */
      and (
            coalesce(p_filters->>'customer_name','') = ''
            or exists (
                  select 1
                  from   customers c
                  where  c.id   = i.customer_id
                    and  (c.name ilike '%' || (p_filters->>'customer_name') || '%'
                          or unaccent(c.name) ilike unaccent('%' || (p_filters->>'customer_name') || '%'))
            )
          )
  ),

  /* =========================
     2. Lấy mảng ID để gọi các hàm tổng hợp con
     ========================= */
  ids as (
    select array_agg(id) arr_ids from base
  ),

  /* ---- Tiền đã đóng (logic trùng với UI) ---- */
  paid as (
    select p.installment_id, p.paid_amount as paid
    from   ids
    join   lateral installment_get_paid_amount(arr_ids) p on true
  ),

  /* ---- Nợ (old_debt) – logic trùng UI ---- */
  debt as (
    select d.installment_id, d.old_debt
    from   ids
    join   lateral get_installment_old_debt(arr_ids) d on true
  )

  /* =========================
     3. Tổng hợp kết quả
     ========================= */
  select
    /* Tiền giao khách */
    sum(b.down_payment)                                    as total_amount_given,

    /* Tiền đã đóng */
    sum(coalesce(p.paid,0))                                as total_paid,

    /* Nợ hiện tại */
    sum(coalesce(d.old_debt,0))                            as total_debt,

    /* Tiền 1 ngày */
    sum(
          case
            when coalesce(b.loan_period,0) > 0
            then b.installment_amount / b.loan_period
            else 0
          end
    )                                                      as total_daily_amount,

    /* Còn phải đóng */
    sum(b.installment_amount - coalesce(p.paid,0))         as total_remaining
  from base b
  left join paid p  on p.installment_id  = b.id
  left join debt d  on d.installment_id  = b.id;
end;
$$;


ALTER FUNCTION "public"."installment_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."installment_next_unpaid_date"("p_installment_ids" "uuid"[]) RETURNS TABLE("installment_id" "uuid", "next_unpaid_date" "date")
    LANGUAGE "sql" STABLE
    AS $$
with ids as (
  select unnest(p_installment_ids) as id
),
last_pay as (
  select   ih.installment_id,
           max(ih.effective_date)::date as last_paid
  from     installment_history ih
  where    ih.installment_id = any(p_installment_ids)
    and    ih.transaction_type = 'payment'
    and    ih.is_deleted = false
  group by ih.installment_id
),
inst_data as (
  select i.id, i.loan_date::date as loan_start
  from installments i
  where i.id = any(p_installment_ids)
)
select 
  inst_data.id as installment_id,
  coalesce(
    (last_pay.last_paid + interval '1 day')::date,
    inst_data.loan_start
  ) as next_unpaid_date
from inst_data
left join last_pay on last_pay.installment_id = inst_data.id;
$$;


ALTER FUNCTION "public"."installment_next_unpaid_date"("p_installment_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."installment_overdue_stats"("p_installment_ids" "uuid"[]) RETURNS TABLE("installment_id" "uuid", "late_periods" integer, "first_unpaid" "date", "last_check" "date")
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  rec record;
  v_today date := current_date;
  v_first_unpaid date;
  v_last_check date;
  v_unpaid_days int;
  v_late_periods int;
begin
  for rec in
    select 
      i.id,
      i.loan_date::date as loan_date,
      i.loan_period as loan_period,
      i.payment_period,
      coalesce(max(ih.effective_date)::date, null) as last_paid
    from installments i
    left join installment_history ih on ih.installment_id = i.id 
      and ih.transaction_type = 'payment' 
      and ih.is_deleted = false
    where i.id = any(p_installment_ids)
    group by i.id, i.loan_date, i.loan_period, i.payment_period
  loop
    -- Calculate first unpaid date
    v_first_unpaid := coalesce(
      (rec.last_paid + interval '1 day')::date,
      rec.loan_date
    );
    
    -- Calculate contract end date
    v_last_check := least(
      v_today,
      (rec.loan_date + (rec.loan_period - 1) * interval '1 day')::date
    );
    
    -- Calculate unpaid days and late periods
    if v_last_check >= v_first_unpaid then
      v_unpaid_days := (v_last_check - v_first_unpaid + 1);
      RAISE LOG 'v_unpaid_days: %', v_unpaid_days;
      v_late_periods := floor(v_unpaid_days::numeric / coalesce(rec.payment_period, 10));
    else
      v_late_periods := 0;
    end if;
    
    installment_id := rec.id;
    late_periods := v_late_periods;
    first_unpaid := v_first_unpaid;
    last_check := v_last_check;
    
    return next;
  end loop;
end;
$$;


ALTER FUNCTION "public"."installment_overdue_stats"("p_installment_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pawn_get_totals"("p_store_id" "uuid", "p_filters" "jsonb" DEFAULT NULL::"jsonb") RETURNS TABLE("total_loan_amount" numeric, "total_paid_interest" numeric, "total_old_debt" numeric, "total_interest_today" numeric)
    LANGUAGE "sql"
    AS $$
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


ALTER FUNCTION "public"."pawn_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_credits_unaccent"("p_customer_name" "text" DEFAULT ''::"text", "p_contract_code" "text" DEFAULT ''::"text", "p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date", "p_duration" integer DEFAULT NULL::integer, "p_status" "text" DEFAULT NULL::"text", "p_store_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "customer_id" "uuid", "contract_code" "text", "collateral" "text", "loan_amount" numeric, "debt_amount" numeric, "loan_date" timestamp with time zone, "loan_period" integer, "interest_type" "text", "interest_value" numeric, "interest_period" integer, "interest_notation" "text", "interest_ui_type" "text", "status" "public"."credit_status", "has_paid" boolean, "is_completed" boolean, "notes" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "store_id" "uuid", "status_code" "text", "next_payment_date" "date", "customer_name" "text", "customer_phone" "text", "customer_address" "text", "customer_id_number" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.customer_id,
    c.contract_code,
    c.collateral,
    c.loan_amount,
    c.debt_amount,
    c.loan_date,
    c.loan_period,
    c.interest_type::TEXT,
    c.interest_value,
    c.interest_period,
    c.interest_notation,
    c.interest_ui_type,
    c.status,
    c.has_paid,
    c.is_completed,
    c.notes,
    c.created_at,
    c.updated_at,
    c.store_id,
    c.status_code::TEXT,
    c.next_payment_date,
    cust.name as customer_name,
    cust.phone as customer_phone,
    cust.address as customer_address,
    cust.id_number as customer_id_number
  FROM credits_by_store c
  JOIN customers cust ON c.customer_id = cust.id
  WHERE 
    -- Vietnamese unaccented search for customer name
    (p_customer_name = '' OR 
     cust.name ILIKE '%' || p_customer_name || '%' OR
     unaccent(cust.name) ILIKE unaccent('%' || p_customer_name || '%'))
    AND (p_contract_code = '' OR c.contract_code ILIKE '%' || p_contract_code || '%')
    AND (p_start_date IS NULL OR c.loan_date::DATE >= p_start_date)
    AND (p_end_date IS NULL OR (c.loan_date - INTERVAL '1 DAY' + INTERVAL '1 DAY' * c.loan_period)::DATE <= p_end_date)
    AND (p_duration IS NULL OR c.loan_period = p_duration)
    AND (p_store_id IS NULL OR c.store_id = p_store_id)
    AND (p_status IS NULL OR 
         CASE 
           -- Handle ON_TIME special case (includes OVERDUE and LATE_INTEREST)
           WHEN p_status = 'on_time' THEN c.status_code IN ('ON_TIME', 'OVERDUE', 'LATE_INTEREST')
           -- Handle individual status mapping
           WHEN p_status = 'overdue' THEN c.status_code = 'OVERDUE'
           WHEN p_status = 'late_interest' THEN c.status_code = 'LATE_INTEREST'
           WHEN p_status = 'closed' THEN c.status_code = 'CLOSED'
           WHEN p_status = 'deleted' THEN c.status_code = 'DELETED'
           WHEN p_status = 'bad_debt' THEN c.status_code = 'BAD_DEBT'
           WHEN p_status = 'finished' THEN c.status_code = 'FINISHED'
           WHEN p_status = 'due_tomorrow' THEN c.next_payment_date = (CURRENT_DATE + INTERVAL '1 day')
           -- All other statuses match exactly
           ELSE c.status_code = p_status
         END)
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."search_credits_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_installments_unaccent"("p_customer_name" "text" DEFAULT ''::"text", "p_contract_code" "text" DEFAULT ''::"text", "p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date", "p_duration" integer DEFAULT NULL::integer, "p_status" "text" DEFAULT NULL::"text", "p_store_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "customer_id" "uuid", "employee_id" "uuid", "contract_code" "text", "installment_amount" numeric, "down_payment" numeric, "loan_date" timestamp with time zone, "loan_period" integer, "payment_period" integer, "status" "public"."installment_status", "document" "text", "notes" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "store_id" "uuid", "status_code" "text", "payment_due_date" timestamp with time zone, "customer_name" "text", "customer_phone" "text", "customer_address" "text", "customer_id_number" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.customer_id,
    i.employee_id,
    i.contract_code,
    i.installment_amount,
    i.down_payment,
    i.loan_date,
    i.loan_period,
    i.payment_period,
    i.status,
    i.document,
    i.notes,
    i.created_at,
    i.updated_at,
    i.store_id,
    i.status_code::TEXT,
    i.payment_due_date,
    c.name as customer_name,
    c.phone as customer_phone,
    c.address as customer_address,
    c.id_number as customer_id_number
  FROM installments_by_store i
  JOIN customers c ON i.customer_id = c.id
  WHERE 
    -- Vietnamese unaccented search for customer name
    (p_customer_name = '' OR 
     c.name ILIKE '%' || p_customer_name || '%' OR
     unaccent(c.name) ILIKE unaccent('%' || p_customer_name || '%'))
    AND (p_contract_code = '' OR i.contract_code ILIKE '%' || p_contract_code || '%')
    AND (p_start_date IS NULL OR 
         CASE 
           WHEN p_status IN ('DELETED', 'CLOSED') THEN i.updated_at::DATE >= p_start_date
           ELSE i.loan_date::DATE >= p_start_date
         END)
    AND (p_end_date IS NULL OR 
         CASE 
           WHEN p_status IN ('DELETED', 'CLOSED') THEN i.updated_at::DATE <= p_end_date
           ELSE i.loan_date::DATE <= p_end_date
         END)
    AND (p_duration IS NULL OR i.loan_period = p_duration)
    AND (p_store_id IS NULL OR i.store_id = p_store_id)
    AND (p_status IS NULL OR 
         CASE 
           -- Handle ON_TIME special case (includes OVERDUE and LATE_INTEREST)
           WHEN p_status = 'ON_TIME' THEN i.status_code IN ('ON_TIME', 'OVERDUE', 'LATE_INTEREST')
           -- All other statuses match exactly
           ELSE i.status_code = p_status
         END)
  ORDER BY i.created_at DESC, i.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."search_installments_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_pawns_unaccent"("p_customer_name" "text" DEFAULT ''::"text", "p_contract_code" "text" DEFAULT ''::"text", "p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date", "p_duration" integer DEFAULT NULL::integer, "p_status" "text" DEFAULT NULL::"text", "p_store_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "customer_id" "uuid", "contract_code" "text", "loan_amount" numeric, "debt_amount" numeric, "loan_date" timestamp with time zone, "loan_period" integer, "interest_type" "text", "interest_value" numeric, "interest_period" integer, "interest_notation" "text", "interest_ui_type" "text", "status" "public"."pawn_status", "has_paid" boolean, "is_completed" boolean, "notes" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "store_id" "uuid", "status_code" "text", "next_payment_date" "date", "customer_name" "text", "customer_phone" "text", "customer_address" "text", "customer_id_number" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.customer_id,
    p.contract_code,
    p.loan_amount,
    p.debt_amount,
    p.loan_date,
    p.loan_period,
    p.interest_type::TEXT,
    p.interest_value,
    p.interest_period,
    p.interest_notation,
    p.interest_ui_type,
    p.status,
    p.has_paid,
    p.is_completed,
    p.notes,
    p.created_at,
    p.updated_at,
    p.store_id,
    p.status_code::TEXT,
    p.next_payment_date,
    cust.name as customer_name,
    cust.phone as customer_phone,
    cust.address as customer_address,
    cust.id_number as customer_id_number
  FROM pawns_by_store p
  JOIN customers cust ON p.customer_id = cust.id
  WHERE 
    -- Vietnamese unaccented search for customer name
    (p_customer_name = '' OR 
     cust.name ILIKE '%' || p_customer_name || '%' OR
     unaccent(cust.name) ILIKE unaccent('%' || p_customer_name || '%'))
    AND (p_contract_code = '' OR p.contract_code ILIKE '%' || p_contract_code || '%')
    AND (p_start_date IS NULL OR p.loan_date::DATE >= p_start_date)
    AND (p_end_date IS NULL OR (p.loan_date - INTERVAL '1 DAY' + INTERVAL '1 DAY' * p.loan_period)::DATE <= p_end_date)
    AND (p_duration IS NULL OR p.loan_period = p_duration)
    AND (p_store_id IS NULL OR p.store_id = p_store_id)
    AND (p_status IS NULL OR 
         CASE 
           -- Handle ON_TIME special case (includes OVERDUE and LATE_INTEREST)
           WHEN p_status = 'on_time' THEN p.status_code IN ('ON_TIME', 'OVERDUE', 'LATE_INTEREST')
           -- Handle individual status mapping
           WHEN p_status = 'overdue' THEN p.status_code = 'OVERDUE'
           WHEN p_status = 'late_interest' THEN p.status_code = 'LATE_INTEREST'
           WHEN p_status = 'closed' THEN p.status_code = 'CLOSED'
           WHEN p_status = 'deleted' THEN p.status_code = 'DELETED'
           WHEN p_status = 'bad_debt' THEN p.status_code = 'BAD_DEBT'
           WHEN p_status = 'finished' THEN p.status_code = 'FINISHED'
           WHEN p_status = 'due_tomorrow' THEN p.next_payment_date = (CURRENT_DATE + INTERVAL '1 day')
           -- All other statuses match exactly
           ELSE p.status_code = p_status
         END)
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."search_pawns_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."collaterals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "category" character varying(20) NOT NULL,
    "name" character varying(255) NOT NULL,
    "code" character varying(50) NOT NULL,
    "status" character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "default_amount" numeric(18,0) NOT NULL,
    "interest_per_day" numeric(10,2) NOT NULL,
    "interest_type" character varying(20) NOT NULL,
    "interest_period" integer NOT NULL,
    "prepay_interest" boolean DEFAULT false,
    "liquidation_after" integer,
    "attr_01" character varying(255),
    "attr_02" character varying(255),
    "attr_03" character varying(255),
    "attr_04" character varying(255),
    "attr_05" character varying(255),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."collaterals" OWNER TO "postgres";


COMMENT ON TABLE "public"."collaterals" IS 'Cấu hình tài sản ( cho cầm đồ )';



CREATE TABLE IF NOT EXISTS "public"."credit_extension_histories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "credit_id" "uuid" NOT NULL,
    "days" integer NOT NULL,
    "notes" "text",
    "from_date" "date" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."credit_extension_histories" OWNER TO "postgres";


COMMENT ON TABLE "public"."credit_extension_histories" IS 'Gia hạn';



CREATE TABLE IF NOT EXISTS "public"."credit_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "credit_id" "uuid" NOT NULL,
    "transaction_type" "public"."credit_transaction_type" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "debit_amount" integer DEFAULT 0,
    "credit_amount" integer DEFAULT 0,
    "date_status" "text",
    "effective_date" timestamp with time zone,
    "principal_change_description" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone,
    "is_created_from_contract_closure" boolean DEFAULT false,
    "updated_by" "uuid"
);


ALTER TABLE "public"."credit_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."credit_history" IS 'Lịch sử tín chấp';



COMMENT ON COLUMN "public"."credit_history"."effective_date" IS 'Ngày thay đổi gốc của hợp đồng ( vay thêm / trả bớt ). Phục vụ cho việc tính toán vay thêm / trả bớt gốc';



COMMENT ON COLUMN "public"."credit_history"."principal_change_description" IS 'Ghi chú thay đổi gốc của người dùng';



COMMENT ON COLUMN "public"."credit_history"."is_created_from_contract_closure" IS 'Xác định lịch sử phải từ việc đóng hợp đồng không';



CREATE TABLE IF NOT EXISTS "public"."credits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "contract_code" "text",
    "collateral" "text",
    "loan_amount" numeric NOT NULL,
    "interest_type" "public"."interest_type" NOT NULL,
    "interest_value" numeric NOT NULL,
    "loan_period" integer NOT NULL,
    "interest_period" integer NOT NULL,
    "loan_date" timestamp with time zone NOT NULL,
    "notes" "text",
    "status" "public"."credit_status" DEFAULT 'on_time'::"public"."credit_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone,
    "interest_notation" "text",
    "interest_ui_type" "text",
    "debt_amount" numeric DEFAULT '0'::numeric
);


ALTER TABLE "public"."credits" OWNER TO "postgres";


COMMENT ON TABLE "public"."credits" IS 'tín chấp';



CREATE OR REPLACE VIEW "public"."credits_by_store" AS
 SELECT "c"."id",
    "c"."store_id",
    "c"."customer_id",
    "c"."contract_code",
    "c"."collateral",
    "c"."loan_amount",
    "c"."interest_type",
    "c"."interest_value",
    "c"."loan_period",
    "c"."interest_period",
    "c"."loan_date",
    "c"."notes",
    "c"."status",
    "c"."created_at",
    "c"."updated_at",
    "c"."interest_notation",
    "c"."interest_ui_type",
    "c"."debt_amount",
        CASE
            WHEN ("c"."status" = ANY (ARRAY['closed'::"public"."credit_status", 'deleted'::"public"."credit_status", 'bad_debt'::"public"."credit_status"])) THEN "upper"(("c"."status")::"text")
            WHEN (((("c"."loan_date")::"date" + ((("c"."loan_period" - 1))::double precision * '1 day'::interval)))::"date" < CURRENT_DATE) THEN 'OVERDUE'::"text"
            WHEN (((COALESCE("lp"."latest_payment_date", ("c"."loan_date")::"date") + ((COALESCE("c"."interest_period", 30))::double precision * '1 day'::interval)))::"date" <= CURRENT_DATE) THEN 'LATE_INTEREST'::"text"
            ELSE 'ON_TIME'::"text"
        END AS "status_code",
        CASE
            WHEN ("lp"."latest_payment_date" IS NULL) THEN ((("c"."loan_date")::"date" + (((COALESCE("c"."interest_period", 30) - 1))::double precision * '1 day'::interval)))::"date"
            ELSE (("lp"."latest_payment_date" + ((COALESCE("c"."interest_period", 30))::double precision * '1 day'::interval)))::"date"
        END AS "next_payment_date",
        CASE
            WHEN ("lp"."latest_payment_date" IS NULL) THEN false
            WHEN ("lp"."latest_payment_date" >= ((("c"."loan_date")::"date" + ((("c"."loan_period" - 1))::double precision * '1 day'::interval)))::"date") THEN true
            ELSE false
        END AS "is_completed",
    ("lp"."latest_payment_date" IS NOT NULL) AS "has_paid"
   FROM ("public"."credits" "c"
     LEFT JOIN ( SELECT "credit_history"."credit_id",
            ("max"("credit_history"."effective_date"))::"date" AS "latest_payment_date"
           FROM "public"."credit_history"
          WHERE (("credit_history"."transaction_type" = 'payment'::"public"."credit_transaction_type") AND ("credit_history"."is_deleted" = false))
          GROUP BY "credit_history"."credit_id") "lp" ON (("lp"."credit_id" = "c"."id")));


ALTER TABLE "public"."credits_by_store" OWNER TO "postgres";


COMMENT ON VIEW "public"."credits_by_store" IS 'Enhanced view with pre-calculated status_code and next_payment_date for credits, mirroring get_credit_statuses and get_next_payment_info RPC logic for efficient filtering';



CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "store_id" "uuid",
    "phone" "text",
    "address" "text",
    "id_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone,
    "blacklist_reason" "text"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."customers"."blacklist_reason" IS 'lý do báo xấu (nếu có)';



CREATE TABLE IF NOT EXISTS "public"."employee_permissions" (
    "employee_id" "uuid" NOT NULL,
    "permission_id" "text" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."employee_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_permissions" IS 'Phân quyền nhân viên';



CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "store_id" "uuid",
    "phone" "text",
    "email" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."installment_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "credit_amount" numeric DEFAULT '0'::numeric NOT NULL,
    "debit_amount" numeric DEFAULT '0'::numeric NOT NULL,
    "description" "text",
    "effective_date" timestamp with time zone,
    "installment_id" "uuid" NOT NULL,
    "is_created_from_contract_closure" boolean DEFAULT false NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "transaction_date" timestamp with time zone,
    "transaction_type" character varying NOT NULL,
    "updated_at" timestamp with time zone,
    "updated_by" "uuid",
    "date_status" "text"
);


ALTER TABLE "public"."installment_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."installment_history" IS 'Lịch sử đóng lãi trả góp';



CREATE TABLE IF NOT EXISTS "public"."installments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "contract_code" "text",
    "down_payment" numeric NOT NULL,
    "installment_amount" numeric NOT NULL,
    "loan_period" integer NOT NULL,
    "payment_period" integer NOT NULL,
    "loan_date" timestamp with time zone NOT NULL,
    "notes" "text",
    "status" "public"."installment_status" DEFAULT 'on_time'::"public"."installment_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone,
    "document" "text",
    "debt_amount" numeric DEFAULT 0 NOT NULL,
    "payment_due_date" timestamp with time zone
);


ALTER TABLE "public"."installments" OWNER TO "postgres";


COMMENT ON TABLE "public"."installments" IS 'Trả góp';



COMMENT ON COLUMN "public"."installments"."document" IS 'URL chứng từ';



COMMENT ON COLUMN "public"."installments"."debt_amount" IS 'Tiền nợ được tính toán khi check/uncheck kỳ đóng tiền. Công thức: nợ + (actual - expected) khi check, nợ - (actual - expected) khi uncheck';



CREATE OR REPLACE VIEW "public"."installments_by_store" AS
 SELECT "i"."id",
    "i"."customer_id",
    "i"."employee_id",
    "i"."contract_code",
    "i"."down_payment",
    "i"."installment_amount",
    "i"."loan_period",
    "i"."payment_period",
    "i"."loan_date",
    "i"."notes",
    "i"."status",
    "i"."created_at",
    "i"."updated_at",
    "i"."document",
    "i"."debt_amount",
    "i"."payment_due_date",
    "e"."store_id",
        CASE
            WHEN ("i"."status" = 'closed'::"public"."installment_status") THEN 'CLOSED'::"text"
            WHEN ("i"."status" = 'deleted'::"public"."installment_status") THEN 'DELETED'::"text"
            WHEN ("i"."status" = 'bad_debt'::"public"."installment_status") THEN 'BAD_DEBT'::"text"
            WHEN ((("i"."loan_date" + ((("i"."loan_period" - 1))::double precision * '1 day'::interval)))::"date" < CURRENT_DATE) THEN 'OVERDUE'::"text"
            WHEN (("i"."payment_due_date" IS NOT NULL) AND ((COALESCE("i"."payment_due_date", ((( SELECT ("max"("installment_history"."effective_date"))::"date" AS "max"
               FROM "public"."installment_history"
              WHERE (("installment_history"."installment_id" = "i"."id") AND (("installment_history"."transaction_type")::"text" = 'payment'::"text") AND ("installment_history"."is_deleted" = false))) + (("i"."payment_period")::double precision * '1 day'::interval)))::timestamp with time zone))::"date" <= CURRENT_DATE)) THEN 'LATE_INTEREST'::"text"
            ELSE 'ON_TIME'::"text"
        END AS "status_code"
   FROM (("public"."installments" "i"
     JOIN "public"."employees" "e" ON (("e"."id" = "i"."employee_id")))
     LEFT JOIN ( SELECT "installment_history"."installment_id",
            ("max"("installment_history"."effective_date"))::"date" AS "last_paid"
           FROM "public"."installment_history"
          WHERE ((("installment_history"."transaction_type")::"text" = 'payment'::"text") AND ("installment_history"."is_deleted" = false))
          GROUP BY "installment_history"."installment_id") "lp" ON (("lp"."installment_id" = "i"."id")));


ALTER TABLE "public"."installments_by_store" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pawn_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "pawn_id" "uuid" NOT NULL,
    "transaction_type" "public"."pawn_transaction_type" NOT NULL,
    "debit_amount" integer DEFAULT 0,
    "credit_amount" integer DEFAULT 0,
    "effective_date" timestamp with time zone,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "is_created_from_contract_closure" boolean DEFAULT false,
    "principal_change_description" "text",
    "date_status" character varying,
    "updated_by" "uuid"
);


ALTER TABLE "public"."pawn_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."pawn_history" IS 'Lịch sử cầm đồ';



CREATE TABLE IF NOT EXISTS "public"."pawns" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "contract_code" "text",
    "loan_amount" numeric NOT NULL,
    "loan_date" timestamp with time zone NOT NULL,
    "loan_period" integer NOT NULL,
    "interest_type" "public"."interest_type" NOT NULL,
    "interest_value" numeric NOT NULL,
    "interest_period" integer NOT NULL,
    "collateral_id" "uuid" NOT NULL,
    "status" "public"."pawn_status" DEFAULT 'on_time'::"public"."pawn_status",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "interest_ui_type" "text",
    "interest_notation" "text",
    "debt_amount" numeric DEFAULT '0'::numeric NOT NULL,
    "collateral_detail" "json",
    "is_advance_payment" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."pawns" OWNER TO "postgres";


COMMENT ON TABLE "public"."pawns" IS 'Cầm đồ';



COMMENT ON COLUMN "public"."pawns"."debt_amount" IS 'Nợ';



CREATE OR REPLACE VIEW "public"."pawns_by_store" AS
 SELECT "p"."id",
    "p"."customer_id",
    "p"."store_id",
    "p"."contract_code",
    "p"."loan_amount",
    "p"."loan_date",
    "p"."loan_period",
    "p"."interest_type",
    "p"."interest_value",
    "p"."interest_period",
    "p"."collateral_id",
    "p"."status",
    "p"."notes",
    "p"."created_at",
    "p"."updated_at",
    "p"."interest_ui_type",
    "p"."interest_notation",
    "p"."debt_amount",
    "p"."collateral_detail",
        CASE
            WHEN ("p"."status" = ANY (ARRAY['closed'::"public"."pawn_status", 'deleted'::"public"."pawn_status", 'bad_debt'::"public"."pawn_status"])) THEN "upper"(("p"."status")::"text")
            WHEN (((("p"."loan_date")::"date" + ((("p"."loan_period" - 1))::double precision * '1 day'::interval)))::"date" < CURRENT_DATE) THEN 'OVERDUE'::"text"
            WHEN (("lp"."latest_payment_date" IS NOT NULL) AND ("lp"."latest_payment_date" = ((("p"."loan_date")::"date" + ((("p"."loan_period" - 1))::double precision * '1 day'::interval)))::"date")) THEN 'FINISHED'::"text"
            WHEN (((COALESCE("lp"."latest_payment_date", ("p"."loan_date")::"date") + ((COALESCE("p"."interest_period", 30))::double precision * '1 day'::interval)))::"date" <= CURRENT_DATE) THEN 'LATE_INTEREST'::"text"
            ELSE 'ON_TIME'::"text"
        END AS "status_code",
        CASE
            WHEN ("lp"."latest_payment_date" IS NULL) THEN ((("p"."loan_date")::"date" + (((COALESCE("p"."interest_period", 30) - 1))::double precision * '1 day'::interval)))::"date"
            ELSE (("lp"."latest_payment_date" + ((COALESCE("p"."interest_period", 30))::double precision * '1 day'::interval)))::"date"
        END AS "next_payment_date",
        CASE
            WHEN ("lp"."latest_payment_date" IS NULL) THEN false
            WHEN ("lp"."latest_payment_date" >= ((("p"."loan_date")::"date" + ((("p"."loan_period" - 1))::double precision * '1 day'::interval)))::"date") THEN true
            ELSE false
        END AS "is_completed",
    ("lp"."latest_payment_date" IS NOT NULL) AS "has_paid"
   FROM ("public"."pawns" "p"
     LEFT JOIN ( SELECT "pawn_history"."pawn_id",
            ("max"("pawn_history"."effective_date"))::"date" AS "latest_payment_date"
           FROM "public"."pawn_history"
          WHERE (("pawn_history"."transaction_type" = 'payment'::"public"."pawn_transaction_type") AND ("pawn_history"."is_deleted" = false))
          GROUP BY "pawn_history"."pawn_id") "lp" ON (("lp"."pawn_id" = "p"."id")));


ALTER TABLE "public"."pawns_by_store" OWNER TO "postgres";


COMMENT ON VIEW "public"."pawns_by_store" IS 'Enhanced view with pre-calculated status_code and next_payment_date for pawns, mirroring get_pawn_statuses and get_pawn_next_payment_info RPC logic for efficient filtering. Note: Unlike installments/credits, pawns have direct store_id relationship.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "is_banned" boolean DEFAULT false,
    "email" "text",
    "is_banned_by_superadmin" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Người đăng nhập';



CREATE TABLE IF NOT EXISTS "public"."store_fund_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "fund_amount" numeric(15,2) NOT NULL,
    "note" "text",
    "transaction_type" character varying(50),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    CONSTRAINT "store_fund_history_name_check" CHECK (("length"("name") <= 50))
);


ALTER TABLE "public"."store_fund_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."store_fund_history" IS 'Records all changes to store capital including investments, withdrawals, and operational cash flow';



CREATE TABLE IF NOT EXISTS "public"."store_total_fund" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "total_fund" numeric NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."store_total_fund" OWNER TO "postgres";


COMMENT ON TABLE "public"."store_total_fund" IS 'Qũy ( 00:00 mỗi ngày )';



CREATE TABLE IF NOT EXISTS "public"."stores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "investment" numeric(15,2) DEFAULT 0 NOT NULL,
    "cash_fund" numeric(15,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."stores" OWNER TO "postgres";


COMMENT ON TABLE "public"."stores" IS 'Cửa hàng';



CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid" NOT NULL
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_settings" IS 'Lưu cấu hình chung của hệ thống ( mk xóa,... )';



CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "employee_id" "uuid",
    "update_at" timestamp with time zone,
    "customer_id" "uuid",
    "transaction_type" character varying,
    "debit_amount" integer DEFAULT 0,
    "credit_amount" integer DEFAULT 0,
    "description" "text",
    "store_id" "uuid" NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "employee_name" "text"
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."transactions" IS 'Quản lý thu chi';



ALTER TABLE ONLY "public"."collaterals"
    ADD CONSTRAINT "collaterals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_history"
    ADD CONSTRAINT "credit_amount_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits"
    ADD CONSTRAINT "credits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_permissions"
    ADD CONSTRAINT "employee_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_extension_histories"
    ADD CONSTRAINT "extensions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."installment_history"
    ADD CONSTRAINT "installment_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."installments"
    ADD CONSTRAINT "installments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pawn_history"
    ADD CONSTRAINT "pawn_amount_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pawns"
    ADD CONSTRAINT "pawns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."store_fund_history"
    ADD CONSTRAINT "store_fund_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."store_total_fund"
    ADD CONSTRAINT "store_total_fund_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



CREATE INDEX "employees_uid_idx" ON "public"."employees" USING "btree" ("id");



CREATE INDEX "idx_credit_amount_history_credit_id" ON "public"."credit_history" USING "btree" ("credit_id");



CREATE INDEX "idx_credits_customer_id" ON "public"."credits" USING "btree" ("customer_id");



CREATE INDEX "idx_credits_status" ON "public"."credits" USING "btree" ("status");



CREATE INDEX "idx_credits_store_id" ON "public"."credits" USING "btree" ("store_id");



CREATE INDEX "idx_customers_store_id" ON "public"."customers" USING "btree" ("store_id");



CREATE INDEX "idx_employee_permissions_employee_id" ON "public"."employee_permissions" USING "btree" ("employee_id");



CREATE INDEX "idx_employee_permissions_permission_id" ON "public"."employee_permissions" USING "btree" ("permission_id");



CREATE INDEX "idx_extensions_credit_id" ON "public"."credit_extension_histories" USING "btree" ("credit_id");



CREATE INDEX "idx_installments_customer_id" ON "public"."installments" USING "btree" ("customer_id");



CREATE INDEX "idx_installments_debt_amount" ON "public"."installments" USING "btree" ("debt_amount");



CREATE INDEX "idx_installments_employee_id" ON "public"."installments" USING "btree" ("employee_id");



CREATE INDEX "idx_installments_status" ON "public"."installments" USING "btree" ("status");



CREATE INDEX "idx_pawn_amount_history_employee_id" ON "public"."pawn_history" USING "btree" ("created_by");



CREATE INDEX "idx_pawn_amount_history_pawn_id" ON "public"."pawn_history" USING "btree" ("pawn_id");



CREATE INDEX "idx_pawns_collateral_id" ON "public"."pawns" USING "btree" ("collateral_id");



CREATE INDEX "idx_pawns_contract_code" ON "public"."pawns" USING "btree" ("contract_code");



CREATE INDEX "idx_pawns_customer_id" ON "public"."pawns" USING "btree" ("customer_id");



CREATE INDEX "idx_pawns_status" ON "public"."pawns" USING "btree" ("status");



CREATE INDEX "idx_pawns_store_id" ON "public"."pawns" USING "btree" ("store_id");



CREATE INDEX "idx_profiles_is_banned" ON "public"."profiles" USING "btree" ("is_banned");



CREATE INDEX "idx_store_fund_history_created_at" ON "public"."store_fund_history" USING "btree" ("created_at");



CREATE INDEX "idx_store_fund_history_store_id" ON "public"."store_fund_history" USING "btree" ("store_id");



CREATE INDEX "stores_is_deleted_idx" ON "public"."stores" USING "btree" ("is_deleted");



CREATE INDEX "stores_name_idx" ON "public"."stores" USING "btree" ("name");



CREATE INDEX "stores_status_idx" ON "public"."stores" USING "btree" ("status");



ALTER TABLE ONLY "public"."collaterals"
    ADD CONSTRAINT "collaterals_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_extension_histories"
    ADD CONSTRAINT "credit_extension_histories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_extension_histories"
    ADD CONSTRAINT "credit_extension_histories_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_history"
    ADD CONSTRAINT "credit_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_history"
    ADD CONSTRAINT "credit_history_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_history"
    ADD CONSTRAINT "credit_history_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credits"
    ADD CONSTRAINT "credits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credits"
    ADD CONSTRAINT "credits_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_permissions"
    ADD CONSTRAINT "employee_permissions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."employee_permissions"
    ADD CONSTRAINT "employee_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."installment_history"
    ADD CONSTRAINT "installment_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."installment_history"
    ADD CONSTRAINT "installment_history_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."installment_history"
    ADD CONSTRAINT "installment_history_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."installments"
    ADD CONSTRAINT "installments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."installments"
    ADD CONSTRAINT "installments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pawn_history"
    ADD CONSTRAINT "pawn_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pawn_history"
    ADD CONSTRAINT "pawn_history_pawn_id_fkey" FOREIGN KEY ("pawn_id") REFERENCES "public"."pawns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pawn_history"
    ADD CONSTRAINT "pawn_history_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pawns"
    ADD CONSTRAINT "pawns_collateral_id_fkey" FOREIGN KEY ("collateral_id") REFERENCES "public"."collaterals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pawns"
    ADD CONSTRAINT "pawns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pawns"
    ADD CONSTRAINT "pawns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."store_fund_history"
    ADD CONSTRAINT "store_fund_history_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."store_total_fund"
    ADD CONSTRAINT "store_total_fund_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_employee_name_fkey" FOREIGN KEY ("employee_name") REFERENCES "public"."profiles"("username");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can delete stores" ON "public"."stores" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND ("is_deleted" = false))) WITH CHECK (("is_deleted" = true));



CREATE POLICY "Authenticated users can insert stores" ON "public"."stores" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read stores" ON "public"."stores" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ("is_deleted" = false)));



CREATE POLICY "Authenticated users can update their stores" ON "public"."stores" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Employees can only update their own record" ON "public"."employees" FOR UPDATE USING ((("auth"."uid"() = "id") OR (("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "Employees can only view their own record" ON "public"."employees" FOR SELECT USING ((("auth"."uid"() = "id") OR (("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "Users can create their profile" ON "public"."profiles" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can delete employee permissions from their stores" ON "public"."employee_permissions" FOR DELETE USING ((("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."store_id" IN ( SELECT "employees_1"."store_id"
           FROM "public"."employees" "employees_1"
          WHERE ("employees_1"."id" = "auth"."uid"()))))) OR (("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "Users can insert credit amount history" ON "public"."credit_history" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can insert employee permissions to their stores" ON "public"."employee_permissions" FOR INSERT WITH CHECK ((("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."store_id" IN ( SELECT "employees_1"."store_id"
           FROM "public"."employees" "employees_1"
          WHERE ("employees_1"."id" = "auth"."uid"()))))) OR (("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "Users can only view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update employee permissions from their stores" ON "public"."employee_permissions" FOR UPDATE USING ((("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."store_id" IN ( SELECT "employees_1"."store_id"
           FROM "public"."employees" "employees_1"
          WHERE ("employees_1"."id" = "auth"."uid"()))))) OR (("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "Users can update their own credit amount history" ON "public"."credit_history" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view credit amount history" ON "public"."credit_history" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view employee permissions from their stores" ON "public"."employee_permissions" FOR SELECT USING ((("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."store_id" IN ( SELECT "employees_1"."store_id"
           FROM "public"."employees" "employees_1"
          WHERE ("employees_1"."id" = "auth"."uid"()))))) OR (("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")));



ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_expected_until"("p_credit_id" "uuid", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calc_expected_until"("p_credit_id" "uuid", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_expected_until"("p_credit_id" "uuid", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_interest_segment"("p_principal" numeric, "p_daily_rate" numeric, "p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calc_interest_segment"("p_principal" numeric, "p_daily_rate" numeric, "p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_interest_segment"("p_principal" numeric, "p_daily_rate" numeric, "p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_pawn_expected_until"("p_pawn_id" "uuid", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calc_pawn_expected_until"("p_pawn_id" "uuid", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_pawn_expected_until"("p_pawn_id" "uuid", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_pawn_pawn_interest_segment"("p_principal" numeric, "p_daily_rate" numeric, "p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calc_pawn_pawn_interest_segment"("p_principal" numeric, "p_daily_rate" numeric, "p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_pawn_pawn_interest_segment"("p_principal" numeric, "p_daily_rate" numeric, "p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."credit_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."credit_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."credit_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_credit_statuses"("p_credit_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_credit_statuses"("p_credit_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_credit_statuses"("p_credit_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_credits_with_latest_payments"("store_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_credits_with_latest_payments"("store_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_credits_with_latest_payments"("store_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_principal"("p_credit_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_principal"("p_credit_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_principal"("p_credit_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_expected_interest"("p_credit_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_expected_interest"("p_credit_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_expected_interest"("p_credit_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_installment_old_debt"("p_installment_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_installment_old_debt"("p_installment_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_installment_old_debt"("p_installment_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_installment_statuses"("p_installment_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_installment_statuses"("p_installment_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_installment_statuses"("p_installment_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_latest_installment_payment_paid_dates"("p_installment_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_latest_installment_payment_paid_dates"("p_installment_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_latest_installment_payment_paid_dates"("p_installment_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_latest_payment_paid_dates"("p_credit_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_latest_payment_paid_dates"("p_credit_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_latest_payment_paid_dates"("p_credit_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_payment_info"("p_credit_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_payment_info"("p_credit_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_payment_info"("p_credit_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_old_debt"("p_credit_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_old_debt"("p_credit_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_old_debt"("p_credit_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_paid_interest"("p_credit_ids" "uuid"[], "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_paid_interest"("p_credit_ids" "uuid"[], "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_paid_interest"("p_credit_ids" "uuid"[], "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pawn_current_principal"("p_pawn_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pawn_current_principal"("p_pawn_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pawn_current_principal"("p_pawn_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pawn_expected_interest"("p_pawn_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pawn_expected_interest"("p_pawn_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pawn_expected_interest"("p_pawn_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pawn_next_payment_info"("p_pawn_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pawn_next_payment_info"("p_pawn_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pawn_next_payment_info"("p_pawn_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pawn_old_debt"("p_pawn_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pawn_old_debt"("p_pawn_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pawn_old_debt"("p_pawn_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pawn_paid_interest"("p_pawn_ids" "uuid"[], "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pawn_paid_interest"("p_pawn_ids" "uuid"[], "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pawn_paid_interest"("p_pawn_ids" "uuid"[], "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pawn_statuses"("p_pawn_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pawn_statuses"("p_pawn_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pawn_statuses"("p_pawn_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pawns_with_latest_payments"("store_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pawns_with_latest_payments"("store_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pawns_with_latest_payments"("store_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."installment_get_collected_profit"("p_installment_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."installment_get_collected_profit"("p_installment_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."installment_get_collected_profit"("p_installment_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."installment_get_paid_amount"("p_installment_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."installment_get_paid_amount"("p_installment_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."installment_get_paid_amount"("p_installment_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."installment_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."installment_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."installment_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."installment_next_unpaid_date"("p_installment_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."installment_next_unpaid_date"("p_installment_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."installment_next_unpaid_date"("p_installment_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."installment_overdue_stats"("p_installment_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."installment_overdue_stats"("p_installment_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."installment_overdue_stats"("p_installment_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."pawn_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."pawn_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pawn_get_totals"("p_store_id" "uuid", "p_filters" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_credits_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_credits_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_credits_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_installments_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_installments_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_installments_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_pawns_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_pawns_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_pawns_unaccent"("p_customer_name" "text", "p_contract_code" "text", "p_start_date" "date", "p_end_date" "date", "p_duration" integer, "p_status" "text", "p_store_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON TABLE "public"."collaterals" TO "anon";
GRANT ALL ON TABLE "public"."collaterals" TO "authenticated";
GRANT ALL ON TABLE "public"."collaterals" TO "service_role";



GRANT ALL ON TABLE "public"."credit_extension_histories" TO "anon";
GRANT ALL ON TABLE "public"."credit_extension_histories" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_extension_histories" TO "service_role";



GRANT ALL ON TABLE "public"."credit_history" TO "anon";
GRANT ALL ON TABLE "public"."credit_history" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_history" TO "service_role";



GRANT ALL ON TABLE "public"."credits" TO "anon";
GRANT ALL ON TABLE "public"."credits" TO "authenticated";
GRANT ALL ON TABLE "public"."credits" TO "service_role";



GRANT ALL ON TABLE "public"."credits_by_store" TO "anon";
GRANT ALL ON TABLE "public"."credits_by_store" TO "authenticated";
GRANT ALL ON TABLE "public"."credits_by_store" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."employee_permissions" TO "anon";
GRANT ALL ON TABLE "public"."employee_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."installment_history" TO "anon";
GRANT ALL ON TABLE "public"."installment_history" TO "authenticated";
GRANT ALL ON TABLE "public"."installment_history" TO "service_role";



GRANT ALL ON TABLE "public"."installments" TO "anon";
GRANT ALL ON TABLE "public"."installments" TO "authenticated";
GRANT ALL ON TABLE "public"."installments" TO "service_role";



GRANT ALL ON TABLE "public"."installments_by_store" TO "anon";
GRANT ALL ON TABLE "public"."installments_by_store" TO "authenticated";
GRANT ALL ON TABLE "public"."installments_by_store" TO "service_role";



GRANT ALL ON TABLE "public"."pawn_history" TO "anon";
GRANT ALL ON TABLE "public"."pawn_history" TO "authenticated";
GRANT ALL ON TABLE "public"."pawn_history" TO "service_role";



GRANT ALL ON TABLE "public"."pawns" TO "anon";
GRANT ALL ON TABLE "public"."pawns" TO "authenticated";
GRANT ALL ON TABLE "public"."pawns" TO "service_role";



GRANT ALL ON TABLE "public"."pawns_by_store" TO "anon";
GRANT ALL ON TABLE "public"."pawns_by_store" TO "authenticated";
GRANT ALL ON TABLE "public"."pawns_by_store" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."store_fund_history" TO "anon";
GRANT ALL ON TABLE "public"."store_fund_history" TO "authenticated";
GRANT ALL ON TABLE "public"."store_fund_history" TO "service_role";



GRANT ALL ON TABLE "public"."store_total_fund" TO "anon";
GRANT ALL ON TABLE "public"."store_total_fund" TO "authenticated";
GRANT ALL ON TABLE "public"."store_total_fund" TO "service_role";



GRANT ALL ON TABLE "public"."stores" TO "anon";
GRANT ALL ON TABLE "public"."stores" TO "authenticated";
GRANT ALL ON TABLE "public"."stores" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






RESET ALL;
