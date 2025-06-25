/**
 * Pawn Amount History Management
 * Handles recording and tracking of pawn contract amount changes
 */

import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '../auth';

interface ContractReopeningResult {
  success: boolean;
  lastClosureAmount: number;
  message?: string;
  data?: any;
  error?: any;
}

/**
 * Records the reopening of a contract from closed status
 * @param pawnId - The ID of the pawn contract
 * @param transactionDate - The date when the contract is reopened
 * @param description - Optional description about the reopening
 * @returns Promise with the result including the last closure amount
 */
export async function recordContractReopening(
  pawnId: string,
  transactionDate: string,
  description?: string
) {
  try {
    const { id: userId } = await getCurrentUser();
    // Lấy lịch sử đóng hợp đồng gần nhất
    const { data: closureHistory, error: closureError } = await supabase
      .from('pawn_history')
      .select('credit_amount')
      .eq('pawn_id', pawnId)
      .eq('transaction_type', 'contract_close')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (closureError) {
      console.warn('Error fetching closure history:', closureError);
      // Continue despite error, using 0 as default
    }
    
    // Số tiền đóng hợp đồng gần nhất (mặc định là 0 nếu không tìm thấy)
    const lastClosureAmount = (closureHistory && closureHistory.length > 0) 
      ? closureHistory[0].credit_amount 
      : 0;

    // Ghi lại lịch sử mở khóa hợp đồng với số tiền đóng hợp đồng gần nhất vào debit_amount
    const { data, error } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: 'contract_reopen',
        pawn_amount: 0,
        debit_amount: lastClosureAmount, // Lấy số tiền đóng hợp đồng gần nhất
        description: description || 'Mở lại hợp đồng',
        created_by: userId
        // transaction_date field is no longer used, created_at is set automatically
      } as any)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null, lastClosureAmount };

  } catch (error) {
    console.error('Error recording contract reopening:', error);
    return { 
      success: false,
      lastClosureAmount: 0,
      data: null,
      error,
      message: 'Failed to record contract reopening'
    };
  }
}