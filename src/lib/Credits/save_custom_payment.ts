import { supabase } from '../supabase';
import { recordDailyPayments, recordDailyPaymentsWithCustomAmount } from './record_daily_payments';
import { getExpectedMoney } from './get_expected_money';

/**
 * Lưu thanh toán tùy biến với logic ghi lịch sử hàng ngày
 * @param creditId - ID của hợp đồng credit
 * @param paymentData - Dữ liệu thanh toán
 * @returns Promise<void>
 */
export async function saveCustomPayment(
  creditId: string,
  paymentData: {
    startDate: string;
    endDate: string;
    days: number;
    interestAmount: number;
    totalAmount: number;
  }
): Promise<void> {
  try {
    await recordDailyPayments(creditId, paymentData.startDate, paymentData.endDate);
    console.log(`✅ Successfully saved custom payment for ${creditId} from ${paymentData.startDate} to ${paymentData.endDate}`);
  } catch (error) {
    console.error('Error saving custom payment:', error);
    throw error;
  }
}

/**
 * Tính lãi cho khoảng thời gian tùy biến = số ngày * lãi 1 ngày
 * @param creditId - ID của hợp đồng credit
 * @param startDate - Ngày bắt đầu (YYYY-MM-DD)
 * @param endDate - Ngày kết thúc (YYYY-MM-DD)
 * @returns Promise<number> - Số tiền lãi
 */
export async function calculateCustomPeriodInterest(
  creditId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  try {
    // 1. Lấy thông tin hợp đồng để có loan_date
    const { data: credit, error: creditError } = await supabase
      .from('credits')
      .select('loan_date')
      .eq('id', creditId)
      .single();

    if (creditError || !credit) {
      throw new Error('Không thể lấy thông tin hợp đồng');
    }

    // 2. Lấy số tiền lãi dự kiến hàng ngày
    const dailyAmounts = await getExpectedMoney(creditId);
    const loanStartDate = new Date(credit.loan_date);

    // 3. Tính tổng lãi cho khoảng thời gian
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      throw new Error('Ngày bắt đầu không thể sau ngày kết thúc');
    }

    let totalInterest = 0;
    const current = new Date(start);

    // Duyệt qua từng ngày và cộng lãi
    while (current <= end) {
      // Tính day index từ ngày vay
      const dayIndex = Math.floor((current.getTime() - loanStartDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Lấy số tiền lãi cho ngày này
      const dailyAmount = (dayIndex >= 0 && dayIndex < dailyAmounts.length) ? dailyAmounts[dayIndex] : 0;
      totalInterest += dailyAmount;
      
      // Chuyển sang ngày tiếp theo
      current.setDate(current.getDate() + 1);
    }

    return Math.round(totalInterest);
  } catch (err) {
    console.error('Error calculating custom period interest:', err);
    return 0;
  }
}

// Add new function for custom amount
export async function saveCustomPaymentWithAmount(
  creditId: string,
  paymentData: {
    startDate: string;
    endDate: string;
    days: number;
    interestAmount: number;
    totalAmount: number;
  }
): Promise<void> {
  try {
    // Use custom amount instead of auto-calculation from getExpectedMoney
    await recordDailyPaymentsWithCustomAmount(
      creditId, 
      paymentData.startDate, 
      paymentData.endDate,
      paymentData.interestAmount
    );
    
    console.log(`✅ Successfully saved custom payment with amount ${paymentData.interestAmount} for ${creditId} from ${paymentData.startDate} to ${paymentData.endDate}`);
  } catch (error) {
    console.error('Error saving custom payment with amount:', error);
    throw error;
  }
}