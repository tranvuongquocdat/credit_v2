import { supabase } from '@/lib/supabase';

export enum CreditTransactionType {
  PRINCIPAL_REPAYMENT = 'principal_repayment',
  ADDITIONAL_LOAN = 'additional_loan',
  INITIAL_LOAN = 'initial_loan'
}

export interface CreditAmountHistory {
  id: string;
  credit_id: string;
  transaction_type: CreditTransactionType;
  amount: number;
  previous_loan_amount: number;
  new_loan_amount: number;
  transaction_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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

    // 2. Insert the history record
    const { data, error } = await supabase
      .from('credit_amount_history')
      .insert({
        credit_id: creditId,
        transaction_type: CreditTransactionType.PRINCIPAL_REPAYMENT,
        amount: -repaymentAmount, // Negative for repayment
        previous_loan_amount: previousLoanAmount,
        new_loan_amount: newLoanAmount,
        transaction_date: transactionDate,
        notes: notes || null
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

    // 2. Insert the history record
    const { data, error } = await supabase
      .from('credit_amount_history')
      .insert({
        credit_id: creditId,
        transaction_type: CreditTransactionType.ADDITIONAL_LOAN,
        amount: additionalAmount, // Positive for additional loan
        previous_loan_amount: previousLoanAmount,
        new_loan_amount: newLoanAmount,
        transaction_date: transactionDate,
        notes: notes || null
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
      .order('transaction_date', { ascending: false });

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error getting credit amount history:', error);
    return { data: null, error };
  }
} 