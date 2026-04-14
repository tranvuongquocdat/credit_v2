-- Option A (Bottleneck 1): một round-trip thay cho chuỗi RPC tuần tự từ useCreditCalculations.
-- Gộp các hàm hiện có; không đổi logic nghiệp vụ bên trong từng RPC.

CREATE OR REPLACE FUNCTION public.get_credit_financial_summary(
  p_all_credit_ids uuid[],
  p_active_credit_ids uuid[],
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN jsonb_build_object(
    'paid_interest_range',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'credit_id', r.credit_id,
            'paid_interest', r.paid_interest
          )
        )
        FROM get_paid_interest(p_all_credit_ids, p_start_date, p_end_date) AS r
      ),
      '[]'::jsonb
    ),
    'paid_interest_total',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'credit_id', t.credit_id,
            'paid_interest', t.paid_interest
          )
        )
        FROM get_paid_interest(p_all_credit_ids) AS t
      ),
      '[]'::jsonb
    ),
    'current_principal',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'credit_id', p.credit_id,
            'current_principal', p.current_principal
          )
        )
        FROM get_current_principal(p_all_credit_ids) AS p
      ),
      '[]'::jsonb
    ),
    'old_debt',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'credit_id', d.credit_id,
            'old_debt', d.old_debt
          )
        )
        FROM get_old_debt(p_active_credit_ids) AS d
      ),
      '[]'::jsonb
    ),
    'expected_interest',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'credit_id', e.credit_id,
            'expected_profit', e.expected_profit,
            'interest_today', e.interest_today
          )
        )
        FROM get_expected_interest(p_all_credit_ids) AS e
      ),
      '[]'::jsonb
    ),
    'latest_payment_paid_dates',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'credit_id', lp.credit_id,
            'latest_paid_date', lp.latest_paid_date
          )
        )
        FROM get_latest_payment_paid_dates(p_all_credit_ids) AS lp
      ),
      '[]'::jsonb
    ),
    'next_payment_info',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'credit_id', np.credit_id,
            'next_date', np.next_date,
            'is_completed', np.is_completed,
            'has_paid', np.has_paid
          )
        )
        FROM get_next_payment_info(p_active_credit_ids) AS np
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_credit_financial_summary(uuid[], uuid[], timestamptz, timestamptz)
  TO anon, authenticated, service_role;
