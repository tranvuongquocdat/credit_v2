import { supabase } from '@/lib/supabase';
import { PrincipalChange } from './interest-calculator';
import { PawnTransactionType } from './pawn-amount-history';

/**
 * Fetch all principal changes (repayments and additional loans) for a pawn
 */
export async function getPrincipalChangesForPawn(pawnId: string) {
  try {
    // First get the pawn to determine initial loan amount
    const { data: pawnData, error: pawnError } = await supabase
      .from('pawns')
      .select('loan_amount')
      .eq('id', pawnId)
      .single();
      
    if (pawnError) {
      console.error('Error fetching pawn:', pawnError);
      return { data: [], error: pawnError };
    }
    
    // Fetch all principal changes from pawn_amount_history
    const { data, error } = await supabase
      .from('pawn_amount_history')
      .select('*')
      .eq('pawn_id', pawnId)
      .in('transaction_type', [
        PawnTransactionType.PRINCIPAL_REPAYMENT,
        PawnTransactionType.NEW_LOAN
      ])
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching principal changes:', error);
      return { data: [], error };
    }
    
    // Start with the current loan amount
    let runningAmount = pawnData?.loan_amount || 0;
    
    // Reconstruct previous and new amounts by calculating backwards
    // We need to simulate the reverse of all transactions to get to the original amount
    const simulatedChanges = [...data].map(record => {
      let changeAmount = 0;
      
      if (record.transaction_type === PawnTransactionType.NEW_LOAN) {
        // For additional loans, subtract the debit amount to get the previous amount
        changeAmount = record.debit_amount || 0;
        runningAmount -= changeAmount;
      } else if (record.transaction_type === PawnTransactionType.PRINCIPAL_REPAYMENT) {
        // For repayments, add the credit amount to get the previous amount
        changeAmount = record.credit_amount || 0;
        runningAmount += changeAmount;
      }
      
      return {
        ...record,
        calculatedPreviousAmount: runningAmount,
        changeAmount
      };
    });
    
    // Reverse the array to get chronological order and calculate forward
    simulatedChanges.reverse();
    
    // Start with the original loan amount (after undoing all changes)
    runningAmount = simulatedChanges.length > 0 
      ? simulatedChanges[0].calculatedPreviousAmount 
      : pawnData?.loan_amount || 0;
    
    // Transform to PrincipalChange format
    const principalChanges: PrincipalChange[] = simulatedChanges.map(record => {
      // The previous amount is the current running amount
      const previousAmount = runningAmount;
      
      // Update the running amount based on transaction type
      if (record.transaction_type === PawnTransactionType.NEW_LOAN) {
        // For additional loans, add the debit amount
        runningAmount += (record.debit_amount || 0);
      } else if (record.transaction_type === PawnTransactionType.PRINCIPAL_REPAYMENT) {
        // For repayments, subtract the credit amount
        runningAmount -= (record.credit_amount || 0);
      }
      
      // The new amount is the updated running amount
      const newAmount = runningAmount;
      
      return {
        date: record.created_at || new Date().toISOString(),
        previousAmount,
        newAmount,
        changeType: record.transaction_type === PawnTransactionType.PRINCIPAL_REPAYMENT 
          ? 'principal_repayment' 
          : 'additional_loan'
      };
    });
    
    return { data: principalChanges, error: null };
  } catch (error) {
    console.error('Failed to fetch principal changes:', error);
    return { data: [], error };
  }
} 