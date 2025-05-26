import { supabase } from '@/lib/supabase';

export enum PawnTransactionType {
  PAYMENT = 'payment',
  NEW_LOAN = 'new_loan',
  PRINCIPAL_REPAYMENT = 'principal_repayment',
  CONTRACT_CLOSE = 'contract_close',
  CONTRACT_ROTATION = 'contract_rotation',
  OTHER = 'other'
}

export interface PawnAmountHistory {
  id: string;
  pawn_id: string;
  transaction_type: PawnTransactionType;
  debit_amount?: number;
  credit_amount?: number;
  previous_loan_amount: number;
  new_loan_amount: number;
  transaction_date: string;
  notes?: string;
  employee_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Record a principal repayment transaction
 */
export async function recordPrincipalRepayment(
  pawnId: string,
  repaymentAmount: number,
  transactionDate: string,
  notes?: string
) {
  try {
    // First, get the current loan amount
    const { data: pawnData, error: pawnError } = await supabase
      .from('pawns')
      .select('loan_amount')
      .eq('id', pawnId)
      .single();

    if (pawnError) {
      throw pawnError;
    }

    if (!pawnData) {
      throw new Error('Pawn not found');
    }

    const previousLoanAmount = pawnData.loan_amount;
    const newLoanAmount = previousLoanAmount - repaymentAmount;

    if (newLoanAmount < 0) {
      throw new Error('Repayment amount cannot exceed the loan amount');
    }

    // Begin transaction
    // 1. Update the pawn with the new loan amount
    const { error: updateError } = await supabase
      .from('pawns')
      .update({ loan_amount: newLoanAmount })
      .eq('id', pawnId);

    if (updateError) {
      throw updateError;
    }

    // 2. Insert the history record
    const { data, error } = await supabase
      .from('pawn_amount_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: PawnTransactionType.PRINCIPAL_REPAYMENT,
        credit_amount: repaymentAmount, // Positive for credit (incoming money)
        debit_amount: 0,
        previous_loan_amount: previousLoanAmount,
        new_loan_amount: newLoanAmount,
        transaction_date: transactionDate,
        notes: notes || 'Trả bớt gốc'
      })
      .select()
      .single();

    if (error) {
      // If there's an error, try to rollback the pawn update
      await supabase
        .from('pawns')
        .update({ loan_amount: previousLoanAmount })
        .eq('id', pawnId);
      
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error recording principal repayment:', error);
    return { data: null, error };
  }
}

/**
 * Record an additional loan transaction
 */
export async function recordAdditionalLoan(
  pawnId: string,
  additionalAmount: number,
  transactionDate: string,
  notes?: string
) {
  try {
    // First, get the current loan amount
    const { data: pawnData, error: pawnError } = await supabase
      .from('pawns')
      .select('loan_amount')
      .eq('id', pawnId)
      .single();

    if (pawnError) {
      throw pawnError;
    }

    if (!pawnData) {
      throw new Error('Pawn not found');
    }

    const previousLoanAmount = pawnData.loan_amount;
    const newLoanAmount = previousLoanAmount + additionalAmount;

    // Begin transaction
    // 1. Update the pawn with the new loan amount
    const { error: updateError } = await supabase
      .from('pawns')
      .update({ loan_amount: newLoanAmount })
      .eq('id', pawnId);

    if (updateError) {
      throw updateError;
    }

    // 2. Insert the history record
    const { data, error } = await supabase
      .from('pawn_amount_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: PawnTransactionType.OTHER, // Use OTHER for additional loan
        debit_amount: additionalAmount, // Positive for debit (outgoing money)
        credit_amount: 0,
        previous_loan_amount: previousLoanAmount,
        new_loan_amount: newLoanAmount,
        transaction_date: transactionDate,
        notes: notes || 'Vay thêm'
      })
      .select()
      .single();

    if (error) {
      // If there's an error, try to rollback the pawn update
      await supabase
        .from('pawns')
        .update({ loan_amount: previousLoanAmount })
        .eq('id', pawnId);
      
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error recording additional loan:', error);
    return { data: null, error };
  }
}

/**
 * Get pawn amount history records for a specific pawn
 */
export async function getPawnAmountHistory(pawnId: string) {
  try {
    const { data, error } = await supabase
      .from('pawn_amount_history')
      .select('*')
      .eq('pawn_id', pawnId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }
    
    return { data: data as PawnAmountHistory[], error: null };
  } catch (error) {
    console.error('Error fetching pawn amount history:', error);
    return { data: null, error };
  }
}

/**
 * Delete a pawn amount history record
 */
export async function deletePawnAmountHistory(historyId: string) {
  try {
    // First get the history record to know what to rollback
    const { data: historyData, error: fetchError } = await supabase
      .from('pawn_amount_history')
      .select('*')
      .eq('id', historyId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!historyData) {
      throw new Error('History record not found');
    }

    // Rollback the pawn loan amount to previous amount
    const { error: updateError } = await supabase
      .from('pawns')
      .update({ loan_amount: historyData.previous_loan_amount })
      .eq('id', historyData.pawn_id);

    if (updateError) {
      throw updateError;
    }

    // Delete the history record
    const { error: deleteError } = await supabase
      .from('pawn_amount_history')
      .delete()
      .eq('id', historyId);

    if (deleteError) {
      // If delete fails, try to rollback the pawn update
      await supabase
        .from('pawns')
        .update({ loan_amount: historyData.new_loan_amount })
        .eq('id', historyData.pawn_id);
      
      throw deleteError;
    }

    return { data: historyData, error: null };
  } catch (error) {
    console.error('Error deleting pawn amount history:', error);
    return { data: null, error };
  }
} 