import { supabase } from './supabase';
import { PawnStatus } from '@/models/pawn';

/**
 * Cập nhật trạng thái của hợp đồng cầm đồ
 */
export async function updatePawnStatus(pawnId: string, status: PawnStatus) {
  try {
    const { data, error } = await supabase
      .from('pawns')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', pawnId)
      .select();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error('Error updating pawn status:', error);
    return { data: null, error };
  }
}
