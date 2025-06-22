import { supabase } from '../supabase';
import { getLatestPaymentPaidDate } from './get_latest_payment_paid_date';

/**
 * Tìm ngày bắt đầu chưa đóng (ngày sau kỳ cuối cùng đã đóng)
 * @param creditId - ID của hợp đồng credit
 * @returns Promise<string | null> - Ngày bắt đầu chưa đóng (YYYY-MM-DD) hoặc null nếu chưa có kỳ nào được đóng
 */
export async function getUnpaidStartDate(creditId: string): Promise<string | null> {
  try {
    // 1. Lấy thông tin hợp đồng
    const { data: credit, error: creditError } = await supabase
      .from('credits')
      .select('loan_date, interest_period')
      .eq('id', creditId)
      .single();

    if (creditError || !credit) {
      throw new Error('Không thể lấy thông tin hợp đồng');
    }

    // 2. Lấy ra ngày cuối cùng đã đóng tiền
    const latestPaymentPaidDate = await getLatestPaymentPaidDate(creditId);
    if (!latestPaymentPaidDate) {
      return credit.loan_date;
    }
    // 3. Tính toán ngày bắt đầu chưa đóng
    const unpaidStartDate = new Date(latestPaymentPaidDate);
    unpaidStartDate.setDate(unpaidStartDate.getDate() + 1);
    return unpaidStartDate.toISOString().split('T')[0];

  } catch (error) {
    console.error('Error getting unpaid start date:', error);
    throw error;
  }
} 