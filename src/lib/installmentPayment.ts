import { InstallmentStatus } from '@/models/installment';
import { supabase } from './supabase';
import { InstallmentPaymentPeriod } from '@/models/installmentPayment';

// Helper for logging
const logError = (message: string, error: unknown) => {
  console.error(`[InstallmentPayment] ${message}:`, error);
};

// Make a payment for an installment
export async function makePayment(params: {
  installment_id: string;
  amount: number;
  store_id: string;
  staff_id: string;
  note?: string;
}) {
  try {
    const { installment_id, amount, store_id, staff_id, note } = params;
    
    // Get the installment to check if it exists
    const { data: installment, error: installmentError } = await supabase
      .from('installments')
      .select('*')
      .eq('id', installment_id)
      .single();
      
    if (installmentError) {
      throw installmentError;
    }
    
    if (!installment) {
      throw new Error('Installment not found');
    }
    
    // Insert payment record
    const { data, error } = await supabase
      .from('installment_history')
      .insert({
        installment_id,
        credit_amount: amount,
        transaction_type: 'payment',
        transaction_date: new Date().toISOString(),
        store_id,
        staff_id,
        note: note || 'Thanh toán nhanh',
      });
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    logError('Error making payment', error);
    return { success: false, error };
  }
}

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
      .update({ status: status.toString() as any, updated_at: new Date().toISOString() })
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
 * Uses same logic as getInstallmentWarnings to ensure consistency
 */
export async function countInstallmentWarnings(storeId?: string) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    
    // Query 1: Contracts with payment warnings (payment due today/tomorrow)
    const paymentQuery = supabase
      .from('installments_by_store')
      .select('id, loan_date, loan_period')
      .eq('store_id', storeId || '')
      .lte('payment_due_date', tomorrowStr)
      .eq('status', 'on_time');
    
    // Query 2: Contracts ending today
    // First, get the actual maximum loan period from database for this store
    const { data: maxPeriodResult } = await supabase
      .from('installments_by_store')
      .select('loan_period')
      .eq('store_id', storeId || '')
      .eq('status', 'on_time')
      .order('loan_period', { ascending: false })
      .limit(1);
    
    const maxLoanPeriod = maxPeriodResult?.[0]?.loan_period || 180; // Fallback to 180 days
    const earliestPossibleStart = new Date();
    earliestPossibleStart.setDate(earliestPossibleStart.getDate() - (maxLoanPeriod - 1));
    const earliestStartStr = earliestPossibleStart.toISOString().slice(0, 10);
    
    const endingQuery = supabase
      .from('installments_by_store')
      .select('id, loan_date, loan_period')
      .eq('store_id', storeId || '')
      .gte('loan_date', earliestStartStr)
      .lte('loan_date', today)
      .eq('status', 'on_time');
    
    // Execute both queries in parallel
    const [paymentResult, endingResult] = await Promise.all([
      paymentQuery,
      endingQuery
    ]);
    
    if (paymentResult.error) throw paymentResult.error;
    if (endingResult.error) throw endingResult.error;
    
    // Filter ending query to only contracts that actually end today
    const paymentInstallments = paymentResult.data || [];
    const endingInstallments = (endingResult.data || []).filter(item => {
      if (!item.loan_date || !item.loan_period) return false;
      
      const contractStart = new Date(item.loan_date);
      const contractEnd = new Date(contractStart);
      contractEnd.setDate(contractEnd.getDate() + item.loan_period - 1);
      const contractEndStr = contractEnd.toISOString().slice(0, 10);
      return contractEndStr === today;
    });
    
    // Remove duplicates and count
    const paymentIds = new Set(paymentInstallments.map(item => item.id));
    const uniqueEndingInstallments = endingInstallments.filter(item => !paymentIds.has(item.id));
    const totalCount = paymentInstallments.length + uniqueEndingInstallments.length;
    
    return {
      count: totalCount,
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