import { supabase } from '../supabase';
import { getPawnPaymentHistory } from './payment_history';
import { getExpectedMoney } from './get_expected_money';
import { convertFromHistoryToTimeArrayWithStatus } from './convert_from_history_to_time_array';
import { formatCurrency } from '../utils';

/**
 * Xử lý chuộc đồ khi có lãi phí cần thanh toán
 * Tạo các periods và ghi lịch sử thanh toán cho phần lãi còn thiếu
 * 
 * @param pawnId - ID của hợp đồng pawn
 */
export async function processPawnRedemption(pawnId: string): Promise<void> {
  try {
    // 1. Lấy thông tin hợp đồng
    const { data: pawn, error: pawnError } = await supabase
      .from('pawns')
      .select('*')
      .eq('id', pawnId)
      .single();

    if (pawnError || !pawn) {
      throw new Error('Không thể lấy thông tin hợp đồng');
    }

    // 2. Lấy lịch sử thanh toán
    const allPaymentHistory = await getPawnPaymentHistory(pawnId, true);
    const paymentHistory = allPaymentHistory.filter(record => !record.is_deleted);

    // 3. Lấy số tiền lãi dự kiến hàng ngày
    const dailyAmounts = await getExpectedMoney(pawnId);

    // 4. Tính thời gian vay
    const loanStartDate = pawn.loan_date;
    const startDate = new Date(loanStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + dailyAmounts.length - 1);
    const loanEndDate = endDate.toISOString().split('T')[0];

    // 5. Tạo periods và statuses
    const interestPeriod = pawn.interest_period || 30;
    const { periods: timePeriods, statuses } = convertFromHistoryToTimeArrayWithStatus(
      loanStartDate,
      loanEndDate,
      interestPeriod,
      paymentHistory,
      paymentHistory
    );

    // 6. Tìm các kỳ chưa thanh toán và tạo lịch sử thanh toán
    const loanStart = new Date(loanStartDate);
    const today = new Date().toISOString().split('T')[0];

    for (let index = 0; index < timePeriods.length; index++) {
      const isChecked = statuses[index];
      
      // Chỉ xử lý các kỳ chưa thanh toán
      if (!isChecked) {
        const [start_date, end_date] = timePeriods[index];
        
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

        // Tạo lịch sử thanh toán cho kỳ này
        if (expectedAmount > 0) {
          await supabase
            .from('pawn_history')
            .insert({
              pawn_id: pawnId,
              transaction_type: 'interest_payment',
              credit_amount: expectedAmount,
              debit_amount: 0,
              notes: `Thanh toán lãi kỳ ${index + 1} (${start_date} - ${end_date}) khi chuộc đồ`,
              transaction_date: today,
              is_deleted: false
            } as any);
        }
      }
    }

    // 7. Xử lý phần lãi vượt quá thời hạn hợp đồng (nếu có)
    const todayDate = new Date(today);
    const contractEndDate = new Date(loanEndDate);
    
    if (todayDate > contractEndDate) {
      // Tính lãi từ ngày kết thúc hợp đồng đến hôm nay
      const daysOverdue = Math.floor((todayDate.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysOverdue > 0 && dailyAmounts.length > 0) {
        const dailyInterestRate = dailyAmounts[dailyAmounts.length - 1]; // Lấy lãi suất ngày cuối
        const overdueInterest = dailyInterestRate * daysOverdue;
        
        if (overdueInterest > 0) {
          await supabase
            .from('pawn_history')
            .insert({
              pawn_id: pawnId,
              transaction_type: 'interest_payment',
              credit_amount: overdueInterest,
              debit_amount: 0,
              notes: `Thanh toán lãi quá hạn ${daysOverdue} ngày (${formatCurrency(dailyInterestRate)}/ngày) khi chuộc đồ`,
              transaction_date: today,
              is_deleted: false
            } as any);
        }
      }
    }

    console.log('Processed pawn redemption successfully');

  } catch (error) {
    console.error('Error processing pawn redemption:', error);
    throw error;
  }
} 