import { supabase } from '../supabase';
import { recordDailyPayments, recordDailyPaymentsWithCustomAmount } from './record_daily_payments';
import { getExpectedMoney } from './get_expected_money';

/**
 * Lưu thanh toán tùy biến với logic ghi lịch sử hàng ngày
 * @param pawnId - ID của hợp đồng pawn
 * @param paymentData - Dữ liệu thanh toán
 * @returns Promise<void>
 */
export async function saveCustomPayment(
  pawnId: string,
  paymentData: {
    startDate: string;
    endDate: string;
    days: number;
    interestAmount: number;
    totalAmount: number;
  }
): Promise<void> {
  try {
    await recordDailyPayments(pawnId, paymentData.startDate, paymentData.endDate);
    console.log(`✅ Successfully saved custom payment for ${pawnId} from ${paymentData.startDate} to ${paymentData.endDate}`);
  } catch (error) {
    console.error('Error saving custom payment:', error);
    throw error;
  }
}

/**
 * Tính lãi cho khoảng thời gian tùy biến = số ngày * lãi 1 ngày
 * @param pawnId - ID của hợp đồng pawn
 * @param startDate - Ngày bắt đầu (YYYY-MM-DD)
 * @param endDate - Ngày kết thúc (YYYY-MM-DD)
 * @returns Promise<number> - Số tiền lãi
 */
export async function calculateCustomPeriodInterest(
  pawnId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  try {
    // 1. Lấy thông tin hợp đồng để có loan_date và thông tin lãi suất
    const { data: pawn, error: pawnError } = await supabase
      .from('pawns')
      .select('*')
      .eq('id', pawnId)
      .single();

    if (pawnError || !pawn) {
      throw new Error('Không thể lấy thông tin hợp đồng');
    }

    // 2. Lấy số tiền lãi dự kiến hàng ngày
    const dailyAmounts = await getExpectedMoney(pawnId);
    const loanStartDate = new Date(pawn.loan_date);

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
      
      let dailyAmount = 0;
      
      if (dayIndex >= 0 && dayIndex < dailyAmounts.length) {
        // Trong khoảng loan_period, sử dụng giá trị từ dailyAmounts
        dailyAmount = dailyAmounts[dayIndex];
      } else if (dayIndex >= 0) {
        // Vượt quá loan_period, sử dụng lãi suất của ngày cuối cùng
        // hoặc tính lãi dựa trên loan_amount hiện tại
        const lastDayAmount = dailyAmounts.length > 0 ? dailyAmounts[dailyAmounts.length - 1] : 0;
        dailyAmount = lastDayAmount;
        
        // Nếu không có lịch sử, tính lãi trực tiếp từ loan_amount
        if (dailyAmount === 0) {
          const { calculateInterestForOneDay } = await import('./get_expected_money');
          dailyAmount = calculateInterestForOneDay(pawn.loan_amount, pawn as any);
        }
      }
      
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
  pawnId: string,
  paymentData: {
    startDate: string;
    endDate: string;
    days: number;
    interestAmount: number;
    totalAmount: number;
  }
): Promise<void> {
  try {
    // 1. Get current pawn data to get current loan_period
    const { data: pawn, error: pawnError } = await supabase
      .from('pawns')
      .select('loan_period')
      .eq('id', pawnId)
      .single();

    if (pawnError || !pawn) {
      throw new Error('Không thể lấy thông tin hợp đồng');
    }

    // 2. Use custom amount instead of auto-calculation from getExpectedMoney
    await recordDailyPaymentsWithCustomAmount(
      pawnId, 
      paymentData.startDate, 
      paymentData.endDate,
      paymentData.interestAmount
    );
    
    // 3. Update loan_period by adding the number of days
    const currentLoanPeriod = pawn.loan_period || 0;
    const newLoanPeriod = currentLoanPeriod + paymentData.days;
    
    console.log(`Updating loan_period: ${currentLoanPeriod} + ${paymentData.days} = ${newLoanPeriod}`);
    
    const { error: updateError } = await supabase
      .from('pawns')
      .update({ loan_period: newLoanPeriod })
      .eq('id', pawnId);
    
    if (updateError) {
      console.error('Error updating loan_period:', updateError);
      // Don't throw error, just log it since payment was already recorded
    }
    
    console.log(`✅ Successfully saved custom payment with amount ${paymentData.interestAmount} for ${pawnId} from ${paymentData.startDate} to ${paymentData.endDate} and updated loan_period to ${newLoanPeriod}`);
  } catch (error) {
    console.error('Error saving custom payment with amount:', error);
    throw error;
  }
}