
import { supabase } from '../supabase';

/**
 * Tính số tiền nợ từ kỳ đầu tiên đến kỳ mới nhất đã đóng
 * Số nợ = Expected amount - Actual amount - Debt payments (chỉ tính đến kỳ mới nhất đã check)
 * 
 * @param pawnId - ID của hợp đồng pawn
 * @returns Promise<number> - Số tiền nợ đến kỳ mới nhất đã đóng
 */
export async function calculateDebtToLatestPaidPeriod(pawnId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_pawn_old_debt', {
      p_pawn_ids: [pawnId],
    });

    if (error) throw error;

    return data?.[0]?.old_debt ?? 0;
  } catch (error) {
    console.error('Error calculating debt to latest paid period:', error);
    return 0;
  }
} 