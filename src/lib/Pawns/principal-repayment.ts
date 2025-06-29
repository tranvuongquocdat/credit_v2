import { supabase } from '@/lib/supabase';
import { PawnPrincipalRepayment } from '@/models/principal-repayment';
import { getCurrentUser } from '../auth';

// Định nghĩa kiểu dữ liệu phù hợp với schema của pawn_history
interface PawnPrincipalRepaymentData {
  id?: string;
  pawn_id: string;
  amount: number;
  repayment_date: string;
  notes?: string;
  created_at?: string;
}

/**
 * Lấy danh sách các khoản trả bớt gốc theo pawn_id
 * @param pawnId - ID của hợp đồng
 */
export async function getPawnPrincipalRepayments(pawnId: string): Promise<PawnPrincipalRepayment[]> {
  try {
    const { data, error } = await supabase
      .from('pawn_history')
      .select('*')
      .eq('pawn_id', pawnId)
      .eq('transaction_type', 'principal_repayment')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching principal repayments:', error);
      throw new Error(`Error fetching principal repayments: ${error.message}`);
    }
    
    // Transform to PawnPrincipalRepayment format
    const pawnPrincipalRepayments: PawnPrincipalRepayment[] = (data || []).map(record => ({
      id: record.id,
      pawn_id: record.pawn_id,
      amount: record.credit_amount || 0, // Trả bớt gốc là credit_amount
      note: record.description || undefined,
      created_at: record.effective_date || ''
    }));
    
    return pawnPrincipalRepayments;
  } catch (error) {
    console.error('Failed to fetch principal repayments:', error);
    throw error;
  }
}

/**
 * Xóa một khoản trả bớt gốc (đánh dấu is_deleted = true)
 * @param id - ID của khoản trả bớt gốc cần xóa
 */
export async function deletePawnAmountHistory(id: string): Promise<void> {
  try {
    const { id: userId } = await getCurrentUser();
    // Get the record details first to restore the loan amount later
    const { data: record, error: fetchError } = await supabase
      .from('pawn_history')
      .select('id')
      .eq('id', id)
      .eq('transaction_type', 'principal_repayment')
      .eq('is_deleted', false)
      .single();
      
    if (fetchError) {
      console.error('Error fetching repayment record:', fetchError);
      throw new Error(`Error fetching repayment record: ${fetchError.message}`);
    }
    
    // Đánh dấu is_deleted = true thay vì xóa hẳn
    const { error: deleteError } = await supabase
      .from('pawn_history')
      .update({ is_deleted: true, updated_by: userId, updated_at: new Date().toISOString() })
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
 * @param pawnId - ID của hợp đồng
 * @param amount - Số tiền trả bớt gốc
 * @deprecated Use recordPawnPrincipalRepayment from pawn-amount-history.ts instead
 */
export async function updatePawnPrincipal(pawnId: string, amount: number): Promise<void> {
  try {
    console.warn('updatePawnPrincipal is deprecated. Use recordPawnPrincipalRepayment instead.');
    
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
    
    // Tính toán số tiền gốc mới
    const newLoanAmount = Math.max(0, (pawn.loan_amount || 0) - amount);
    
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
    console.error('Failed to update pawn principal:', error);
    throw error;
  }
}
