-- "Phí thuê / lãi phí đến hôm nay" tính TỪ NGÀY ĐÃ ĐÓNG gần nhất, không tính full đời HĐ.
--
-- Vấn đề: cột này đang = calc(hôm nay, rate hiện tại) − lãi đã đóng thực tế.
-- Khi ĐỔI LÃI (ghi đè interest_value, không có lịch sử rate), rate mới bị áp ngược
-- cho cả phần quá khứ đã đóng → số "còn nợ" nhảy loạn.
--
-- Fix: due = max(0, calc_đến(hôm nay) − calc_đến(ngày_đã_đóng_gần_nhất)).
-- Cả 2 mốc cùng rate hiện tại nên phần quá khứ tự triệt tiêu — rate mới chỉ áp cho
-- khoảng chưa đóng. Không đổi lãi thì kết quả trùng công thức cũ.
-- Hủy đóng lãi → ngày-đã-đóng lùi lại, các ngày vừa hủy tính theo rate MỚI (chủ ý,
-- user xác nhận 3/7/2026).
--
-- "Ngày đã đóng" = max(effective_date) của payment chưa hủy — cùng nguồn với
-- get_pawn_next_payment_info / get_next_payment_info nên nhất quán với hạn đóng.
-- ADDITIVE: chỉ thêm RPC mới (v1 + v2 dùng chung DB).

-- ============================================================================
-- 1) Pawn v1 — dùng calc_pawn_expected_until (pro-rata theo gốc)
-- ============================================================================
create or replace function public.get_pawn_due_interest(
  p_pawn_ids uuid[]
) returns table (
  pawn_id      uuid,
  due_interest numeric
) language sql stable as $$
  with lp as (
    select ph.pawn_id, max(ph.effective_date::date) as last_paid
    from pawn_history ph
    where ph.transaction_type = 'payment'
      and ph.is_deleted = false
      and ph.pawn_id = any(p_pawn_ids)
    group by ph.pawn_id
  )
  select
    p.id,
    greatest(0,
      case when current_date < p.loan_date::date then 0
           else public.calc_pawn_expected_until(p.id, current_date) end
      -
      case when lp.last_paid is null or lp.last_paid < p.loan_date::date then 0
           else public.calc_pawn_expected_until(p.id, lp.last_paid) end
    )::numeric as due_interest
  from pawns p
  left join lp on lp.pawn_id = p.id
  where p.id = any(p_pawn_ids);
$$;

grant execute on function public.get_pawn_due_interest(uuid[])
  to authenticated, service_role;

-- ============================================================================
-- 2) Pawn v2 — dùng calc_pawn_expected_until_v2 (flat k_per_day, fallback v1)
-- ============================================================================
create or replace function public.get_pawn_due_interest_v2(
  p_pawn_ids uuid[]
) returns table (
  pawn_id      uuid,
  due_interest numeric
) language sql stable
security definer
set search_path = public
as $$
  with lp as (
    select ph.pawn_id, max(ph.effective_date::date) as last_paid
    from pawn_history ph
    where ph.transaction_type = 'payment'
      and ph.is_deleted = false
      and ph.pawn_id = any(p_pawn_ids)
    group by ph.pawn_id
  )
  select
    p.id,
    greatest(0,
      case when current_date < p.loan_date::date then 0
           else public.calc_pawn_expected_until_v2(p.id, current_date) end
      -
      case when lp.last_paid is null or lp.last_paid < p.loan_date::date then 0
           else public.calc_pawn_expected_until_v2(p.id, lp.last_paid) end
    )::numeric as due_interest
  from pawns p
  left join lp on lp.pawn_id = p.id
  where p.id = any(p_pawn_ids);
$$;

grant execute on function public.get_pawn_due_interest_v2(uuid[])
  to authenticated, service_role;

-- ============================================================================
-- 3) Credit v1 — dùng calc_expected_until
-- ============================================================================
create or replace function public.get_credit_due_interest(
  p_credit_ids uuid[]
) returns table (
  credit_id    uuid,
  due_interest numeric
) language sql stable as $$
  with lp as (
    select ch.credit_id, max(ch.effective_date::date) as last_paid
    from credit_history ch
    where ch.transaction_type = 'payment'
      and ch.is_deleted = false
      and ch.credit_id = any(p_credit_ids)
    group by ch.credit_id
  )
  select
    c.id,
    greatest(0,
      case when current_date < c.loan_date::date then 0
           else public.calc_expected_until(c.id, current_date) end
      -
      case when lp.last_paid is null or lp.last_paid < c.loan_date::date then 0
           else public.calc_expected_until(c.id, lp.last_paid) end
    )::numeric as due_interest
  from credits c
  left join lp on lp.credit_id = c.id
  where c.id = any(p_credit_ids);
$$;

grant execute on function public.get_credit_due_interest(uuid[])
  to authenticated, service_role;
