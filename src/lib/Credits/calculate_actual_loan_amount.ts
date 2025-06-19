import { supabase } from '../supabase';

/**
 * Tính số tiền thực tế của hợp đồng vay
 * Bao gồm: tiền vay ban đầu + vay thêm - trả bớt gốc (từ history chưa delete)
 * @param creditId ID của hợp đồng vay
 * @returns Promise<number> Số tiền thực tế hiện tại
 */
export async function calculateActualLoanAmount(creditId: string): Promise<number> {
  try {
    // 1. Lấy thông tin hợp đồng ban đầu
    const { data: creditData, error: creditError } = await supabase
      .from('credits')
      .select('loan_amount')
      .eq('id', creditId)
      .single();

    if (creditError) {
      throw creditError;
    }

    if (!creditData) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    let actualAmount = creditData.loan_amount || 0;

    // 2. Lấy lịch sử thay đổi từ credit_history
    const { data: historyData, error: historyError } = await supabase
      .from('credit_history')
      .select('transaction_type, credit_amount, debit_amount')
      .eq('credit_id', creditId)
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

    return Math.max(0, actualAmount); // Đảm bảo không âm
  } catch (error) {
    console.error(`Error calculating actual loan amount for credit ${creditId}:`, error);
    throw error;
  }
} 