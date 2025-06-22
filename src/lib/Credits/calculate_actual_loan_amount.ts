import { supabase } from '../supabase';

/**
 * Tính số tiền thực tế của hợp đồng vay
 * Bao gồm: tiền vay ban đầu + vay thêm - trả bớt gốc (từ history chưa delete)
 * @param creditId ID của hợp đồng vay
 * @returns Promise<number> Số tiền thực tế hiện tại
 */
export async function calculateActualLoanAmount(creditId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_current_principal', {
      p_credit_ids: [creditId],
    });

    if (error) throw error;

    return data?.[0]?.current_principal ?? 0;
  } catch (error) {
    console.error('Error calculating actual loan amount:', error);
    return 0;
  }
}