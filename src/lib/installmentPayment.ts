import { InstallmentStatus } from '@/models/installment';
import { supabase } from './supabase';
import { InstallmentPaymentPeriod } from '@/models/installmentPayment';

// Helper for logging
const logError = (message: string, error: unknown) => {
  console.error(`[InstallmentPayment] ${message}:`, error);
};

// Function to update debt amount when payment is checked/unchecked
export async function updateInstallmentDebtAmount(
  installmentId: string,
  expectedAmount: number,
  actualAmount: number,
  isChecked: boolean
) {
  try {
    // Get current debt amount
    const { data: installment, error: fetchError } = await supabase
      .from('installments')
      .select('debt_amount')
      .eq('id', installmentId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const currentDebt = installment.debt_amount || 0;
    
    // Calculate new debt amount
    let newDebtAmount: number;
    
    // If expectedAmount is 0, treat actualAmount as the total change amount
    if (expectedAmount === 0) {
      // Direct change mode for batch updates
      newDebtAmount = currentDebt + (isChecked ? actualAmount : -actualAmount);
    } else {
      // Individual period mode
      const difference = actualAmount - expectedAmount;
      if (isChecked) {
        // When checking: debt + (actual - expected)
        newDebtAmount = currentDebt + difference;
      } else {
        // When unchecking: debt - (actual - expected)
        newDebtAmount = currentDebt - difference;
      }
    }

    // Update debt amount in database
    const { error: updateError } = await supabase
      .from('installments')
      .update({ 
        debt_amount: newDebtAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', installmentId);

    if (updateError) {
      throw updateError;
    }

    return { success: true, newDebtAmount };
  } catch (error: any) {
    console.error('Error updating debt amount:', error);
    return { success: false, error };
  }
}

/**
 * Update the status of an installment
 */
export async function updateInstallmentStatus(installmentId: string, status: InstallmentStatus) {
  try {
    const { data, error } = await supabase
      .from('installments')
      .update({ status: status.toString() as any })
      .eq('id', installmentId)
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      data,
      error: null
    };
  } catch (error) {
    logError('Error updating installment status', error);
    return {
      data: null,
      error
    };
  }
}

// Interface for batch payment processing
interface BatchPaymentItem {
  installmentId: string;
  periodData: Partial<InstallmentPaymentPeriod>;
  actualAmount: number;
  isCalculatedPeriod: boolean;
}

// Helper function để kiểm tra kỳ đã có trong database
const isPeriodInDatabase = (period: InstallmentPaymentPeriod): boolean => {
  if (!period || !period.id) return false;
  return !period.id.startsWith("calculated-") && Boolean(period.actualAmount);
};


/**
 * Check if an installment has any paid periods
 */
export async function hasInstallmentAnyPayments(installmentId: string) {
  try {
    const { data, error, count } = await supabase
      .from('installment_history')
      .select('id', { count: 'exact' })
      .eq('installment_id', installmentId)
      .eq('transaction_type', 'payment')
      .eq('is_deleted', false)
    
    if (error) throw error;
    
    return {
      hasPaidPeriods: (count || 0) > 0,
      error: null
    };
  } catch (error) {
    logError('Error checking if installment has payments', error);
    return {
      hasPaidPeriods: false,
      error
    };
  }
}

/**
 * Count overdue installment payments for notifications
 */
export async function countOverdueInstallments(storeId?: string) {
  try {
    if (!storeId) {
      return {
        count: 0,
        error: null
      };
    }

    // Get all installments with status 'on_time' for the store
    const { data: allInstallments, error: installmentsError } = await supabase
      .from('installments_by_store')
      .select('id, loan_date, loan_period, payment_period, installment_amount')
      .eq('status', 'on_time')
      .eq('store_id', storeId);
    
    if (installmentsError) {
      throw installmentsError;
    }
    
    if (!allInstallments || allInstallments.length === 0) {
      return {
        count: 0,
        error: null
      };
    }
    
    // Import required functions
    const { getLatestPaymentPaidDate } = await import('@/lib/Installments/get_latest_payment_paid_date');
    const { getinstallmentPaymentHistory } = await import('@/lib/Installments/payment_history');
    const { getExpectedMoney } = await import('@/lib/Installments/get_expected_money');
    const { convertFromHistoryToTimeArrayWithStatus } = await import('@/lib/Installments/convert_from_history_to_time_array');
    
    let warningCount = 0;
    
    // Process each installment using the same logic as InstallmentWarningsTable
    for (const installment of allInstallments) {
             try {
         // Skip if installment id is null
         if (!installment.id) continue;
         
         // Get latest payment paid date
         const latestPaymentDate = await getLatestPaymentPaidDate(installment.id);
         
         // Get payment history and calculate total paid
         const paymentHistory = await getinstallmentPaymentHistory(installment.id);
        const totalPaid = paymentHistory.reduce((acc, curr) => acc + (curr.credit_amount || 0), 0);
        
        // Calculate remaining amount
        const remainingAmount = Math.max(0, (installment.installment_amount || 0) - totalPaid);
        
                 // Only check installments with remaining amount
         if (remainingAmount > 0 && installment.loan_date && installment.loan_period) {
           // Calculate contract dates
           const startDate = new Date(installment.loan_date);
           startDate.setHours(0, 0, 0, 0);
           const contractEndDate = new Date(startDate);
           contractEndDate.setDate(startDate.getDate() + installment.loan_period - 1);
           contractEndDate.setHours(0, 0, 0, 0);
           
           const today = new Date();
           today.setHours(0, 0, 0, 0);
           
           // Use the earlier date between contract end date and today
           const effectiveDate = today > contractEndDate ? contractEndDate : today;
           
           // Calculate check date (start from loan start or latest payment)
           let checkDate = startDate;
           checkDate.setDate(checkDate.getDate() - 1);
           if (latestPaymentDate) {
             checkDate = new Date(latestPaymentDate);
           }
           checkDate.setHours(0, 0, 0, 0);
           
           // Calculate days since last payment
           const paymentPeriod = installment.payment_period || 10;
           const daysSinceLastPayment = Math.floor((effectiveDate.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24));
           
           let hasOverduePeriods = false;
           let latePeriods = Math.floor(daysSinceLastPayment / paymentPeriod); // fallback value
           
           try {
             // Use the same approach as InstallmentWarningsTable
             // 1. Get daily expected amounts
             const dailyAmounts = await getExpectedMoney(installment.id!);
             
             // 2. Calculate loan end date
             const loanStart = new Date(installment.loan_date);
             const loanEnd = new Date(loanStart);
             loanEnd.setDate(loanStart.getDate() + dailyAmounts.length - 1);
             const loanEndDate = loanEnd.toISOString().split('T')[0];
             
             // 3. Get periods and statuses using convertFromHistoryToTimeArrayWithStatus
             const { periods: timePeriods, statuses } = convertFromHistoryToTimeArrayWithStatus(
               installment.loan_date,
               loanEndDate,
               paymentPeriod,
               paymentHistory,
               paymentHistory
             );
            
            // 4. Count unpaid periods that are overdue
            const unpaidPeriods: Array<{index: number, startDate: string, endDate: string}> = [];
            
            for (let i = 0; i < timePeriods.length; i++) {
              const [startDate, endDate] = timePeriods[i];
              const periodEndDate = new Date(endDate);
              periodEndDate.setHours(0, 0, 0, 0);
              
              // Only count periods that are due and unpaid
              if (periodEndDate <= today && !statuses[i]) {
                unpaidPeriods.push({
                  index: i,
                  startDate,
                  endDate
                });
              }
            }
            
            // Update latePeriods with accurate value
            latePeriods = unpaidPeriods.length;
            hasOverduePeriods = latePeriods > 0;
            
          } catch (error) {
            console.error('Error calculating expected amounts, using fallback:', error);
            // If error, still check using old logic
            if (daysSinceLastPayment >= paymentPeriod) {
              hasOverduePeriods = true;
            }
          }
          
          // Count this installment if it has overdue periods
          if (hasOverduePeriods && latePeriods > 0) {
            warningCount++;
          }
        }
        
      } catch (error) {
        console.error(`Error processing installment ${installment.id}:`, error);
        continue;
      }
    }
    
    return {
      count: warningCount,
      error: null
    };
  } catch (error) {
    logError('Error counting overdue installments', error);
    return {
      count: 0,
      error
    };
  }
}

/**
 * Reset debt amount to 0 when closing a contract
 */
export async function resetInstallmentDebtAmount(installmentId: string) {
  try {
    // Update debt amount to 0 in database
    const { error: updateError } = await supabase
      .from('installments')
      .update({ 
        debt_amount: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', installmentId);

    if (updateError) {
      throw updateError;
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error resetting debt amount:', error);
    return { success: false, error };
  }
} 