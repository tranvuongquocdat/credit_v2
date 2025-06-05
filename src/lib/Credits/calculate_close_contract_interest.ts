import { getCreditPaymentHistory } from './payment_history';
import { getExpectedMoney } from './get_expected_money';
import { convertFromHistoryToTimeArrayWithStatus } from './convert_from_history_to_time_array';
import { supabase } from '../supabase';

/**
 * Tính số tiền lãi để đóng hợp đồng tại một ngày cụ thể
 * = Expected của tất cả kỳ đã đóng - Expected từ ngày bắt đầu đến ngày input
 * 
 * @param creditId - ID của hợp đồng credit
 * @param inputDate - Ngày muốn đóng hợp đồng (format: YYYY-MM-DD)
 * @returns Promise<number> - Số tiền lãi cần đóng (có thể âm nếu trả thừa)
 */
export async function calculateCloseContractInterest(creditId: string, inputDate: string): Promise<number> {
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

    // 2. Lấy lịch sử thanh toán (lọc bỏ records đã xóa)
    const allPaymentHistory = await getCreditPaymentHistory(creditId, true);
    const paymentHistory = allPaymentHistory.filter(record => !record.is_deleted);
    // 3. Lấy số tiền lãi dự kiến hàng ngày
    const dailyAmounts = await getExpectedMoney(creditId);
    // 4. Tính thời gian vay
    const loanStartDate = credit.loan_date;
    const startDate = new Date(loanStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + dailyAmounts.length - 1);
    const loanEndDate = endDate.toISOString().split('T')[0];

    // 5. Tạo periods và statuses để biết kỳ nào đã đóng
    const interestPeriod = credit.interest_period || 30;
    const { periods: timePeriods, statuses } = convertFromHistoryToTimeArrayWithStatus(
      loanStartDate,
      loanEndDate,
      interestPeriod,
      paymentHistory,
      paymentHistory
    );

    // 6. Tính tổng expected của tất cả các kỳ đã đóng
    let totalExpectedOfPaidPeriods = 0;
    const loanStart = new Date(loanStartDate);

    timePeriods.forEach((timePeriod, index) => {
      const isChecked = statuses[index]; // Kỳ đã đóng hay chưa
      
      // Chỉ tính cho các kỳ đã đóng
      if (isChecked) {
        const [start_date, end_date] = timePeriod;
        
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
        
        totalExpectedOfPaidPeriods += expectedAmount;
      }
    });

    // 7. Tính expected từ ngày bắt đầu đến ngày input
    const inputDateObj = new Date(inputDate);
    
    // Reset time để so sánh chỉ ngày
    const loanStartDateObj = new Date(loanStartDate);
    loanStartDateObj.setHours(0, 0, 0, 0);
    inputDateObj.setHours(0, 0, 0, 0);
    
    // Tính số ngày từ ngày vay đến ngày input
    const daysFromStartToInput = Math.floor((inputDateObj.getTime() - loanStartDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    let expectedFromStartToInput = 0;
    
    // Add initial value logging
    console.log("Initial expectedFromStartToInput:", expectedFromStartToInput);
    
    // Tính tổng expected từ ngày đầu đến ngày input
    for (let dayIndex = 0; dayIndex < daysFromStartToInput; dayIndex++) {
      if (dayIndex >= 0) {
        // Log before adding
        console.log(`Day ${dayIndex}: Adding ${dailyAmounts[dayIndex] || 0} to expectedFromStartToInput (current: ${expectedFromStartToInput})`);
        expectedFromStartToInput += dailyAmounts[dayIndex] || 0;
        // Log after adding
        console.log(`Day ${dayIndex}: expectedFromStartToInput is now ${expectedFromStartToInput}`);
      }
      // Nếu dayIndex vượt quá số ngày của dailyAmounts thì tinh tiếp dựa trên interest_period
      if (dayIndex >= dailyAmounts.length) {
        const remainingDays = daysFromStartToInput - dailyAmounts.length;
        const remainingDailyAmount = dailyAmounts[dailyAmounts.length - 1];
        
        // Log values before calculation
        console.log("Before remaining calculation:");
        console.log("- expectedFromStartToInput:", expectedFromStartToInput);
        console.log("- remainingDailyAmount:", remainingDailyAmount);
        console.log("- remainingDays:", remainingDays);
        
        // Check if expectedFromStartToInput is NaN before calculation
        if (isNaN(expectedFromStartToInput)) {
          console.error("expectedFromStartToInput is NaN before remaining calculation!");
        }
        
        expectedFromStartToInput += remainingDailyAmount * remainingDays;
        
        // Log after calculation
        console.log("After remaining calculation:");
        console.log("- expectedFromStartToInput:", expectedFromStartToInput);
        
        // Check if result is NaN
        if (isNaN(expectedFromStartToInput)) {
          console.error("expectedFromStartToInput became NaN after remaining calculation!");
        }
        
        break;
      }
    }

    // 8. Kết quả = Expected từ ngày bắt đầu đến ngày input - Expected của các kỳ đã đóng
    const result = expectedFromStartToInput - totalExpectedOfPaidPeriods;
    console.log("totalExpectedOfPaidPeriods", totalExpectedOfPaidPeriods);
    console.log("expectedFromStartToInput", expectedFromStartToInput);
    return Math.round(result);

  } catch (error) {
    console.error('Error calculating close contract interest:', error);
    throw error;
  }
} 