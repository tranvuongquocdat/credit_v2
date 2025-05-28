import { supabase } from '@/lib/supabase';

export enum CreditTransactionType {
  PRINCIPAL_REPAYMENT = 'principal_repayment',
  ADDITIONAL_LOAN = 'additional_loan',
  INITIAL_LOAN = 'initial_loan',
  PAYMENT = 'payment',
  PAYMENT_CANCEL = 'payment_cancel',
  CONTRACT_CLOSE = 'contract_close',
  CONTRACT_REOPEN = 'contract_reopen'
}

// Updated interface to match the new database schema
export interface CreditAmountHistory {
  id: string;
  credit_id: string;
  transaction_type: string;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
  employee_id: string | null;
  created_at: string;
}

// Function to transform database record to UI model
function transformHistory(record: any): CreditAmountHistory {
  return {
    id: record.id,
    credit_id: record.credit_id,
    transaction_type: record.transaction_type,
    debit_amount: record.debit_amount || 0,
    credit_amount: record.credit_amount || 0,
    description: record.description,
    employee_id: record.employee_id,
    created_at: record.created_at
  };
}

/**
 * Record a principal repayment transaction
 */
export async function recordPrincipalRepayment(
  creditId: string,
  repaymentAmount: number,
  transactionDate: string,
  notes?: string
) {
  try {
    // First, get the current loan amount
    const { data: creditData, error: creditError } = await supabase
      .from('credits')
      .select('loan_amount')
      .eq('id', creditId)
      .single();

    if (creditError) {
      throw creditError;
    }

    if (!creditData) {
      throw new Error('Credit not found');
    }

    const previousLoanAmount = creditData.loan_amount;
    const newLoanAmount = previousLoanAmount - repaymentAmount;

    if (newLoanAmount < 0) {
      throw new Error('Repayment amount cannot exceed the loan amount');
    }

    // Begin transaction
    // 1. Update the credit with the new loan amount
    const { error: updateError } = await supabase
      .from('credits')
      .update({ loan_amount: newLoanAmount })
      .eq('id', creditId);

    if (updateError) {
      throw updateError;
    }

    // 2. Insert the history record with new schema format
    const { data, error } = await supabase
      .from('credit_amount_history')
      .insert({
        credit_id: creditId,
        transaction_type: 'principal_repayment',
        credit_amount: repaymentAmount, // Positive for credit (incoming money)
        debit_amount: 0,
        description: notes || 'Trả bớt gốc'
        // transaction_date field is no longer used, created_at is set automatically
      })
      .select()
      .single();

    if (error) {
      // If there's an error, try to rollback the credit update
      await supabase
        .from('credits')
        .update({ loan_amount: previousLoanAmount })
        .eq('id', creditId);
      
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
  creditId: string,
  additionalAmount: number,
  transactionDate: string,
  notes?: string
) {
  try {
    // First, get the current loan amount
    const { data: creditData, error: creditError } = await supabase
      .from('credits')
      .select('loan_amount')
      .eq('id', creditId)
      .single();

    if (creditError) {
      throw creditError;
    }

    if (!creditData) {
      throw new Error('Credit not found');
    }

    const previousLoanAmount = creditData.loan_amount;
    const newLoanAmount = previousLoanAmount + additionalAmount;

    // Begin transaction
    // 1. Update the credit with the new loan amount
    const { error: updateError } = await supabase
      .from('credits')
      .update({ loan_amount: newLoanAmount })
      .eq('id', creditId);

    if (updateError) {
      throw updateError;
    }

    // 2. Insert the history record with new schema format
    const { data, error } = await supabase
      .from('credit_amount_history')
      .insert({
        credit_id: creditId,
        transaction_type: 'additional_loan',
        debit_amount: additionalAmount, // Positive for debit (outgoing money)
        credit_amount: 0,
        description: notes || 'Vay thêm'
        // transaction_date field is no longer used, created_at is set automatically
      })
      .select()
      .single();

    if (error) {
      // If there's an error, try to rollback the credit update
      await supabase
        .from('credits')
        .update({ loan_amount: previousLoanAmount })
        .eq('id', creditId);
      
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error recording additional loan:', error);
    return { data: null, error };
  }
}

/**
 * Get credit amount history records for a specific credit
 */
export async function getCreditAmountHistory(creditId: string) {
  try {
    const { data, error } = await supabase
      .from('credit_amount_history')
      .select('*')
      .eq('credit_id', creditId)
      .order('created_at', { ascending: true });
    if (error) {
      throw error;
    }
    
    // Transform data from DB model to UI model
    const history = data ? data.map(item => transformHistory(item)) : [];
    console.log(history);
    return { data: history, error: null };
  } catch (error) {
    console.error('Error getting credit amount history:', error);
    return { data: null, error };
  }
}

/**
 * Record an interest payment
 */
export async function recordInterestPayment(
  creditId: string,
  amount: number,
  transactionDate: string,
  description?: string
) {
  try {
    const { data, error } = await supabase
      .from('credit_amount_history')
      .insert({
        credit_id: creditId,
        transaction_type: 'payment',
        credit_amount: amount, // Positive for credit (incoming money)
        debit_amount: 0,
        description: description || 'Đóng lãi phí'
        // transaction_date field is no longer used, created_at is set automatically
      } as any)
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
  creditId: string,
  amount: number,
  description?: string
) {
  try {
    const { data, error } = await supabase
      .from('credit_amount_history')
      .insert({
        credit_id: creditId,
        transaction_type: 'payment_cancel',
        debit_amount: amount, // Positive for debit (money going out)
        credit_amount: 0,
        description: description || 'Hủy đóng lãi phí'
      } as any)
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
  creditId: string,
  amount: number,
  transactionDate: string,
  description?: string
) {
  try {
    const { data, error } = await supabase
      .from('credit_amount_history')
      .insert({
        credit_id: creditId,
        transaction_type: 'contract_close',
        credit_amount: amount, // Positive for credit (incoming money)
        debit_amount: 0,
        description: description || 'Đóng hợp đồng'
        // transaction_date field is no longer used, created_at is set automatically
      } as any)
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
 */
export async function recordContractReopening(
  creditId: string,
  transactionDate: string,
  description?: string
) {
  try {
    const { data, error } = await supabase
      .from('credit_amount_history')
      .insert({
        credit_id: creditId,
        transaction_type: 'contract_reopen',
        credit_amount: 0,
        debit_amount: 0,
        description: description || 'Mở lại hợp đồng'
        // transaction_date field is no longer used, created_at is set automatically
      } as any)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error recording contract reopening:', error);
    return { data: null, error };
  }
} 