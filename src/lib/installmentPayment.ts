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
 */
export async function countInstallmentWarnings(storeId?: string) {
  try {
    // Get the current date in ISO format
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from('installments_by_store')
      .select('id, payment_due_date')
      .eq('store_id', storeId || '')
      .lte('payment_due_date', today.toISOString())
      .eq('status', 'on_time');
    
    return {
      count: data?.length || 0,
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