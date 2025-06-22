import { supabase } from '../supabase';

/**
 * Tính số tiền nợ từ kỳ đầu tiên đến kỳ mới nhất đã đóng
 * Số nợ = Expected amount - Actual amount - Debt payments (chỉ tính đến kỳ mới nhất đã check)
 * 
 * @param creditId - ID của hợp đồng credit
 * @returns Promise<number> - Số tiền nợ đến kỳ mới nhất đã đóng
 */
export async function calculateDebtToLatestPaidPeriod(creditId: string) {
  const { data, error } = await supabase.rpc('get_old_debt', {
    p_credit_ids: [creditId],
  });

  if (error) throw error;

  return data?.[0]?.old_debt ?? 0;
} 