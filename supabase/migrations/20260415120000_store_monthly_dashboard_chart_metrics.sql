-- RPC function thay thế VIEW store_monthly_dashboard_chart_metrics.
--
-- Lý do dùng function thay vì view:
--   - View không nhận tham số → Supabase phải fetch toàn bộ dữ liệu rồi filter ở client
--     (hoặc PostgREST thêm WHERE ngoài CTE → planner không đẩy được vào từng CTE).
--   - Function nhận p_store_id + p_from_month/p_to_month → filter ngay trong từng CTE
--     → index scan thay vì seq scan, giảm I/O đáng kể.
--   - 1 round trip duy nhất: supabase.rpc('get_dashboard_chart_metrics', { ... })
--
-- Logic giữ nguyên migration cũ:
--   - Cho vay: SUM loan_amount / installment_amount theo loan_date (pawns, credits, installments).
--   - Lợi nhuận: SUM credit_amount trên history theo created_at.
--   - Không lọc is_deleted trên history (giữ nguyên hành vi client cũ).
--   - date_trunc trên (col AT TIME ZONE 'Asia/Ho_Chi_Minh') để đúng lịch VN.

-- Drop view cũ nếu tồn tại (migration đầu tiên tạo view, migration này thay bằng function)
DROP VIEW IF EXISTS public.store_monthly_dashboard_chart_metrics;

