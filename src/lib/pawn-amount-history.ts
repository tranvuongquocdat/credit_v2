import { supabase } from '@/lib/supabase';
import { getCurrentUser } from './auth';

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
  description?: string;
  created_by: string;
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
    const { id: userId } = await getCurrentUser();
    const { data, error } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: PawnTransactionType.PRINCIPAL_REPAYMENT,
        credit_amount: repaymentAmount, // Negative for principal repayment
        principal_change_description: notes,
        effective_date: transactionDate,
        created_by: userId
      })
      .select()
      .single();

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
    const { id: userId } = await getCurrentUser();
    const { data, error } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: PawnTransactionType.ADDITIONAL_LOAN,
        debit_amount: additionalAmount,
        principal_change_description: notes,
        effective_date: transactionDate,
        created_by: userId
      })
      .select()
      .single();

    if (error) {
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
 * Record pawn contract deletion
 */
export async function recordPawnContractDeletion(
  pawnId: string,
  loanAmount: number,
  description?: string
) {
  try {
    const { id: userId } = await getCurrentUser();
    const { data, error } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: 'contract_delete',
        credit_amount: loanAmount, // Positive for credit (returning the loan amount)
        debit_amount: 0,
        transaction_date: new Date().toISOString(),
        notes: description || 'Xóa hợp đồng cầm đồ',
        created_by: userId
      } as any)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error recording pawn contract deletion:', error);
    return { data: null, error };
  }
} 