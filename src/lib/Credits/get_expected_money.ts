import { supabase } from "../supabase";
import { calculateDailyRateForCredit } from "../interest-calculator";
import { Credit } from "@/models/credit";

// Hàm trả về mảng số tiền từng ngày trong chu kì của 1 hợp đồng credit 
// Đây sẽ là số tiền expected cho từng kì lãi phải trả
export async function getExpectedMoney(creditId: string, countUntilToday: boolean = false) {
    // Lấy ra tất cả các lần vay thêm / trả bớt gốc của hợp đồng qua history
    // filter theo transaction_type là ADDITIONAL_LOAN hoặc PRINCIPAL_REPAYMENT
    // và credit_id trùng với creditId
    // sắp xếp theo effective_date tăng dần
    const { data: principalPaymentHistory, error } = await supabase
        .from('credit_history')
        .select('effective_date, transaction_type, debit_amount, credit_amount')
        .eq('credit_id', creditId)
        .in('transaction_type', ['principal_repayment', 'additional_loan'])
        .eq('is_deleted', false)
        .order('effective_date', { ascending: true });

    if (error) throw error;
    // tạo mảng có độ dài là số ngày trong chu kì của hợp đồng credit
    // mỗi phần tử là số tiền expected cho từng kì lãi phải trả
    // lấy ra credit từ database
    const { data: credit, error: creditError } = await supabase
        .from('credits')
        .select('loan_date, loan_period, loan_amount, interest_ui_type, interest_notation, interest_type, interest_value')
        .eq('id', creditId)
        .single();

    if (creditError) throw creditError;
    // fill mảng với tiền gốc
    let result = Array(credit.loan_period).fill(credit.loan_amount);


    // với mỗi lịch sử thay đổi gốc, tạo mảng mới ghi nhận chênh lệch ở ngày đó trong mảng
    for (let i = 0; i < principalPaymentHistory.length; i++) {
        // Tạo mảng thay đổi cho bản ghi hiện tại
        const changeArray = historyToArray(
            credit.loan_date,
            new Date(new Date(credit.loan_date).getTime() + credit.loan_period * 24 * 60 * 60 * 1000).toISOString(),
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
        const interestForDay = calculateInterestForOneDay(amount, credit as Credit, index);
        if (index < 5) {
            console.log(`[getExpectedMoney] Day ${index + 1}: Principal ${amount} -> Interest ${interestForDay}`);
        }
        return interestForDay;
    });

    return result;
}
// hàm tính toán số tiền lãi phí trả trong 1 ngày

/**
 * Tính toán số tiền lãi phải trả trong 1 kỳ dựa trên số tiền gốc
 * @param principalAmount - Số tiền gốc tại thời điểm tính lãi
 * @param credit - Thông tin hợp đồng credit chứa các thông số lãi suất
 * @returns Số tiền lãi phải trả trong 1 ngày
 */
export function calculateInterestForOneDay(principalAmount: number, credit: Credit, dayIndex: number = 0): number {
    // Tính lãi suất hàng ngày từ thông tin hợp đồng
    const dailyRate = calculateDailyRateForCredit(credit);
    
    // Tính số tiền lãi cho 1 ngày
    // Để tránh rounding error, ta sẽ tính monthly interest trước rồi chia cho 30
    const interestUiType = credit.interest_ui_type || 'daily';
    
    let result = 0;
    
    if (interestUiType === 'monthly_30' || interestUiType === 'monthly_custom') {
        // Tính lãi tháng trước, sau đó chia đều cho 30 ngày
        const monthlyRate = dailyRate * 30;
        const monthlyInterest = Math.round(principalAmount * monthlyRate);
        
        // Để tránh rounding error, ta sẽ phân phối đều monthlyInterest cho 30 ngày
        // Sử dụng Math.floor để đảm bảo tổng không vượt quá monthlyInterest
        const baseDailyAmount = Math.floor(monthlyInterest / 30);
        const remainder = monthlyInterest % 30;
        
        // Phân phối remainder cho những ngày đầu trong chu kỳ 30 ngày
        const dayInMonth = dayIndex % 30;
        // Những ngày đầu sẽ có thêm 1 đồng để bù cho remainder
        result = baseDailyAmount + (dayInMonth < remainder ? 1 : 0);
        
        
    } else {
        // Các trường hợp khác tính bình thường
        result = Math.round(principalAmount * dailyRate);
    }
    
    return result;
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

