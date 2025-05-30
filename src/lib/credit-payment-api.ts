import { CreditPaymentPeriod } from '@/models/credit-payment';

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
 * Mark multiple payment periods as paid with server-side validation
 */
export async function markPaymentPeriods(
  creditId: string,
  periods: CreditPaymentPeriod[],
  action: 'mark' | 'unmark' = 'mark'
): Promise<PaymentMarkingResult> {
  try {
    const response = await fetch(`/api/credits/${creditId}/mark-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        periods: periods.map(period => ({
          id: period.id,
          period_number: period.period_number,
          start_date: period.start_date,
          end_date: period.end_date,
          expected_amount: period.expected_amount,
          other_amount: period.other_amount || 0
        })),
        action
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to mark payment periods');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error marking payment periods:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Mark a single payment period as paid
 */
export async function markSinglePaymentPeriod(
  creditId: string,
  period: CreditPaymentPeriod
): Promise<PaymentMarkingResult> {
  return markPaymentPeriods(creditId, [period], 'mark');
}

/**
 * Unmark a single payment period
 */
export async function unmarkSinglePaymentPeriod(
  creditId: string,
  period: CreditPaymentPeriod
): Promise<PaymentMarkingResult> {
  return markPaymentPeriods(creditId, [period], 'unmark');
} 