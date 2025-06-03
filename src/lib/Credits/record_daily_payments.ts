import { supabase } from '../supabase';
import { getExpectedMoney } from './get_expected_money';

/**
 * Ghi từng bản ghi payment hàng ngày từ startDate đến endDate
 * @param creditId - ID của hợp đồng credit
 * @param startDate - Ngày bắt đầu (YYYY-MM-DD)
 * @param endDate - Ngày kết thúc (YYYY-MM-DD)
 * @returns Promise<void>
 */
export async function recordDailyPayments(
  creditId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  try {
    // 1. Lấy thông tin hợp đồng
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

    // 3. Tạo danh sách các ngày cần ghi
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      throw new Error('Ngày bắt đầu không thể sau ngày kết thúc');
    }

    const paymentRecords: Array<{
      credit_id: string;
      transaction_type: string;
      effective_date: string;
      date_status: string | null;
      credit_amount: number;
      debit_amount: number;
      description: string;
      is_created_from_contract_closure: boolean;
    }> = [];

    const current = new Date(start);
    const dates: string[] = [];

    // Tạo danh sách các ngày
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    console.log('Recording payments for dates:', dates);

    // 4. Tạo records cho từng ngày
    dates.forEach((dateStr, index) => {
      const currentDate = new Date(dateStr);
      
      // Tính day index từ ngày vay
      const dayIndex = Math.floor((currentDate.getTime() - loanStartDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Lấy số tiền lãi cho ngày này
      const dailyAmount = (dayIndex >= 0 && dayIndex < dailyAmounts.length) ? dailyAmounts[dayIndex] : 0;
      
      // Xác định date_status
      let dateStatus: string | null = null;
      if (dates.length === 1) {
        // Chỉ có 1 ngày
        dateStatus = 'only';
      } else {
        // Nhiều ngày
        if (index === 0) {
          dateStatus = 'start';
        } else if (index === dates.length - 1) {
          dateStatus = 'end';
        } else {
          dateStatus = null; // Các ngày giữa
        }
      }

      paymentRecords.push({
        credit_id: creditId,
        transaction_type: 'payment' as const,
        effective_date: dateStr,
        date_status: dateStatus,
        credit_amount: Math.round(dailyAmount),
        debit_amount: 0,
        description: `Đóng lãi phí ngày ${dateStr} khi đóng hợp đồng`,
        is_created_from_contract_closure: true
      });
    });

    console.log('Payment records to insert:', paymentRecords);

    // 5. Insert tất cả records cùng lúc
    const { error: insertError } = await supabase
      .from('credit_history')
      .insert(paymentRecords as any[]);

    if (insertError) {
      throw new Error(`Lỗi khi ghi lịch sử thanh toán: ${insertError.message}`);
    }

    console.log(`✅ Successfully recorded ${paymentRecords.length} payment records from ${startDate} to ${endDate}`);

  } catch (error) {
    console.error('Error recording daily payments:', error);
    throw error;
  }
} 