import { getCreditPaymentHistory } from './payment_history';
import { getExpectedMoney } from './create_principal_payment_history';
import { convertFromHistoryToTimeArrayWithStatus } from './convert_from_history_to_time_array';
import { supabase } from '../supabase';

/**
 * Tính số tiền nợ từ kỳ đầu tiên đến kỳ mới nhất đã đóng
 * Số nợ = Expected amount - Actual amount - Debt payments (chỉ tính đến kỳ mới nhất đã check)
 * 
 * @param creditId - ID của hợp đồng credit
 * @returns Promise<number> - Số tiền nợ đến kỳ mới nhất đã đóng
 */
export async function calculateDebtToLatestPaidPeriod(creditId: string): Promise<number> {
  try {
    // 1. Lấy thông tin hợp đồng
    const { data: credit, error: creditError } = await supabase
      .from('credits')
      .select('loan_date, interest_period')
      .eq('id', creditId)
      .single();

    if (creditError || !credit) {
      throw new Error('Không thể lấy thông tin hợp đồng');
    }

    // 2. Lấy lịch sử thanh toán lãi phí (lọc bỏ records đã xóa)
    const allPaymentHistory = await getCreditPaymentHistory(creditId);
    const paymentHistory = allPaymentHistory.filter(record => !record.is_deleted);

    // 3. Lấy lịch sử thanh toán nợ (debt_payment)
    const { data: debtPaymentHistory, error: debtPaymentError } = await supabase
      .from('credit_history')
      .select('*')
      .eq('credit_id', creditId)
      .eq('transaction_type', 'debt_payment')
      .eq('is_deleted', false);

    if (debtPaymentError) {
      console.error('Error fetching debt payment history:', debtPaymentError);
      // Tiếp tục mà không có debt payment history
    }

    // 4. Lấy số tiền lãi dự kiến hàng ngày
    const dailyAmounts = await getExpectedMoney(creditId);

    // 5. Tính thời gian vay
    const loanStartDate = credit.loan_date;
    const startDate = new Date(loanStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + dailyAmounts.length - 1);
    const loanEndDate = endDate.toISOString().split('T')[0];

    // 6. Tạo periods và statuses
    const interestPeriod = credit.interest_period || 30;
    const { periods: timePeriods, statuses } = convertFromHistoryToTimeArrayWithStatus(
      loanStartDate,
      loanEndDate,
      interestPeriod,
      paymentHistory,
      paymentHistory
    );

    // 7. Tìm kỳ mới nhất đã đóng (index của kỳ cuối cùng có status = true)
    let latestPaidPeriodIndex = -1;
    for (let i = statuses.length - 1; i >= 0; i--) {
      if (statuses[i] === true) {
        latestPaidPeriodIndex = i;
        break;
      }
    }

    // Nếu chưa có kỳ nào được đóng, trả về 0
    if (latestPaidPeriodIndex === -1) {
      return 0;
    }

    // 8. Tính expected và actual từ kỳ đầu tiên đến kỳ mới nhất đã đóng
    let totalExpected = 0;
    let totalPaid = 0;
    const loanStart = new Date(loanStartDate);

    // Tính ngày kết thúc của kỳ mới nhất đã đóng để filter debt payments
    const latestPaidPeriodEndDate = timePeriods[latestPaidPeriodIndex][1];

    for (let index = 0; index <= latestPaidPeriodIndex; index++) {
      const [start_date, end_date] = timePeriods[index];
      const isChecked = statuses[index];

      // Tính expected amount cho kỳ này
      const periodStartDate = new Date(start_date);
      const periodEndDate = new Date(end_date);
      const startDayIndex = Math.floor((periodStartDate.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
      const endDayIndex = Math.floor((periodEndDate.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));

      let expectedAmount = 0;
      for (let dayIndex = startDayIndex; dayIndex <= endDayIndex && dayIndex < dailyAmounts.length; dayIndex++) {
        if (dayIndex >= 0) {
          expectedAmount += dailyAmounts[dayIndex];
        }
      }
      totalExpected += expectedAmount;

      // Tính actual amount cho kỳ này
      if (isChecked) {
        const periodPayments = paymentHistory.filter(payment => {
          const paymentDate = payment.effective_date?.split('T')[0] || '';
          const startDateStr = start_date.split('T')[0];
          const endDateStr = end_date.split('T')[0];
          return paymentDate >= startDateStr && paymentDate <= endDateStr;
        });

        const actualAmount = periodPayments.reduce((sum, payment) => {
          return sum + (payment.credit_amount || 0) - (payment.debit_amount || 0);
        }, 0);

        totalPaid += actualAmount;
      }
    }

    // 9. Tính tổng số tiền thanh toán nợ đến kỳ mới nhất đã đóng
    let totalDebtPayments = 0;
    if (debtPaymentHistory && debtPaymentHistory.length > 0) {
      // Lọc các debt payments đến ngày kết thúc kỳ mới nhất đã đóng
      const relevantDebtPayments = debtPaymentHistory.filter(debtPayment => {
        const paymentDate = debtPayment.effective_date?.split('T')[0] || debtPayment.created_at?.split('T')[0] || '';
        const endDateStr = latestPaidPeriodEndDate.split('T')[0];
        return paymentDate <= endDateStr;
      });

      totalDebtPayments = relevantDebtPayments.reduce((sum, debtPayment) => {
        // credit_amount: khách trả nợ (giảm nợ)
        // debit_amount: hoàn trả tiền thừa cho khách (tăng nợ âm/giảm nợ dương)
        return sum + (debtPayment.credit_amount || 0) - (debtPayment.debit_amount || 0);
      }, 0);
    }

    // 10. Số nợ = Expected - Actual - Debt Payments (đến kỳ mới nhất đã đóng)
    const finalDebt = totalExpected - totalPaid - totalDebtPayments;
    
    console.log('=== Calculate Debt Debug ===');
    console.log('Total Expected:', totalExpected);
    console.log('Total Paid (from payments):', totalPaid);
    console.log('Total Debt Payments:', totalDebtPayments);
    console.log('Final Debt:', finalDebt);
    console.log('============================');

    return Math.round(finalDebt);

  } catch (error) {
    console.error('Error calculating debt to latest paid period:', error);
    throw error;
  }
} 