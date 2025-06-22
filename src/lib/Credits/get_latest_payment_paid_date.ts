// trả về ngày thanh toán lãi mới nhất của 1 credit
// nhận vào 1 credit id
import { supabase } from '../supabase';

export async function getLatestPaymentPaidDate(creditId: string) {
    // tìm theo id trước
    const { data: credit, error: creditError } = await supabase
        .from('credits')
        .select('id')
        .eq('id', creditId)
        .single();
    if (creditError) {
        throw creditError;
    }
    if (!credit) {
        throw new Error("Credit not found");
    }
    // query payment history của credit
    const { data: paymentHistory, error: paymentHistoryError } = await supabase
        .from('credit_history')
        .select('*')
        .eq('transaction_type', 'payment')
        .eq('is_deleted', false)
        .eq('credit_id', creditId)
        .order('effective_date', { ascending: false })
        .limit(1);
    if (paymentHistoryError) {
        throw paymentHistoryError;
    }
    if (paymentHistory.length > 0) {
        return paymentHistory[0].effective_date;
    }
    console.log(paymentHistory);
    return null;
}