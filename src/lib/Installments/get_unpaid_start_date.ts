import { convertFromHistoryToTimeArrayWithStatus } from './convert_from_history_to_time_array';
import { getExpectedMoney } from './get_expected_money';
import { supabase } from '../supabase';
import { getinstallmentPaymentHistory } from './payment_history';

/**
 * Tìm ngày bắt đầu chưa đóng (ngày sau kỳ cuối cùng đã đóng)
 * @param creditId - ID của hợp đồng credit
 * @returns Promise<string | null> - Ngày bắt đầu chưa đóng (YYYY-MM-DD) hoặc null nếu chưa có kỳ nào được đóng
 */
export async function getUnpaidStartDate(installmentId: string): Promise<string | null> {
  try {
    // 1. Lấy thông tin hợp đồng
    const { data: installment, error: installmentError } = await supabase
      .from('installments')
      .select('loan_date, payment_period')
      .eq('id', installmentId)
      .single();

    if (installmentError || !installment) {
      throw new Error('Không thể lấy thông tin hợp đồng');
    }

    // 2. Lấy lịch sử thanh toán
    const paymentHistory = await getinstallmentPaymentHistory(installmentId);

    // 3. Lấy số tiền lãi dự kiến hàng ngày
    const dailyAmounts = await getExpectedMoney(installmentId);

    // 4. Tính thời gian vay
    const loanStartDate = installment.loan_date;
    const startDate = new Date(loanStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + dailyAmounts.length - 1);
    const loanEndDate = endDate.toISOString().split('T')[0];

    // 5. Tạo periods và statuses
    const interestPeriod = installment.payment_period || 30;
    const { periods: timePeriods, statuses } = convertFromHistoryToTimeArrayWithStatus(
      loanStartDate,
      loanEndDate,
      interestPeriod,
      paymentHistory,
      paymentHistory
    );

    // 6. Tìm kỳ mới nhất đã đóng
    let latestPaidPeriodIndex = -1;
    for (let i = statuses.length - 1; i >= 0; i--) {
      if (statuses[i] === true) {
        latestPaidPeriodIndex = i;
        break;
      }
    }

    // 7. Nếu chưa có kỳ nào được đóng, trả về ngày bắt đầu vay
    if (latestPaidPeriodIndex === -1) {
      return loanStartDate;
    }

    // 8. Tính ngày bắt đầu chưa đóng = ngày sau kỳ cuối cùng đã đóng
    const latestPaidPeriod = timePeriods[latestPaidPeriodIndex];
    const latestPaidEndDate = new Date(latestPaidPeriod[1]); // end_date của kỳ cuối đã đóng
    
    // Ngày bắt đầu chưa đóng = ngày sau kỳ cuối đã đóng
    const unpaidStartDate = new Date(latestPaidEndDate);
    unpaidStartDate.setDate(latestPaidEndDate.getDate() + 1);
    
    return unpaidStartDate.toISOString().split('T')[0];

  } catch (error) {
    console.error('Error getting unpaid start date:', error);
    throw error;
  }
} 