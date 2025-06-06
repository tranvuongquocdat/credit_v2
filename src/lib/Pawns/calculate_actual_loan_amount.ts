import { supabase } from '../supabase';

/**
 * Tính số tiền thực tế của hợp đồng vay
 * Bao gồm: tiền vay ban đầu + vay thêm - trả bớt gốc (từ history chưa delete)
 * @param pawnId ID của hợp đồng vay
 * @returns Promise<number> Số tiền thực tế hiện tại
 */
export async function calculateActualLoanAmount(pawnId: string): Promise<number> {
  try {
    // 1. Lấy thông tin hợp đồng ban đầu
    const { data: pawnData, error: pawnError } = await supabase
      .from('pawns')
      .select('loan_amount')
      .eq('id', pawnId)
      .single();

    if (pawnError) {
      throw pawnError;
    }

    if (!pawnData) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    let actualAmount = pawnData.loan_amount || 0;

    // 2. Lấy lịch sử thay đổi từ pawn_history
    const { data: historyData, error: historyError } = await supabase
      .from('pawn_history')
      .select('transaction_type, credit_amount, debit_amount')
      .eq('pawn_id', pawnId)
      .eq('is_deleted', false)
      .in('transaction_type', ['additional_loan', 'principal_repayment']);

    if (historyError) {
      throw historyError;
    }

    // 3. Tính toán dựa trên lịch sử
    if (historyData) {
      historyData.forEach(record => {
        if (record.transaction_type === 'additional_loan') {
          // Vay thêm: cộng vào số tiền
          actualAmount += (record.debit_amount || 0);
        } else if (record.transaction_type === 'principal_repayment') {
          // Trả bớt gốc: trừ khỏi số tiền
          actualAmount -= (record.credit_amount || 0);
        }
      });
    }

    console.log(`Pawn ${pawnId}: Initial = ${pawnData.loan_amount}, Actual = ${actualAmount}`);
    
    return Math.max(0, actualAmount); // Đảm bảo không âm
  } catch (error) {
    console.error(`Error calculating actual loan amount for pawn ${pawnId}:`, error);
    throw error;
  }
} 