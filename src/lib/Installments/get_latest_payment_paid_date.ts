// trả về ngày thanh toán lãi mới nhất của 1 installment
// nhận vào 1 installment id
import { supabase } from '../supabase';

export async function getLatestPaymentPaidDate(installmentId: string) {
    // tìm theo id trước
    const { data: installment, error: installmentError } = await supabase
        .from('installments')
        .select('id')
        .eq('id', installmentId)
        .single();
    if (installmentError) {
        throw installmentError;
    }
    if (!installment) {
        throw new Error("Installment not found");
    }
    // query payment history của installment
    const { data: paymentHistory, error: paymentHistoryError } = await supabase
        .from('installment_history')
        .select('*')
        .eq('transaction_type', 'payment')
        .eq('is_deleted', false)
        .eq('installment_id', installmentId)
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