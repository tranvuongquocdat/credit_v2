
import { supabase } from '../supabase';
import { calculateDaysBetween } from '../utils';
import { getExpectedMoney } from './get_expected_money';

/**
 * Tính số tiền nợ từ kỳ đầu tiên đến kỳ mới nhất đã đóng
 * Số nợ = Expected amount - Actual amount - Debt payments (chỉ tính đến kỳ mới nhất đã check)
 * 
 * @param installmentId - ID của hợp đồng installment
 * @returns Promise<number> - Số tiền nợ đến kỳ mới nhất đã đóng
 */
export async function calculateDebtToLatestPaidPeriod(installmentId: string): Promise<number> {
  try {
    // lấy ra ngày bắt đầu hợp đồng
    const { data: installment, error: installmentError } = await supabase
      .from('installments')
      .select('loan_date, status')
      .eq('id', installmentId)
      .single();

    if (installmentError) {
      throw new Error('Error fetching installment');
    }

    // need review
    if (installment.status == 'closed') {
      return 0
    }
    
    const startDate = installment.loan_date;

    // truy vấn lịch sử thanh toán lãi ( transaction_type = 'payment' và is_deleted = false)
    const { data: paymentHistory, error: paymentHistoryError } = await supabase
      .from('installment_history')
      .select('effective_date, credit_amount')
      .eq('installment_id', installmentId)
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
    // lấy ra tổng installment_amount từ các lịch sử ở trên để ra số tiền thực tế đã thanh toán
    const totalInstallmentAmount = paymentHistory.reduce((sum, record) => sum + (record.credit_amount || 0), 0);

    // gọi hàm getExpectedMoney, cộng tổng expected từ index firstPaidDate - startDate đến lastPaidDate - startDate
    // index tính bằng cách khoảng cách từ ngày bắt đầu hợp đồng đến ngày cần tính
    const startIndex = calculateDaysBetween(new Date(startDate || ''), new Date(firstPaidDate || '')) -1;
    const endIndex = calculateDaysBetween(new Date(startDate || ''), new Date(lastPaidDate || '')) -1;

    // lấy ra tổng expected từ index startIndex đến endIndex
    const expectedAmount = await getExpectedMoney(installmentId) || [];

    // cắt mảng từ startIndex đến endIndex
    const expectedAmountArray = expectedAmount.slice(startIndex, endIndex + 1);

    // cộng tổng expectedAmountArray
    const totalExpectedAmount = expectedAmountArray.reduce((sum, record) => sum + (record || 0), 0);

    // tính số tiền nợ từ kỳ đầu tiên đến kỳ mới nhất đã đóng
    const debt = totalExpectedAmount - totalInstallmentAmount;
    // truy vấn lịch sử thanh toán nợ
    const { data: debtHistory, error: debtHistoryError } = await supabase
      .from('installment_history')
      .select('effective_date, credit_amount, debit_amount')
      .eq('installment_id', installmentId)
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