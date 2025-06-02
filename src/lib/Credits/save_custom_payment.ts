import { supabase } from '../supabase';
import { recordDailyPayments } from './record_daily_payments';
import { getExpectedMoney } from './create_principal_payment_history';

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
    otherAmount: number;
    totalAmount: number;
  }
): Promise<void> {
  try {
    // 1. Ghi lịch sử payment hàng ngày với date_status
    await recordDailyPayments(creditId, paymentData.startDate, paymentData.endDate);

    // 2. Nếu có tiền khác, ghi thêm 1 bản ghi riêng
    if (paymentData.otherAmount > 0) {
      const { error: otherError } = await supabase
        .from('credit_history')
        .insert({
          credit_id: creditId,
          transaction_type: 'payment',
          effective_date: paymentData.endDate, // Ghi vào ngày cuối
          date_status: null,
          credit_amount: paymentData.otherAmount,
          debit_amount: 0,
          description: `Tiền khác khi đóng lãi phí tùy biến (${paymentData.startDate} → ${paymentData.endDate})`,
          is_created_from_contract_closure: false
        });

      if (otherError) {
        throw new Error(`Lỗi khi ghi tiền khác: ${otherError.message}`);
      }
    }

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

/**
 * Tìm ngày kết thúc của kỳ thanh toán cuối cùng đã thanh toán
 * @param creditId - ID của hợp đồng credit
 * @returns Promise<string | undefined> - Ngày kết thúc kỳ cuối hoặc undefined
 */
export async function getLastPaidPeriodEndDate(creditId: string): Promise<string | undefined> {
  try {
    // Tìm các bản ghi payment đã thanh toán từ credit_history
    const { data: paymentHistory, error } = await supabase
      .from('credit_history')
      .select('effective_date, date_status')
      .eq('credit_id', creditId)
      .eq('transaction_type', 'payment')
      .eq('is_deleted', false)
      .order('effective_date', { ascending: false });

    if (error) {
      console.error('Error fetching payment history:', error);
      return undefined;
    }

    if (!paymentHistory || paymentHistory.length === 0) {
      return undefined;
    }

    // Tìm ngày có date_status = 'end' hoặc 'only' gần nhất
    const lastEndDate = paymentHistory.find(p => 
      p.date_status === 'end' || p.date_status === 'only'
    );

    return lastEndDate?.effective_date?.split('T')[0];
  } catch (err) {
    console.error('Error getting last paid period end date:', err);
    return undefined;
  }
} 