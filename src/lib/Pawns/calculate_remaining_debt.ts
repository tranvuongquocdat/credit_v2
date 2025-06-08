
import { supabase } from '../supabase';
import { calculateDaysBetween } from '../utils';
import { getExpectedMoney } from './get_expected_money';

/**
 * Tính số tiền nợ từ kỳ đầu tiên đến kỳ mới nhất đã đóng
 * Số nợ = Expected amount - Actual amount - Debt payments (chỉ tính đến kỳ mới nhất đã check)
 * 
 * @param pawnId - ID của hợp đồng pawn
 * @returns Promise<number> - Số tiền nợ đến kỳ mới nhất đã đóng
 */
export async function calculateDebtToLatestPaidPeriod(pawnId: string): Promise<number> {
  try {
    // lấy ra ngày bắt đầu hợp đồng
    const { data: pawn, error: pawnError } = await supabase
      .from('pawns')
      .select('loan_date, status')
      .eq('id', pawnId)
      .single();

    if (pawnError) {
      throw new Error('Error fetching pawn');
    }

    // need review
    if (pawn.status == 'closed') {
      return 0
    }
    
    const startDate = pawn.loan_date;

    // truy vấn lịch sử thanh toán lãi ( transaction_type = 'payment' và is_deleted = false)
    const { data: paymentHistory, error: paymentHistoryError } = await supabase
      .from('pawn_history')
      .select('effective_date, credit_amount')
      .eq('pawn_id', pawnId)
      .eq('transaction_type', 'payment')
      .eq('is_deleted', false)
      .order('effective_date', { ascending: true });
    if (paymentHistoryError) {
      throw new Error('Error fetching payment history');
    }
    if (paymentHistory.length === 0) {
      return 0;
    }

    // lấy ra effective_date đầu tiên và cuối cùng
    const firstPaidDate = paymentHistory[0].effective_date;
    const lastPaidDate = paymentHistory[paymentHistory.length - 1].effective_date;
    // lấy ra tổng pawn_amount từ các lịch sử ở trên để ra số tiền thực tế đã thanh toán
    const totalPawnAmount = paymentHistory.reduce((sum, record) => sum + (record.credit_amount || 0), 0);

    // gọi hàm getExpectedMoney, cộng tổng expected từ index firstPaidDate - startDate đến lastPaidDate - startDate
    // index tính bằng cách khoảng cách từ ngày bắt đầu hợp đồng đến ngày cần tính
    const startIndex = calculateDaysBetween(new Date(startDate || ''), new Date(firstPaidDate || '')) -1;
    const endIndex = calculateDaysBetween(new Date(startDate || ''), new Date(lastPaidDate || '')) -1;

    // lấy ra tổng expected từ index startIndex đến endIndex
    const expectedAmount = await getExpectedMoney(pawnId) || [];

    // cắt mảng từ startIndex đến endIndex
    const expectedAmountArray = expectedAmount.slice(startIndex, endIndex + 1);

    // cộng tổng expectedAmountArray
    const totalExpectedAmount = expectedAmountArray.reduce((sum, record) => sum + (record || 0), 0);

    // tính số tiền nợ từ kỳ đầu tiên đến kỳ mới nhất đã đóng
    const debt = totalExpectedAmount - totalPawnAmount;
    // truy vấn lịch sử thanh toán nợ
    const { data: debtHistory, error: debtHistoryError } = await supabase
      .from('pawn_history')
      .select('effective_date, credit_amount, debit_amount')
      .eq('pawn_id', pawnId)
      .eq('transaction_type', 'debt_payment')
      .eq('is_deleted', false)
      .order('effective_date', { ascending: true });

    if (debtHistoryError) {
      throw new Error('Error fetching debt history');
    }
    const totalDebtPayment = debtHistory.reduce((sum, record) => sum + (record.credit_amount || 0) - (record.debit_amount || 0), 0);
    return debt - totalDebtPayment;
  } catch (error) {
    console.error('Error calculating debt to latest paid period:', error);
    throw error;
  }
} 