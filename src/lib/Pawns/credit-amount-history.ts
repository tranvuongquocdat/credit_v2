import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '../auth';

export enum PawnTransactionType {
  PRINCIPAL_REPAYMENT = 'principal_repayment',
  ADDITIONAL_LOAN = 'additional_loan',
  INITIAL_LOAN = 'initial_loan',
  PAYMENT = 'payment',
  PAYMENT_CANCEL = 'payment_cancel',
  CONTRACT_CLOSE = 'contract_close',
  CONTRACT_REOPEN = 'contract_reopen',
  CANCEL_PRINCIPAL_REPAYMENT = 'cancel_principal_repayment',
  CANCEL_ADDITIONAL_LOAN = 'cancel_additional_loan',
  CONTRACT_DELETE = 'contract_delete',
  DEBT_PAYMENT = 'debt_payment',
  CONTRACT_CLOSE_ADJUSTMENT = 'contract_close_adjustment',
}

// Updated interface to match the new database schema
export interface PawnAmountHistory {
  id: string;
  pawn_id: string;
  transaction_type: string;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
  employee_id: string | null;
  created_at: string;
  updated_at?: string | null;
  is_deleted?: boolean | null;
}

// Function to transform database record to UI model
function transformHistory(record: Record<string, any>): PawnAmountHistory {
  return {
    id: record.id,
    pawn_id: record.pawn_id,
    transaction_type: record.transaction_type,
    debit_amount: record.debit_amount || 0,
    credit_amount: record.credit_amount || 0,
    description: record.description,
    employee_id: record.employee_id,
    created_at: record.created_at,
    updated_at: record.updated_at,
    is_deleted: record.is_deleted
  };
}

// Interface for inserting new history records
interface PawnAmountHistoryInsert {
  pawn_id: string;
  transaction_type: PawnTransactionType;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
  employee_id?: string | null;
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
        principal_change_description: notes || "Vay thêm",
        effective_date: transactionDate,
        created_by: userId
      })
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error recording additional loan:', error);
    return { data: null, error };
  }
}

/**
 * Record an interest payment
 */
export async function recordInterestPayment(
  pawnId: string,
  amount: number,
  transactionDate: string,
  description?: string
) {
  try {
    const { id: userId } = await getCurrentUser();
    const { data, error } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: 'payment' as PawnTransactionType,
        credit_amount: amount, // Positive for pawn (incoming money)
        debit_amount: 0,
        description: description || 'Đóng lãi phí',
        created_by: userId
        // transaction_date field is no longer used, created_at is set automatically
      } as PawnAmountHistoryInsert)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error recording interest payment:', error);
    return { data: null, error };
  }
}

/**
 * Record cancellation of interest payment
 */
export async function recordCancelInterestPayment(
  pawnId: string,
  amount: number,
  description?: string
) {
  try {
    const { id: userId } = await getCurrentUser();
    const { data, error } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: 'payment_cancel',
        debit_amount: amount, // Positive for debit (money going out)
        credit_amount: 0,
        description: description || 'Hủy đóng lãi phí',
        created_by: userId
      } as PawnAmountHistoryInsert)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error recording interest payment cancellation:', error);
    return { data: null, error };
  }
}

/**
 * Record contract closing
 */
export async function recordContractClosure(
  pawnId: string,
  amount: number,
  transactionDate: string,
  description?: string
) {
  try {
    const { id: userId } = await getCurrentUser();
    const { data, error } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: 'contract_close',
        credit_amount: amount, // Positive for pawn (incoming money)
        debit_amount: 0,
        description: description || 'Đóng hợp đồng',
        created_by: userId
        // transaction_date field is no longer used, created_at is set automatically
      } as PawnAmountHistoryInsert)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error recording contract closure:', error);
    return { data: null, error };
  }
}

/**
 * Record contract reopening
 * Get the latest contract closure amount and add it to debit amount
 */
export async function recordContractReopening(
  pawnId: string,
  transactionDate: string,
  description?: string
) {
  try {
    // Lấy lịch sử đóng hợp đồng gần nhất
    const { data: closureHistory, error: closureError } = await supabase
      .from('pawn_history')
      .select('credit_amount')
      .eq('pawn_id', pawnId)
      .eq('transaction_type', 'contract_close')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (closureError) {
      console.warn('Error fetching closure history:', closureError);
      // Continue despite error, using 0 as default
    }
    
    // Số tiền đóng hợp đồng gần nhất (mặc định là 0 nếu không tìm thấy)
    const lastClosureAmount = (closureHistory && closureHistory.length > 0) 
      ? closureHistory[0].credit_amount 
      : 0;

    // Ghi lại lịch sử mở khóa hợp đồng với số tiền đóng hợp đồng gần nhất vào debit_amount
    const { id: userId } = await getCurrentUser();
    const { data, error } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: 'contract_reopen',
        credit_amount: 0,
        debit_amount: lastClosureAmount, // Lấy số tiền đóng hợp đồng gần nhất
        description: description || 'Mở lại hợp đồng',
        created_by: userId
        // transaction_date field is no longer used, created_at is set automatically
      } as PawnAmountHistoryInsert)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null, lastClosureAmount };
  } catch (error) {
    console.error('Error recording contract reopening:', error);
    return { data: null, error, lastClosureAmount: 0 };
  }
}

/**
 * Record contract deletion
 */
export async function recordContractDeletion(
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
        transaction_type: PawnTransactionType.CONTRACT_DELETE,
        credit_amount: loanAmount, // Positive for pawn (returning the loan amount)
        debit_amount: 0,
        description: description || 'Xóa hợp đồng',
        created_by: userId
      } as PawnAmountHistoryInsert)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error recording contract deletion:', error);
    return { data: null, error };
  }
}

/**
 * Record debt payment (thanh toán nợ)
 */
export async function recordDebtPayment(
  pawnId: string,
  amount: number,
  transactionDate: string,
  description?: string,
  isRefund: boolean = false // true nếu là hoàn trả tiền thừa
) {
  try {
    const { id: userId } = await getCurrentUser();
    const { data, error } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: pawnId,
        transaction_type: 'debt_payment' as PawnTransactionType,
        credit_amount: isRefund ? 0 : amount, // Nếu là thanh toán nợ
        debit_amount: isRefund ? amount : 0,  // Nếu là hoàn trả tiền thừa
        description: description || (isRefund ? 'Hoàn trả tiền thừa' : 'Thanh toán nợ cũ'),
        effective_date: transactionDate,
        created_by: userId
      } as PawnAmountHistoryInsert)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error recording debt payment:', error);
    return { data: null, error };
  }
}