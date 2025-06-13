import { supabase } from '@/lib/supabase';
import { getinstallmentPaymentHistory } from './payment_history';
import { getExpectedMoney } from './get_expected_money';
import { convertFromHistoryToTimeArrayWithStatus } from './convert_from_history_to_time_array';
import { getCurrentUser } from '../auth';

/**
 * Fill all remaining unpaid periods for an installment when closing the contract
 * @param installmentId - The installment ID
 * @param employeeId - The employee ID performing the action
 * @returns Promise with success status and details
 */
export async function fillRemainingPeriods(
  installmentId: string,
): Promise<{ success: boolean; error?: string; periodsAdded?: number }> {
  try {
    console.log('🔄 Starting fillRemainingPeriods for installment:', installmentId);
    const { id: userId } = await getCurrentUser();
    // 1. Get installment details
    const { data: installment, error: installmentError } = await supabase
      .from('installments')
      .select('loan_date, loan_period, payment_period, installment_amount')
      .eq('id', installmentId)
      .single();

    if (installmentError || !installment) {
      throw new Error(`Failed to get installment: ${installmentError?.message}`);
    }

    const { loan_date: loanStartDate, loan_period, payment_period } = installment;

    // 2. Get payment history from database
    const allPaymentHistory = await getinstallmentPaymentHistory(installmentId);
    const paymentHistory = allPaymentHistory.filter(record => !record.is_deleted);
    console.log('Payment history:', paymentHistory.length, 'active records');

    // 3. Get daily interest amounts
    const dailyAmounts = await getExpectedMoney(installmentId);
    console.log('Daily amounts:', dailyAmounts.length, 'days');

    // 4. Calculate loan end date
    const startDate = new Date(loanStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + dailyAmounts.length - 1);
    const loanEndDate = endDate.toISOString().split('T')[0];

    console.log('Loan period:', loanStartDate, '→', loanEndDate);

    // 5. Use convertFromHistoryToTimeArrayWithStatus to get periods and statuses
    const { periods: timePeriods, statuses } = convertFromHistoryToTimeArrayWithStatus(
      loanStartDate,
      loanEndDate,
      payment_period,
      paymentHistory,
      paymentHistory
    );

    console.log('Generated time periods:', timePeriods.length, 'periods');

    // 6. Find unpaid periods and fill them
    const unpaidPeriods = [];
    const loanStart = new Date(loanStartDate);

    for (let index = 0; index < timePeriods.length; index++) {
      const [start_date, end_date] = timePeriods[index];
      const isChecked = statuses[index];
      
      // Only process unpaid periods
      if (!isChecked) {
        const periodStartDate = new Date(start_date);
        const periodEndDate = new Date(end_date);
        const periodNumber = index + 1;

        // Calculate expected amount for this period
        const startDayIndex = Math.floor((periodStartDate.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
        const endDayIndex = Math.floor((periodEndDate.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));

        let expectedAmount = 0;
        for (let dayIndex = startDayIndex; dayIndex <= endDayIndex && dayIndex < dailyAmounts.length; dayIndex++) {
          if (dayIndex >= 0) {
            expectedAmount += dailyAmounts[dayIndex];
          }
        }

        unpaidPeriods.push({
          periodNumber,
          startDate: periodStartDate,
          endDate: periodEndDate,
          expectedAmount: Math.round(expectedAmount)
        });
      }
    }

    console.log('Found', unpaidPeriods.length, 'unpaid periods to fill');

    if (unpaidPeriods.length === 0) {
      return { success: true, periodsAdded: 0 };
    }

    // 7. Create daily payment records for all unpaid periods
    const allDailyRecords = [];

    for (const period of unpaidPeriods) {
      const totalDays = Math.floor((period.endDate.getTime() - period.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const dailyAmount = Math.floor(period.expectedAmount / totalDays);
      const lastDayAdjustment = period.expectedAmount - (dailyAmount * totalDays);

      for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
        const currentDate = new Date(period.startDate);
        currentDate.setDate(period.startDate.getDate() + dayOffset);

        // Determine date_status
        let dateStatus: string | null = null;
        if (totalDays === 1) {
          dateStatus = 'only';
        } else if (dayOffset === 0) {
          dateStatus = 'start';
        } else if (dayOffset === totalDays - 1) {
          dateStatus = 'end';
        }

        // Calculate amount for this day
        let dayAmount = dailyAmount;
        if (dayOffset === totalDays - 1) {
          dayAmount = dailyAmount + lastDayAdjustment;
        }
        const transactionDate = new Date().setUTCHours(0, 0, 0, 0)
        const dailyRecord = {
          installment_id: installmentId,
          transaction_type: 'payment' as const,
          effective_date: currentDate.toISOString(),
          date_status: dateStatus,
          credit_amount: dayAmount,
          debit_amount: 0,
          description: `Đóng hợp đồng - Thanh toán ngày ${dayOffset + 1}/${totalDays} của kỳ ${period.periodNumber}`,
          created_by: userId,
          is_deleted: false,
          transaction_date: new Date(transactionDate).toISOString()
        };

        allDailyRecords.push(dailyRecord);
      }
    }

    // 8. Insert all daily records at once
    if (allDailyRecords.length > 0) {
      const { data, error } = await supabase
        .from('installment_history')
        .insert(allDailyRecords)
        .select();

      if (error) {
        throw new Error(`Failed to insert payment records: ${error.message}`);
      }

      console.log('✅ Inserted', allDailyRecords.length, 'daily payment records for', unpaidPeriods.length, 'periods');
    }

    return {
      success: true,
      periodsAdded: unpaidPeriods.length
    };

  } catch (error) {
    console.error('Error filling remaining periods:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
} 