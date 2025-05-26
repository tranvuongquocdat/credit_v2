import { supabase } from './supabase';
import { PawnStatus } from '@/models/pawn';
import { getPawnPaymentPeriods } from './pawn-payment';
import { calculatePawnInterestAmount } from './interest-calculator';

/**
 * Count the number of pawn contracts that have warnings (overdue or late interest)
 */
export async function countPawnWarnings(storeId: string): Promise<{ count: number; error: any }> {
  try {
    // Get all active pawns (not closed or deleted)
    const { data: pawns, error: pawnError } = await supabase
      .from('pawns')
      .select(`
        id,
        loan_date,
        loan_period,
        loan_amount,
        interest_type,
        interest_value,
        interest_period,
        interest_ui_type,
        interest_notation,
        status
      `)
      .eq('store_id', storeId)
      .not('status', 'in', `(${PawnStatus.CLOSED},${PawnStatus.DELETED})`);

    if (pawnError) {
      return { count: 0, error: pawnError };
    }

    if (!pawns || pawns.length === 0) {
      return { count: 0, error: null };
    }

    let warningCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const pawn of pawns) {
      try {
        // Calculate contract end date
        const loanDate = new Date(pawn.loan_date);
        loanDate.setHours(0, 0, 0, 0);
        const contractEndDate = new Date(loanDate);
        contractEndDate.setDate(loanDate.getDate() + pawn.loan_period - 1);
        contractEndDate.setHours(0, 0, 0, 0);

        // Check if contract is overdue (today >= contract end date)
        const isOverdueContract = today >= contractEndDate;

        // Get payment periods for this pawn
        const { data: paymentPeriods, error } = await getPawnPaymentPeriods(pawn.id);
        
        if (error) {
          console.error(`Error fetching payment periods for pawn ${pawn.id}:`, error);
          continue;
        }

        let hasWarning = false;

        if (!paymentPeriods || paymentPeriods.length === 0) {
          // No payment periods - check if overdue based on interest period
          const daysSinceLoan = Math.floor((today.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const interestPeriod = pawn.interest_period || 30;
          
          if (daysSinceLoan > interestPeriod || isOverdueContract) {
            hasWarning = true;
          }
        } else {
          // Has payment periods - check for unpaid periods or overdue amounts
          let totalExpected = 0;
          let totalPaid = 0;
          let latestPeriodEndDate = loanDate;

          // Calculate total expected vs paid from all periods
          for (const period of paymentPeriods) {
            totalExpected += period.expected_amount || 0;
            totalPaid += period.actual_amount || 0;
            
            const periodEndDate = new Date(period.end_date);
            if (periodEndDate > latestPeriodEndDate) {
              latestPeriodEndDate = periodEndDate;
            }
          }

          // Check for overdue payments
          const hasOverduePayments = paymentPeriods.some(period => {
            const periodEndDate = new Date(period.end_date);
            periodEndDate.setHours(0, 0, 0, 0);
            const isPaid = (period.actual_amount || 0) >= (period.expected_amount || 0);
            return !isPaid && today > periodEndDate;
          });

          // Check for additional interest after last period
          const dayAfterLastPeriod = new Date(latestPeriodEndDate);
          dayAfterLastPeriod.setDate(latestPeriodEndDate.getDate() + 1);
          dayAfterLastPeriod.setHours(0, 0, 0, 0);

          let hasAdditionalInterest = false;
          if (today >= dayAfterLastPeriod) {
            const daysAfterLastPeriod = Math.floor((today.getTime() - dayAfterLastPeriod.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            if (daysAfterLastPeriod > 0) {
              hasAdditionalInterest = true;
            }
          }

          // Calculate unpaid amount from periods
          const unpaidFromPeriods = Math.max(0, totalExpected - totalPaid);

          // Has warning if there are overdue payments, additional interest, unpaid amounts, or contract is overdue
          if (hasOverduePayments || hasAdditionalInterest || unpaidFromPeriods > 0 || isOverdueContract) {
            hasWarning = true;
          }
        }

        if (hasWarning) {
          warningCount++;
        }

      } catch (error) {
        console.error(`Error processing pawn ${pawn.id}:`, error);
      }
    }

    return { count: warningCount, error: null };

  } catch (error) {
    console.error('Error counting pawn warnings:', error);
    return { count: 0, error };
  }
} 