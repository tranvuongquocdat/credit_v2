import { format, startOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';

export interface ChartDataPoint {
  month: string;
  choVay: number;
  loiNhuan: number;
}

/**
 * Lấy 3 tháng gần nhất cho biểu đồ Dashboard.
 *
 * Dùng RPC `get_dashboard_chart_metrics` thay cho view để:
 *  - push filter store_id + date range vào từng CTE trong DB (index scan)
 *  - chỉ 1 round trip duy nhất
 *
 * SQL function signature:
 *   get_dashboard_chart_metrics(p_store_id uuid, p_from_month date, p_to_month date)
 */
export async function fetchDashboardChartMetrics(
  storeId: string,
  now: Date = new Date()
): Promise<ChartDataPoint[]> {
  // p_from_month: đầu tháng cũ nhất (2 tháng trước)
  // p_to_month  : đầu tháng hiện tại
  // DB function sẽ trunc cả hai về đầu tháng theo lịch VN
  const fromMonth = format(startOfMonth(subMonths(now, 2)), 'yyyy-MM-dd');
  const toMonth = format(startOfMonth(now), 'yyyy-MM-dd');


  const { data, error } = await supabase.rpc('get_dashboard_chart_metrics', {
    p_store_id: storeId,
    p_from_month: fromMonth,
    p_to_month: toMonth,
  });

  if (error) {
    console.error('[fetchDashboardChartMetrics] rpc error', { storeId, error });
    throw error;
  }


  type Row = {
    month_bucket: string;
    cho_vay: number | string;
    loi_nhuan: number | string;
  };
  const rows = (data ?? []) as Row[];

  const toYearMonth = (bucket: string | null | undefined) =>
    bucket ? String(bucket).slice(0, 7) : '';

  const byMonth = new Map(rows.map((row) => [toYearMonth(row.month_bucket), row]));

  return [2, 1, 0].map((offset) => {
    const monthDate = subMonths(now, offset);
    const key = format(startOfMonth(monthDate), 'yyyy-MM');
    const row = byMonth.get(key);
    return {
      month: format(monthDate, 'MM/yyyy'),
      choVay: Number(row?.cho_vay ?? 0),
      loiNhuan: Number(row?.loi_nhuan ?? 0),
    };
  });
}
