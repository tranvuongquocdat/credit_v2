import { supabase } from '@/lib/supabase';
import { PawnAdditionalLoan } from '@/models/additional-loan';

/**
 * Lấy danh sách các khoản vay thêm theo pawn_id
 * @param pawnId - ID của hợp đồng
 */
export async function getPawnAdditionalLoans(pawnId: string): Promise<PawnAdditionalLoan[]> {
  try {
    const { data, error } = await supabase
      .from('pawn_history')
      .select('*')
      .eq('pawn_id', pawnId)
      .eq('transaction_type', 'additional_loan')
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error fetching additional loans:', error);
      throw new Error(`Error fetching additional loans: ${error.message}`);
    }
    
    // Transform to PawnAdditionalLoan format
    const pawnAdditionalLoans: PawnAdditionalLoan[] = (data || []).map(record => ({
      id: record.id,
      pawn_id: record.pawn_id,
      amount: record.debit_amount || 0, // For additional loan, money goes out as debit
      note: record.description || undefined,
      created_at: record.effective_date || '' 
    }));
    
    return pawnAdditionalLoans;
  } catch (error) {
    console.error('Failed to fetch additional loans:', error);
    throw error;
  }
}

/**
 * Thêm một khoản vay thêm mới
 * @param loan - Thông tin khoản vay thêm
 */
export async function addPawnAdditionalLoan(loan: PawnAdditionalLoan): Promise<PawnAdditionalLoan> {
  try {
    // Get current loan amount
    const { data: pawnData, error: fetchError } = await supabase
      .from('pawns')
      .select('loan_amount')
      .eq('id', loan.pawn_id)
      .single();
      
    if (fetchError) {
      console.error('Error fetching pawn:', fetchError);
      throw new Error(`Error fetching pawn: ${fetchError.message}`);
    }
    
    if (!pawnData) {
      throw new Error('Pawn not found');
    }
    
    const previousLoanAmount = pawnData.loan_amount;
    const newLoanAmount = previousLoanAmount + loan.amount;
    
    
    // Insert into pawn_history
    const { data, error } = await supabase
    .from('pawn_history')
    .insert({
      pawn_id: loan.pawn_id,
      debit_amount: loan.amount,
      transaction_type: 'additional_loan',
      description: loan.note || "Vay thêm",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
    
    if (error) {
      console.error('Error adding additional loan:', error);
      throw new Error(`Error adding additional loan: ${error.message}`);
    }
    // Update pawn with new loan amount
    const { error: updateError } = await supabase
      .from('pawns')
      .update({ loan_amount: newLoanAmount })
      .eq('id', loan.pawn_id);
      
    if (updateError) {
      console.error('Error updating pawn loan amount:', updateError);
      throw new Error(`Error updating pawn loan amount: ${updateError.message}`);
    }
    
    // Return in PawnAdditionalLoan format
    return {
      id: data.id,
      pawn_id: data.pawn_id,
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
export async function deletePawnAmountHistory(id: string): Promise<void> {
  try {
    // Get the record details first to restore the loan amount later
    const { data: record, error: fetchError } = await supabase
      .from('pawn_history')
      .select('id')
      .eq('id', id)
      .single();
      
    if (fetchError) {
      console.error('Error fetching loan record:', fetchError);
      throw new Error(`Error fetching loan record: ${fetchError.message}`);
    }

    // Delete the history record by setting is_deleted = true
    const { error: deleteError } = await supabase
    .from('pawn_history')
    .update({ is_deleted: true })
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
 * @param pawnId - ID của hợp đồng
 * @param amount - Số tiền vay thêm
 * @deprecated Use recordPawnAdditionalLoan from pawn-amount-history.ts instead
 */
export async function updatePawnWithPawnAdditionalLoan(pawnId: string, amount: number): Promise<void> {
  try {
    console.warn('updatePawnWithPawnAdditionalLoan is deprecated. Use recordPawnAdditionalLoan instead.');
    
    // Lấy thông tin hiện tại của hợp đồng
    const { data: pawn, error: fetchError } = await supabase
      .from('pawns')
      .select('loan_amount')
      .eq('id', pawnId)
      .single();
      
    if (fetchError) {
      console.error('Error fetching pawn:', fetchError);
      throw new Error(`Error fetching pawn: ${fetchError.message}`);
    }
    
    if (!pawn) {
      throw new Error('Pawn not found');
    }
    
    // Tính toán số tiền gốc mới (cộng thêm số vay thêm)
    const newLoanAmount = (pawn.loan_amount || 0) + amount;
    
    // Cập nhật hợp đồng
    const { error: updateError } = await supabase
      .from('pawns')
      .update({ loan_amount: newLoanAmount })
      .eq('id', pawnId);
      
    if (updateError) {
      console.error('Error updating pawn:', updateError);
      throw new Error(`Error updating pawn: ${updateError.message}`);
    }
  } catch (error) {
    console.error('Failed to update pawn with additional loan:', error);
    throw error;
  }
}
