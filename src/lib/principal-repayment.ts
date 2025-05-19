import { supabase } from '@/lib/supabase';
import { PrincipalRepayment } from '@/models/principal-repayment';
import { CreditTransactionType } from './credit-amount-history';

// Định nghĩa kiểu dữ liệu phù hợp với schema của Supabase
// Giả định rằng chúng ta sẽ sử dụng bảng credits để lưu thông tin trả bớt gốc
// thông qua một trường JSON hoặc dùng bảng tạm thời

interface PrincipalRepaymentData {
  id?: string;
  credit_id: string;
  amount: number;
  repayment_date: string;
  notes?: string;
  created_at?: string;
}

/**
 * Lấy danh sách các khoản trả bớt gốc theo credit_id
 * @param creditId - ID của hợp đồng
 */
export async function getPrincipalRepayments(creditId: string): Promise<PrincipalRepayment[]> {
  try {
    const { data, error } = await supabase
      .from('credit_amount_history')
      .select('*')
      .eq('credit_id', creditId)
      .eq('transaction_type', CreditTransactionType.PRINCIPAL_REPAYMENT)
      .order('transaction_date', { ascending: false });
      
    if (error) {
      console.error('Error fetching principal repayments:', error);
      throw new Error(`Error fetching principal repayments: ${error.message}`);
    }
    
    // Transform to PrincipalRepayment format
    const principalRepayments: PrincipalRepayment[] = (data || []).map(record => ({
      id: record.id,
      credit_id: record.credit_id,
      amount: Math.abs(record.amount), // Change negative to positive
      repayment_date: record.transaction_date,
      notes: record.notes || undefined,
      created_at: record.created_at
    }));
    
    return principalRepayments;
  } catch (error) {
    console.error('Failed to fetch principal repayments:', error);
    throw error;
  }
}

/**
 * Thêm một khoản trả bớt gốc mới
 * @param repayment - Thông tin khoản trả bớt gốc
 */
export async function addPrincipalRepayment(repayment: PrincipalRepayment): Promise<PrincipalRepayment> {
  try {
    // Get current loan amount
    const { data: creditData, error: fetchError } = await supabase
      .from('credits')
      .select('loan_amount')
      .eq('id', repayment.credit_id)
      .single();
      
    if (fetchError) {
      console.error('Error fetching credit:', fetchError);
      throw new Error(`Error fetching credit: ${fetchError.message}`);
    }
    
    if (!creditData) {
      throw new Error('Credit not found');
    }
    
    const previousLoanAmount = creditData.loan_amount;
    const newLoanAmount = Math.max(0, previousLoanAmount - repayment.amount);
    
    // Insert into credit_amount_history
    const { data, error } = await supabase
      .from('credit_amount_history')
      .insert({
        credit_id: repayment.credit_id,
        transaction_type: CreditTransactionType.PRINCIPAL_REPAYMENT,
        amount: -repayment.amount, // Negative for repayment
        previous_loan_amount: previousLoanAmount,
        new_loan_amount: newLoanAmount,
        transaction_date: repayment.repayment_date,
        notes: repayment.notes || null
      })
      .select()
      .single();
      
    if (error) {
      console.error('Error adding principal repayment:', error);
      throw new Error(`Error adding principal repayment: ${error.message}`);
    }
    
    // Return in PrincipalRepayment format
    return {
      id: data.id,
      credit_id: data.credit_id,
      amount: Math.abs(data.amount),
      repayment_date: data.transaction_date,
      notes: data.notes || undefined,
      created_at: data.created_at
    };
  } catch (error) {
    console.error('Failed to add principal repayment:', error);
    throw error;
  }
}

/**
 * Xóa một khoản trả bớt gốc
 * @param id - ID của khoản trả bớt gốc cần xóa
 */
export async function deletePrincipalRepayment(id: string): Promise<void> {
  try {
    // Get the record details first to restore the loan amount later
    const { data: record, error: fetchError } = await supabase
      .from('credit_amount_history')
      .select('*')
      .eq('id', id)
      .single();
      
    if (fetchError) {
      console.error('Error fetching repayment record:', fetchError);
      throw new Error(`Error fetching repayment record: ${fetchError.message}`);
    }
    
    if (!record || record.transaction_type !== CreditTransactionType.PRINCIPAL_REPAYMENT) {
      throw new Error('Principal repayment record not found');
    }
    
    // Restore the previous loan amount
    const { error: updateError } = await supabase
      .from('credits')
      .update({ loan_amount: record.previous_loan_amount })
      .eq('id', record.credit_id);
      
    if (updateError) {
      console.error('Error restoring loan amount:', updateError);
      throw new Error(`Error restoring loan amount: ${updateError.message}`);
    }
    
    // Delete the history record
    const { error: deleteError } = await supabase
      .from('credit_amount_history')
      .delete()
      .eq('id', id);
      
    if (deleteError) {
      console.error('Error deleting principal repayment:', deleteError);
      throw new Error(`Error deleting principal repayment: ${deleteError.message}`);
    }
  } catch (error) {
    console.error('Failed to delete principal repayment:', error);
    throw error;
  }
}

/**
 * Cập nhật thông tin gốc của hợp đồng sau khi trả bớt
 * @param creditId - ID của hợp đồng
 * @param amount - Số tiền trả bớt gốc
 * @deprecated Use recordPrincipalRepayment from credit-amount-history.ts instead
 */
export async function updateCreditPrincipal(creditId: string, amount: number): Promise<void> {
  try {
    console.warn('updateCreditPrincipal is deprecated. Use recordPrincipalRepayment instead.');
    
    // Lấy thông tin hiện tại của hợp đồng
    const { data: credit, error: fetchError } = await supabase
      .from('credits')
      .select('loan_amount')
      .eq('id', creditId)
      .single();
      
    if (fetchError) {
      console.error('Error fetching credit:', fetchError);
      throw new Error(`Error fetching credit: ${fetchError.message}`);
    }
    
    if (!credit) {
      throw new Error('Credit not found');
    }
    
    // Tính toán số tiền gốc mới
    const newLoanAmount = Math.max(0, (credit.loan_amount || 0) - amount);
    
    // Cập nhật hợp đồng
    const { error: updateError } = await supabase
      .from('credits')
      .update({ loan_amount: newLoanAmount })
      .eq('id', creditId);
      
    if (updateError) {
      console.error('Error updating credit:', updateError);
      throw new Error(`Error updating credit: ${updateError.message}`);
    }
  } catch (error) {
    console.error('Failed to update credit principal:', error);
    throw error;
  }
}
