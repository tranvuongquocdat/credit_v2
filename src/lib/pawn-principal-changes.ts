import { supabase } from '@/lib/supabase';
import { PrincipalChange } from './interest-calculator';

/**
 * Fetch all principal changes (repayments and additional loans) for a pawn
 */
export async function getPrincipalChangesForPawn(pawnId: string) {
  try {
    // Fetch all principal changes from pawn_amount_history
    const { data, error } = await supabase
      .from('pawn_amount_history')
      .select('*')
      .eq('pawn_id', pawnId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching principal changes:', error);
      return { data: [], error };
    }
    
    // Transform to PrincipalChange format
    const principalChanges: PrincipalChange[] = data.map(record => {
      return {
        date: record.created_at,
        previousAmount: 0, // Not needed for simplified logic
        newAmount: 0, // Not needed for simplified logic
        changeType: record.amount < 0 ? 'principal_repayment' : 'additional_loan'
      };
    });
    
    return { data: principalChanges, error: null };
  } catch (error) {
    console.error('Failed to fetch principal changes:', error);
    return { data: [], error };
  }
} 