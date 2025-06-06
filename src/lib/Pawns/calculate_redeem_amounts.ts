import { getPawnPaymentPeriods } from '@/lib/pawn-payment';
import { calculatePawnInterestAmount } from '@/lib/interest-calculator';
import { getPawnById } from '@/lib/pawn';

interface RedeemAmounts {
  loanAmount: number;
  oldDebt: number;
  remainingAmount: number;
}

/**
 * Tính toán các số tiền cần thiết để chuộc đồ
 * @param pawnId - ID của hợp đồng pawn
 * @returns Promise<RedeemAmounts> - Các số tiền tính toán được
 */
export async function calculatePawnRedeemAmounts(pawnId: string): Promise<RedeemAmounts> {
  try {
    // Lấy thông tin pawn
    const { data: pawn, error: pawnError } = await getPawnById(pawnId);
    if (pawnError || !pawn) {
      throw new Error('Không thể lấy thông tin hợp đồng');
    }

    // Lấy payment periods
    const { data: paymentPeriods, error: periodsError } = await getPawnPaymentPeriods(pawnId);
    if (periodsError) {
      throw new Error('Không thể lấy thông tin kỳ thanh toán');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const loanStartDate = new Date(pawn.loan_date);
    loanStartDate.setHours(0, 0, 0, 0);

    const loanPeriodDays = pawn.loan_period || 0;
    const loanEndDate = new Date(loanStartDate);
    loanEndDate.setDate(loanStartDate.getDate() + loanPeriodDays - 1);

    // Determine contract type
    let contractType: 'past' | 'present' | 'future' = 'present';
    
    if (today.getTime() > loanEndDate.getTime()) {
      contractType = 'past';
    } else if (today.getTime() < loanStartDate.getTime()) {
      contractType = 'future';
    } else {
      contractType = 'present';
    }

    // Calculate old debt (difference between expected and actual amounts for paid periods)
    let oldDebt = 0;
    if (paymentPeriods && paymentPeriods.length > 0) {
      const paidPeriods = paymentPeriods.filter(p => p.actual_amount > 0);
      
      paidPeriods.forEach(period => {
        const actual = period.actual_amount || 0;
        const expected = period.expected_amount || 0;
        const difference = expected - actual;
        oldDebt += difference;
      });
    }

    // Calculate total paid amount
    const totalPaid = paymentPeriods ? 
      paymentPeriods.reduce((sum, period) => sum + (period.actual_amount || 0), 0) : 0;

    // Calculate amount needed based on contract type
    let amountNeeded = 0;

    if (contractType === 'future') {
      // Future contract - no interest needed
      amountNeeded = 0;
    } else if (contractType === 'past') {
      // Past contract - calculate interest from last period to today
      if (paymentPeriods && paymentPeriods.length > 0) {
        amountNeeded = totalPaid;

        // Add interest from the day after the last period until today
        const sortedPeriods = [...paymentPeriods].sort((a, b) => 
          new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
        );

        const lastPeriod = sortedPeriods[0];
        const lastPeriodEndDate = new Date(lastPeriod.end_date);
        lastPeriodEndDate.setHours(0, 0, 0, 0);

        const dayAfterLastPeriod = new Date(lastPeriodEndDate);
        dayAfterLastPeriod.setDate(lastPeriodEndDate.getDate() + 1);

        const daysAfterLastPeriod = Math.floor(
          (today.getTime() - dayAfterLastPeriod.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;

        if (daysAfterLastPeriod > 0) {
          const additionalInterest = calculatePawnInterestAmount(pawn, daysAfterLastPeriod);
          amountNeeded += additionalInterest;
        }
      } else {
        // No periods, calculate from loan start to today
        const daysSinceStart = Math.floor(
          (today.getTime() - loanStartDate.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;

        if (daysSinceStart > 0) {
          amountNeeded = calculatePawnInterestAmount(pawn, daysSinceStart);
        }
      }
    } else if (contractType === 'present') {
      // Present contract - calculate interest up to today
      if (paymentPeriods && paymentPeriods.length > 0) {
        let foundTodayPeriod = false;
        let accumulatedTotal = 0;

        const sortedPeriods = [...paymentPeriods].sort((a, b) => 
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        );

        for (const period of sortedPeriods) {
          const periodStartDate = new Date(period.start_date);
          const periodEndDate = new Date(period.end_date);
          periodStartDate.setHours(0, 0, 0, 0);
          periodEndDate.setHours(0, 0, 0, 0);

          if (today.getTime() >= periodStartDate.getTime() && today.getTime() <= periodEndDate.getTime()) {
            // This period contains today
            foundTodayPeriod = true;

            const daysFromStart = Math.floor(
              (today.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)
            ) + 1;

            const totalDaysInPeriod = Math.floor(
              (periodEndDate.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)
            ) + 1;

            const dailyAmount = period.expected_amount / totalDaysInPeriod;
            const amountUpToToday = Math.round(dailyAmount * daysFromStart);

            accumulatedTotal += amountUpToToday;
            break;
          } else if (periodEndDate.getTime() < today.getTime()) {
            // Period is before today, add full actual amount
            accumulatedTotal += period.actual_amount || 0;
          }
        }

        if (!foundTodayPeriod) {
          // No period contains today, calculate from start to today
          const daysFromStart = Math.floor(
            (today.getTime() - loanStartDate.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1;

          const interestToday = calculatePawnInterestAmount(pawn, daysFromStart);
          accumulatedTotal += interestToday;
        }

        amountNeeded = accumulatedTotal;
      } else {
        // No periods, calculate from start to today
        const daysFromStart = Math.floor(
          (today.getTime() - loanStartDate.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;

        amountNeeded = calculatePawnInterestAmount(pawn, daysFromStart);
      }
    }

    // Calculate remaining amount (interest needed)
    const remainingAmount = amountNeeded - totalPaid;

    return {
      loanAmount: pawn.loan_amount,
      oldDebt,
      remainingAmount
    };

  } catch (error) {
    console.error('Error calculating redeem amounts:', error);
    throw error;
  }
} 