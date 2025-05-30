import { InstallmentPaymentPeriod } from '@/models/installmentPayment';
import { supabase } from '@/lib/supabase';

export interface PaymentMarkingResult {
  success: boolean;
  error?: string;
  processed_periods?: Array<{
    period_number: number;
    status: 'created' | 'updated' | 'already_paid' | 'deleted' | 'not_found' | 
            'cannot_unmark_calculated' | 'cannot_unmark_has_later_payments' | 
            'auto_created' | 'auto_updated' | 'error';
    id?: string;
    error?: string;
  }>;
}

/**
 * Mark installment payment periods using the stored procedure
 * This handles concurrency safety and auto-fill missing periods
 */
export async function markInstallmentPaymentPeriods(
  installmentId: string,
  periods: InstallmentPaymentPeriod[],
  action: 'mark' | 'unmark'
): Promise<PaymentMarkingResult> {
  try {
    console.log('🔄 Calling installment payment marking stored procedure:', {
      installmentId,
      periodsCount: periods.length,
      action
    });

    // Format periods data to match the expected structure
    const formattedPeriods = periods.map(period => ({
      id: period.id,
      periodNumber: period.periodNumber,
      expectedAmount: period.expectedAmount,
      actualAmount: period.actualAmount,
      otherAmount: 0, // Default value
      dueDate: period.dueDate,
      endDate: period.endDate,
      paymentStartDate: period.paymentStartDate,
      installmentId: period.installmentId
    }));

    console.log('📤 Formatted periods data:', formattedPeriods);

    // Call the stored procedure
    const { data, error } = await supabase.rpc('handle_installment_payment_marking', {
      p_installment_id: installmentId,
      p_periods: formattedPeriods, // Send as JSONB directly, not stringified
      p_action: action
    });

    if (error) {
      console.error('❌ Stored procedure error:', error);
      return {
        success: false,
        error: error.message || 'Database error occurred'
      };
    }

    console.log('✅ Stored procedure result:', data);
    return data as PaymentMarkingResult;

  } catch (error) {
    console.error('❌ API call failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Convenience function to mark periods as paid
 */
export async function markInstallmentPeriodsAsPaid(
  installmentId: string,
  periods: InstallmentPaymentPeriod[]
): Promise<PaymentMarkingResult> {
  return markInstallmentPaymentPeriods(installmentId, periods, 'mark');
}

/**
 * Convenience function to unmark periods (delete them)
 */
export async function unmarkInstallmentPeriods(
  installmentId: string,
  periods: InstallmentPaymentPeriod[]
): Promise<PaymentMarkingResult> {
  return markInstallmentPaymentPeriods(installmentId, periods, 'unmark');
} 