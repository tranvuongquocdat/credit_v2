import { supabase } from '@/lib/supabase';
import { PrincipalChange } from './interest-calculator';

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
    // This table contains the actual effective date of the principal changes
    const { data, error } = await supabase
      .from('pawn_amount_history')
      .select('*')
      .eq('pawn_id', pawnId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching principal changes:', error);
      return { data: [], error };
    }
    
    console.log('Fetched principal changes from pawn_amount_history:', data);
    
    if (!data || data.length === 0) {
      return { data: [], error: null };
    }
    
    // Start with the current loan amount
    let runningAmount = pawnData?.loan_amount || 0;
    
    // Reconstruct previous and new amounts by calculating backwards
    const simulatedChanges = [...data].map(record => {
      // In pawn_amount_history, the 'amount' field is:
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
      : pawnData?.loan_amount || 0;
    
    // Transform to PrincipalChange format
    const principalChanges: PrincipalChange[] = simulatedChanges.map(record => {
      // The previous amount is the current running amount
      const previousAmount = runningAmount;
      
      // The amount field in pawn_amount_history:
      // - positive for additional loans
      // - negative for principal repayments
      const amount = record.amount || 0;
      
      // Update the running amount based on the amount sign
      runningAmount += amount;
      
      // The new amount is the updated running amount
      const newAmount = runningAmount;
      
      return {
        date: record.created_at, // Using created_at from pawn_amount_history as the effective date
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