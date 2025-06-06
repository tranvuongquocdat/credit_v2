// trả về ngày thanh toán lãi mới nhất của 1 pawn
// nhận vào 1 pawn id
import { supabase } from '../supabase';

export async function getLatestPaymentPaidDate(pawnId: string) {
    // tìm theo id trước
    const { data: pawn, error: pawnError } = await supabase
        .from('pawns')
        .select('id')
        .eq('id', pawnId)
        .single();
    if (pawnError) {
        throw pawnError;
    }
    if (!pawn) {
        throw new Error("Pawn not found");
    }
    // query payment history của pawn
    const { data: paymentHistory, error: paymentHistoryError } = await supabase
        .from('pawn_history')
        .select('*')
        .eq('transaction_type', 'payment')
        .eq('is_deleted', false)
        .eq('pawn_id', pawnId)
        .order('effective_date', { ascending: false })
        .limit(1);
    if (paymentHistoryError) {
        throw paymentHistoryError;
    }
    if (paymentHistory.length > 0) {
        return paymentHistory[0].effective_date;
    }
    return null;
}