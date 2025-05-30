import { supabase } from '@/lib/supabase';
import { PrincipalChange } from './interest-calculator';
import { CreditTransactionType } from './credit-amount-history';

/**
 * Fetch all principal changes (repayments and additional loans) for a credit
 */
export async function getPrincipalChangesForCredit(creditId: string) {
  try {
    // First get the credit to determine initial loan amount
    const { data: creditData, error: creditError } = await supabase
      .from('credits')
      .select('loan_amount')
      .eq('id', creditId)
      .single();
      
    if (creditError) {
      console.error('Error fetching credit:', creditError);
      return { data: [], error: creditError };
    }
    
    // Fetch all principal changes from credit_amount_history
    // This table contains the actual effective date of the principal changes
    const { data, error } = await supabase
      .from('credit_amount_history')
      .select('*')
      .eq('credit_id', creditId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching principal changes:', error);
      return { data: [], error };
    }
    
    console.log('Fetched principal changes from credit_amount_history:', data);
    
    if (!data || data.length === 0) {
      return { data: [], error: null };
    }
    
    // Start with the current loan amount
    let runningAmount = creditData?.loan_amount || 0;
    
    // Reconstruct previous and new amounts by calculating backwards
    // We need to simulate the reverse of all transactions to get to the original amount
    const simulatedChanges = [...data].map(record => {
      // In credit_amount_history, the 'amount' field is:
      // - positive for additional loans
      // - negative for principal repayments
      const amount = record.amount || 0;
      
      // Subtract the amount to get the previous amount (regardless of sign)
      runningAmount -= amount;
      
      return {
        ...record,
        calculatedPreviousAmount: runningAmount,
        changeAmount: Math.abs(amount),
        isAdditional: amount > 0
      };
    });
    
    // Reverse the array to get chronological order and calculate forward
    simulatedChanges.reverse();
    
    // Start with the original loan amount (after undoing all changes)
    runningAmount = simulatedChanges.length > 0 
      ? simulatedChanges[0].calculatedPreviousAmount 
      : creditData?.loan_amount || 0;
    
    // Transform to PrincipalChange format
    const principalChanges: PrincipalChange[] = simulatedChanges.map(record => {
      // The previous amount is the current running amount
      const previousAmount = runningAmount;
      
      // The amount field in credit_amount_history:
      // - positive for additional loans
      // - negative for principal repayments
      const amount = record.amount || 0;
      
      // Update the running amount based on the amount sign
      runningAmount += amount;
      
      // The new amount is the updated running amount
      const newAmount = runningAmount;
      
      return {
        date: record.created_at, // Using created_at from credit_amount_history as the effective date
        previousAmount,
        newAmount,
        changeType: (amount > 0 ? 'additional_loan' : 'principal_repayment') as 'additional_loan' | 'principal_repayment'
      };
    });
    
    console.log('Calculated principal changes:', principalChanges);
    
    return { data: principalChanges, error: null };
  } catch (error) {
    console.error('Failed to fetch principal changes:', error);
    return { data: [], error };
  }
} 