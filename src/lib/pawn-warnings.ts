import { supabase } from './supabase';
import { PawnStatus } from '@/models/pawn';
import { getPawnPaymentHistory } from './Pawns/payment_history';
import { getExpectedMoney } from './Pawns/get_expected_money';
import { calculateDebtToLatestPaidPeriod } from './Pawns/calculate_remaining_debt';

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
        // Calculate contract dates
        const loanDate = new Date(pawn.loan_date);
        loanDate.setHours(0, 0, 0, 0);
        const contractEndDate = new Date(loanDate);
        contractEndDate.setDate(loanDate.getDate() + pawn.loan_period - 1);
        contractEndDate.setHours(0, 0, 0, 0);

        // Check if contract is overdue (today > contract end date)
        const isContractOverdue = today > contractEndDate;

        // Get payment history for this pawn
        const paymentHistory = await getPawnPaymentHistory(pawn.id, false);
        
        // Get expected money (daily amounts)
        const dailyAmounts = await getExpectedMoney(pawn.id);
        
        // Calculate old debt using existing function
        const oldDebt = await calculateDebtToLatestPaidPeriod(pawn.id);

        let hasWarning = false;
        let interestAmount = 0;
        let daysPastDue = 0;

        // Get interest period (default to 30 days)
        const interestPeriod = pawn.interest_period || 30;

        if (!paymentHistory || paymentHistory.length === 0) {
          // No payment history - calculate from loan start to today
          const daysSinceLoan = Math.floor((today.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          if (daysSinceLoan > 0) {
            // Calculate total interest owed from start to today
            interestAmount = dailyAmounts.slice(0, daysSinceLoan).reduce((sum, amount) => sum + amount, 0);
            
            // Check if past first interest period
            if (daysSinceLoan > interestPeriod) {
              daysPastDue = daysSinceLoan - interestPeriod;
              hasWarning = true;
            } else if (isContractOverdue) {
              daysPastDue = Math.floor((today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24));
              hasWarning = true;
            }
          }
        } else {
          // Has payment history - find latest payment date
          const sortedPayments = [...paymentHistory].sort((a, b) => 
            new Date(b.effective_date || '').getTime() - new Date(a.effective_date || '').getTime()
          );
          
          const latestPayment = sortedPayments[0];
          const latestPaymentDate = new Date(latestPayment.effective_date || loanDate);
          latestPaymentDate.setHours(0, 0, 0, 0);

          // Calculate days since latest payment
          const daysSinceLastPayment = Math.floor((today.getTime() - latestPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // Check if overdue for next payment
          if (daysSinceLastPayment > interestPeriod) {
            daysPastDue = daysSinceLastPayment - interestPeriod;
            
            // Calculate interest from day after last payment to today
            const dayAfterLastPayment = new Date(latestPaymentDate);
            dayAfterLastPayment.setDate(latestPaymentDate.getDate() + 1);
            const daysToCalculate = Math.floor((today.getTime() - dayAfterLastPayment.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            
            if (daysToCalculate > 0 && dailyAmounts.length > 0) {
              // Use last day's interest rate for calculation beyond contract period
              const dailyRate = dailyAmounts[dailyAmounts.length - 1] || 0;
              interestAmount = dailyRate * daysToCalculate;
            }
            
            hasWarning = true;
          } else if (isContractOverdue) {
            daysPastDue = Math.floor((today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24));
            hasWarning = true;
          }
        }

        // Also check if there's old debt
        if (oldDebt > 0) {
          hasWarning = true;
        }

        // Only add to warnings if there's actually an overdue situation
        if (hasWarning && (daysPastDue > 0 || oldDebt > 0 || interestAmount > 0)) {
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