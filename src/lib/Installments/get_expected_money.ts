import { supabase } from "../supabase";
// Hàm trả về mảng số tiền từng ngày trong chu kì của 1 hợp đồng installment 
// Đây sẽ là số tiền expected cho từng kì lãi phải trả
export async function getExpectedMoney(installmentId: string) {
   
    const { data: installment, error: installmentError } = await supabase
        .from('installments')
        .select('installment_amount, loan_period')
        .eq('id', installmentId)
        .single();

    if (installmentError) throw installmentError;
    // fill mảng với tiền gốc
    let result = Array(installment.loan_period).fill(installment.installment_amount / installment.loan_period);
    console.log(result);
    return result;
}