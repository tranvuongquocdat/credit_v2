import { supabase } from '@/lib/supabase';

export enum PawnTransactionType {
  PAYMENT = 'payment', // đóng lãi phí
  INITIAL_LOAN = 'initial_loan', // mới tạo hợp đồng
  PRINCIPAL_REPAYMENT = 'principal_repayment', // trả bớt gốc
  CONTRACT_CLOSE = 'contract_close', // đóng hợp đồng
  ADDITIONAL_LOAN = 'additional_loan', // vay thêm
  PAYMENT_CANCEL = 'payment_cancel', // hủy đóng lãi phí
  CONTRACT_REOPEN = 'contract_reopen', // mở lại hợp đồng
  CANCEL_ADDITIONAL_LOAN = 'cancel_additional_loan', // hủy vay thêm
  CANCEL_PRINCIPAL_REPAYMENT = 'cancel_principal_repayment', // hủy trả bớt gốc
}

// Interface for pawn_amount_history table
export interface PawnAmountHistory {
  id: string;
  pawn_id: string;
  amount: number;
  note: string | null;
  created_at: string;
}

// Interface for pawn_history table (for backward compatibility)
export interface PawnHistoryRecord {
  id: string;
  pawn_id: string;
  transaction_type: PawnTransactionType;
  debit_amount?: number;
  credit_amount?: number;
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

    // 2. Insert the history record with new schema format (trigger will handle pawn_history)
    const { data, error } = await supabase
      .from('pawn_amount_history')
      .insert({
        pawn_id: pawnId,
        amount: -repaymentAmount, // Negative for principal repayment
        note: notes,
        created_at: new Date(transactionDate).toISOString(),
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

    // 2. Insert the history record with new schema format (trigger will handle pawn_history)
    const { data, error } = await supabase
      .from('pawn_amount_history')
      .insert({
        pawn_id: pawnId,
        amount: additionalAmount, // Positive for additional loan
        note: notes || "Vay thêm",
        created_at: new Date(transactionDate).toISOString(),
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
 * Get pawn history records from pawn_history table (for backward compatibility)
 */
export async function getPawnAmountHistory(pawnId: string) {
  try {
    const { data, error } = await supabase
      .from('pawn_history')
      .select('*')
      .eq('pawn_id', pawnId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }
    
    return { data: data as PawnHistoryRecord[], error: null };
  } catch (error) {
    console.error('Error fetching pawn amount history:', error);
    return { data: null, error };
  }
}

/**
 * Get pawn amount history records from pawn_amount_history table
 */
export async function getPawnAmountHistoryRecords(pawnId: string) {
  try {
    const { data, error } = await supabase
      .from('pawn_amount_history')
      .select('*')
      .eq('pawn_id', pawnId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching pawn amount history records:', error);
    return { data: null, error };
  }
}

/**
 * Delete a pawn amount history record
 */
export async function deletePawnAmountHistory(historyId: string) {
  try {
    // Delete from pawn_amount_history (trigger will handle pawn_history)
    const { data, error } = await supabase
      .from('pawn_amount_history')
      .delete()
      .eq('id', historyId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error deleting pawn amount history:', error);
    return { data: null, error };
  }
} 