import { supabase } from '@/lib/supabase';
import { PrincipalChange } from './interest-calculator';
import { CreditTransactionType } from './credit-amount-history';

/**
 * Fetch all principal changes (repayments and additional loans) for a credit
 */
export async function getPrincipalChangesForCredit(creditId: string) {
  try {
    // Fetch all principal changes from credit_amount_history
    const { data, error } = await supabase
      .from('credit_amount_history')
      .select('*')
      .eq('credit_id', creditId)
      .in('transaction_type', [
        CreditTransactionType.PRINCIPAL_REPAYMENT,
        CreditTransactionType.ADDITIONAL_LOAN
      ])
      .order('transaction_date', { ascending: true });
    
    if (error) {
      console.error('Error fetching principal changes:', error);
      return { data: [], error };
    }
    
    // Transform to PrincipalChange format
    const principalChanges: PrincipalChange[] = data.map(record => ({
      date: record.transaction_date,
      previousAmount: record.previous_loan_amount,
      newAmount: record.new_loan_amount,
      changeType: record.transaction_type === CreditTransactionType.PRINCIPAL_REPAYMENT 
        ? 'principal_repayment' 
        : 'additional_loan'
    }));
    
    return { data: principalChanges, error: null };
  } catch (error) {
    console.error('Failed to fetch principal changes:', error);
    return { data: [], error };
  }
} 