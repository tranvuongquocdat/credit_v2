import { supabase } from '@/lib/supabase';
import { PawnAdditionalLoan } from '@/models/additional-loan';
import { getCurrentUser } from '../auth';

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
 * Xóa một khoản vay thêm
 * @param id - ID của khoản vay thêm cần xóa
 */
export async function deletePawnAmountHistory(id: string): Promise<void> {
  try {
    const { id: userId } = await getCurrentUser();
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
    .update({ is_deleted: true, updated_by: userId })
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
