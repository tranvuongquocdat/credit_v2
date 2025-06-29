import { supabase } from '@/lib/supabase';
import { AdditionalLoan } from '@/models/additional-loan';
import { getCurrentUser } from '../auth';

/**
 * Lấy danh sách các khoản vay thêm theo credit_id
 * @param creditId - ID của hợp đồng
 */
export async function getAdditionalLoans(creditId: string): Promise<AdditionalLoan[]> {
  try {
    const { data, error } = await supabase
      .from('credit_history')
      .select('*')
      .eq('credit_id', creditId)
      .eq('transaction_type', 'additional_loan')
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error fetching additional loans:', error);
      throw new Error(`Error fetching additional loans: ${error.message}`);
    }
    
    // Transform to AdditionalLoan format
    const additionalLoans: AdditionalLoan[] = (data || []).map(record => ({
      id: record.id,
      credit_id: record.credit_id,
      amount: record.debit_amount || 0, // For additional loan, money goes out as debit
      note: record.description || undefined,
      created_at: record.effective_date || '' 
    }));
    
    return additionalLoans;
  } catch (error) {
    console.error('Failed to fetch additional loans:', error);
    throw error;
  }
}

/**
 * Thêm một khoản vay thêm mới
 * @param loan - Thông tin khoản vay thêm
 */
export async function addAdditionalLoan(loan: AdditionalLoan): Promise<AdditionalLoan> {
  try {
    const { id: userId } = await getCurrentUser();
    // Get current loan amount
    const { data: creditData, error: fetchError } = await supabase
      .from('credits')
      .select('loan_amount')
      .eq('id', loan.credit_id)
      .single();
      
    if (fetchError) {
      console.error('Error fetching credit:', fetchError);
      throw new Error(`Error fetching credit: ${fetchError.message}`);
    }
    
    if (!creditData) {
      throw new Error('Credit not found');
    }
    
    const previousLoanAmount = creditData.loan_amount;
    const newLoanAmount = previousLoanAmount + loan.amount;
    
    
    // Insert into credit_history
    const { data, error } = await supabase
    .from('credit_history')
    .insert({
      credit_id: loan.credit_id,
      debit_amount: loan.amount,
      transaction_type: 'additional_loan',
      description: loan.note || "Vay thêm",
      created_at: new Date().toISOString(),
      created_by: userId
    })
    .select()
    .single();
    
    if (error) {
      console.error('Error adding additional loan:', error);
      throw new Error(`Error adding additional loan: ${error.message}`);
    }
    // Update credit with new loan amount
    const { error: updateError } = await supabase
      .from('credits')
      .update({ loan_amount: newLoanAmount })
      .eq('id', loan.credit_id);
      
    if (updateError) {
      console.error('Error updating credit loan amount:', updateError);
      throw new Error(`Error updating credit loan amount: ${updateError.message}`);
    }
    
    // Return in AdditionalLoan format
    return {
      id: data.id,
      credit_id: data.credit_id,
      amount: data.debit_amount || 0,
      note: data.description || undefined,
      created_at: data.created_at
    };
  } catch (error) {
    console.error('Failed to add additional loan:', error);
    throw error;
  }
}

/**
 * Xóa một khoản vay thêm
 * @param id - ID của khoản vay thêm cần xóa
 */
export async function deleteCreditAmountHistory(id: string): Promise<void> {
  try {
    const { id: userId } = await getCurrentUser();
    // Get the record details first to restore the loan amount later
    const { data: record, error: fetchError } = await supabase
      .from('credit_history')
      .select('id')
      .eq('id', id)
      .single();
      
    if (fetchError) {
      console.error('Error fetching loan record:', fetchError);
      throw new Error(`Error fetching loan record: ${fetchError.message}`);
    }

    // Delete the history record by setting is_deleted = true
    const { error: deleteError } = await supabase
    .from('credit_history')
    .update({ is_deleted: true, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id);
    
    if (deleteError) {
      console.error('Error deleting additional loan:', deleteError);
      throw new Error(`Error deleting additional loan: ${deleteError.message}`);
    }

  } catch (error) {
    console.error('Failed to delete additional loan:', error);
    throw error;
  }
}

/**
 * Cập nhật số tiền gốc của hợp đồng sau khi vay thêm
 * @param creditId - ID của hợp đồng
 * @param amount - Số tiền vay thêm
 * @deprecated Use recordAdditionalLoan from credit-amount-history.ts instead
 */
export async function updateCreditWithAdditionalLoan(creditId: string, amount: number): Promise<void> {
  try {
    console.warn('updateCreditWithAdditionalLoan is deprecated. Use recordAdditionalLoan instead.');
    
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
    
    // Tính toán số tiền gốc mới (cộng thêm số vay thêm)
    const newLoanAmount = (credit.loan_amount || 0) + amount;
    
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
    console.error('Failed to update credit with additional loan:', error);
    throw error;
  }
}
