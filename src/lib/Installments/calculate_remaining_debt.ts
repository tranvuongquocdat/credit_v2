import { supabase } from '../supabase';

/**
 * Tính số tiền nợ từ kỳ đầu tiên đến kỳ mới nhất đã đóng
 * Số nợ = Expected amount - Actual amount - Debt payments (chỉ tính đến kỳ mới nhất đã check)
 * 
 * @param installmentId - ID của hợp đồng installment
 * @returns Promise<number> - Số tiền nợ đến kỳ mới nhất đã đóng
 */
export async function calculateDebtToLatestPaidPeriod(installmentId: string): Promise<number> {
  const { data, error } = await (supabase.rpc as any)(
    'get_installment_old_debt',
    { p_installment_ids: [installmentId] },
  ).single();

  if (error) {
    console.error('RPC get_installment_old_debt', error);
    return 0;
  }
  return data ? data.old_debt : 0;
} 