-- ============================================================
-- RPC: get_dashboard_chart_metrics
-- Params:
--   p_store_id  uuid        – store cần lấy dữ liệu
--   p_from_month date       – tháng bắt đầu (ngày bất kỳ trong tháng, sẽ trunc về đầu tháng)
--   p_to_month   date       – tháng kết thúc (inclusive, sẽ trunc về đầu tháng)
--
-- Returns TABLE:
--   month_bucket          date
--   cho_vay_pawn          numeric
--   cho_vay_credit        numeric
--   cho_vay_installment   numeric
--   cho_vay               numeric   (tổng 3 loại)
--   loi_nhuan_pawn        numeric
--   loi_nhuan_credit      numeric
--   loi_nhuan_installment numeric
--   loi_nhuan             numeric   (tổng 3 loại)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_chart_metrics(
  p_store_id  uuid,
  p_from_month date,
  p_to_month   date
)
RETURNS TABLE (
  month_bucket          date,
  cho_vay_pawn          numeric,
  cho_vay_credit        numeric,
  cho_vay_installment   numeric,
  cho_vay               numeric,
  loi_nhuan_pawn        numeric,
  loi_nhuan_credit      numeric,
  loi_nhuan_installment numeric,
  loi_nhuan             numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
WITH
  -- Chuẩn hoá khoảng tháng về đầu tháng theo lịch VN
  params AS (
    SELECT
      date_trunc('month', p_from_month::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS from_bucket,
      date_trunc('month', p_to_month::timestamptz   AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS to_bucket
  ),

  pawn_loans AS (
    SELECT
      (date_trunc('month', p.loan_date AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS month_bucket,
      COALESCE(SUM(p.loan_amount), 0)::numeric AS cho_vay_pawn
    FROM public.pawns p, params
    WHERE p.store_id = p_store_id
      AND (date_trunc('month', p.loan_date AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date
          BETWEEN params.from_bucket AND params.to_bucket
    GROUP BY 1
  ),

  credit_loans AS (
    SELECT
      (date_trunc('month', c.loan_date AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS month_bucket,
      COALESCE(SUM(c.loan_amount), 0)::numeric AS cho_vay_credit
    FROM public.credits c, params
    WHERE c.store_id = p_store_id
      AND (date_trunc('month', c.loan_date AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date
          BETWEEN params.from_bucket AND params.to_bucket
    GROUP BY 1
  ),

  installment_loans AS (
    SELECT
      (date_trunc('month', i.loan_date AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS month_bucket,
      COALESCE(SUM(i.installment_amount), 0)::numeric AS cho_vay_installment
    FROM public.installments i
    INNER JOIN public.employees e ON e.id = i.employee_id, params
    WHERE e.store_id = p_store_id
      AND (date_trunc('month', i.loan_date AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date
          BETWEEN params.from_bucket AND params.to_bucket
    GROUP BY 1
  ),

  pawn_interest AS (
    SELECT
      (date_trunc('month', ph.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS month_bucket,
      COALESCE(SUM(ph.credit_amount), 0)::numeric AS loi_nhuan_pawn
    FROM public.pawn_history ph
    INNER JOIN public.pawns p ON p.id = ph.pawn_id, params
    WHERE p.store_id = p_store_id
      AND (date_trunc('month', ph.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date
          BETWEEN params.from_bucket AND params.to_bucket
    GROUP BY 1
  ),

  credit_interest AS (
    SELECT
      (date_trunc('month', ch.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS month_bucket,
      COALESCE(SUM(ch.credit_amount), 0)::numeric AS loi_nhuan_credit
    FROM public.credit_history ch
    INNER JOIN public.credits c ON c.id = ch.credit_id, params
    WHERE c.store_id = p_store_id
      AND (date_trunc('month', ch.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date
          BETWEEN params.from_bucket AND params.to_bucket
    GROUP BY 1
  ),

  installment_interest AS (
    SELECT
      (date_trunc('month', ih.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS month_bucket,
      COALESCE(SUM(ih.credit_amount), 0)::numeric AS loi_nhuan_installment
    FROM public.installment_history ih
    INNER JOIN public.installments i ON i.id = ih.installment_id
    INNER JOIN public.employees e ON e.id = i.employee_id, params
    WHERE e.store_id = p_store_id
      AND (date_trunc('month', ih.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date
          BETWEEN params.from_bucket AND params.to_bucket
    GROUP BY 1
  ),

  all_keys AS (
    SELECT month_bucket FROM pawn_loans
    UNION
    SELECT month_bucket FROM credit_loans
    UNION
    SELECT month_bucket FROM installment_loans
    UNION
    SELECT month_bucket FROM pawn_interest
    UNION
    SELECT month_bucket FROM credit_interest
    UNION
    SELECT month_bucket FROM installment_interest
  )

SELECT
  k.month_bucket,
  COALESCE(pl.cho_vay_pawn,          0)::numeric AS cho_vay_pawn,
  COALESCE(cl.cho_vay_credit,        0)::numeric AS cho_vay_credit,
  COALESCE(il.cho_vay_installment,   0)::numeric AS cho_vay_installment,
  (COALESCE(pl.cho_vay_pawn, 0) + COALESCE(cl.cho_vay_credit, 0) + COALESCE(il.cho_vay_installment, 0))::numeric AS cho_vay,
  COALESCE(pi.loi_nhuan_pawn,        0)::numeric AS loi_nhuan_pawn,
  COALESCE(ci.loi_nhuan_credit,      0)::numeric AS loi_nhuan_credit,
  COALESCE(ii.loi_nhuan_installment, 0)::numeric AS loi_nhuan_installment,
  (COALESCE(pi.loi_nhuan_pawn, 0) + COALESCE(ci.loi_nhuan_credit, 0) + COALESCE(ii.loi_nhuan_installment, 0))::numeric AS loi_nhuan
FROM all_keys k
LEFT JOIN pawn_loans          pl ON pl.month_bucket = k.month_bucket
LEFT JOIN credit_loans        cl ON cl.month_bucket = k.month_bucket
LEFT JOIN installment_loans   il ON il.month_bucket = k.month_bucket
LEFT JOIN pawn_interest        pi ON pi.month_bucket = k.month_bucket
LEFT JOIN credit_interest      ci ON ci.month_bucket = k.month_bucket
LEFT JOIN installment_interest ii ON ii.month_bucket = k.month_bucket
ORDER BY k.month_bucket;
$$;

COMMENT ON FUNCTION public.get_dashboard_chart_metrics(uuid, date, date) IS
  'RPC cho dashboard chart: trả về dữ liệu theo tháng (lịch VN) cho 1 store trong khoảng [p_from_month, p_to_month].
   Thay thế VIEW store_monthly_dashboard_chart_metrics để push filter store_id + date range vào từng CTE,
   giảm scan và loại bỏ round trip thừa. Gọi từ client: supabase.rpc(''get_dashboard_chart_metrics'', { p_store_id, p_from_month, p_to_month }).';

-- Cấp quyền EXECUTE cho các role cần thiết
GRANT EXECUTE ON FUNCTION public.get_dashboard_chart_metrics(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_chart_metrics(uuid, date, date) TO anon;
