import { supabase } from "../supabase";
import { calculateDailyRateForPawn } from "../interest-calculator";
import { Pawn } from "@/models/pawn";

// Hàm trả về mảng số tiền từng ngày trong chu kì của 1 hợp đồng pawn 
// Đây sẽ là số tiền expected cho từng kì lãi phải trả
export async function getExpectedMoney(pawnId: string, countUntilToday: boolean = false) {
    // Lấy ra tất cả các lần vay thêm / trả bớt gốc của hợp đồng qua history
    // filter theo transaction_type là ADDITIONAL_LOAN hoặc PRINCIPAL_REPAYMENT
    // và pawn_id trùng với pawnId
    // sắp xếp theo effective_date tăng dần
    const { data: principalPaymentHistory, error } = await supabase
        .from('pawn_history')
        .select('*')
        .eq('pawn_id', pawnId)
        .in('transaction_type', ['principal_repayment', 'additional_loan'])
        .eq('is_deleted', false)
        .order('effective_date', { ascending: true });

    if (error) throw error;
    // tạo mảng có độ dài là số ngày trong chu kì của hợp đồng pawn
    // mỗi phần tử là số tiền expected cho từng kì lãi phải trả
    // lấy ra pawn từ database
    const { data: pawn, error: pawnError } = await supabase
        .from('pawns')
        .select('*')
        .eq('id', pawnId)
        .single();

    if (pawnError) throw pawnError;
    // fill mảng với tiền gốc
    let result = Array(pawn.loan_period).fill(pawn.loan_amount);


    // với mỗi lịch sử thay đổi gốc, tạo mảng mới ghi nhận chênh lệch ở ngày đó trong mảng
    for (let i = 0; i < principalPaymentHistory.length; i++) {
        // Tạo mảng thay đổi cho bản ghi hiện tại
        const changeArray = historyToArray(
            pawn.loan_date,
            new Date(new Date(pawn.loan_date).getTime() + pawn.loan_period * 24 * 60 * 60 * 1000).toISOString(),
            principalPaymentHistory[i].effective_date!,
            principalPaymentHistory[i].transaction_type === 'additional_loan' 
                ? principalPaymentHistory[i].debit_amount! 
                : -principalPaymentHistory[i].credit_amount!,
        );

        // Cộng dồn từng phần tử tương ứng vào mảng tích lũy
        for (let j = 0; j < changeArray.length && j < result.length; j++) {
            result[j] += changeArray[j];
        }
    }

    // sau khi đã có danh sách gốc, map lại để tính số tiền lãi phí trả trong 1 ngày
    result = result.map((amount, index) => {            
        return calculateInterestForOneDay(amount, pawn as Pawn);
    });

    return result;
}
// hàm tính toán số tiền lãi phí trả trong 1 ngày

/**
 * Tính toán số tiền lãi phải trả trong 1 kỳ dựa trên số tiền gốc
 * @param principalAmount - Số tiền gốc tại thời điểm tính lãi
 * @param pawn - Thông tin hợp đồng pawn chứa các thông số lãi suất
 * @returns Số tiền lãi phải trả trong 1 ngày
 */
export function calculateInterestForOneDay(principalAmount: number, pawn: Pawn): number {
    // Tính lãi suất hàng ngày từ thông tin hợp đồng
    const dailyRate = calculateDailyRateForPawn(pawn);
    
    // Tính số tiền lãi cho 1 ngày
    const interestAmount = Math.round(principalAmount * dailyRate);
    
    return interestAmount;
}


export function historyToArray(startDate: string, endDate: string, principalPaymentChangeDate: string, amount: number) {
    // Tính số ngày từ start date đến end date
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const changeDateObj = new Date(principalPaymentChangeDate);
    
    const totalDays = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
    const changeDayIndex = Math.floor((changeDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
    
    // Tạo mảng với độ dài là số ngày
    const result = new Array(totalDays).fill(0);
    
    // Từ change date đến end date, gán giá trị amount
    for (let i = changeDayIndex; i < totalDays; i++) {
        result[i] = amount;
    }
    
    return result;
}

