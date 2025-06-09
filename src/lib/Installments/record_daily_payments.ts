import { supabase } from '../supabase';
import { getExpectedMoney } from './get_expected_money';
import { getCurrentUser } from '../auth';

/**
 * Ghi từng bản ghi payment hàng ngày từ startDate đến endDate
 * @param installmentId - ID của hợp đồng installment
 * @param startDate - Ngày bắt đầu (YYYY-MM-DD)
 * @param endDate - Ngày kết thúc (YYYY-MM-DD)
 * @returns Promise<void>
 */
export async function recordDailyPayments(
  installmentId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  try {
    const { id: userId } = await getCurrentUser();
    if (!userId) {
      throw new Error('Không thể xác định người dùng');
    }
    // 1. Lấy thông tin hợp đồng
    const { data: installment, error: installmentError } = await supabase
      .from('installments')
      .select('loan_date')
      .eq('id', installmentId)
      .single();

    if (installmentError || !installment) {
      throw new Error('Không thể lấy thông tin hợp đồng');
    }

    // 2. Lấy số tiền lãi dự kiến hàng ngày
    const dailyAmounts = await getExpectedMoney(installmentId);
    const loanStartDate = new Date(installment.loan_date);

    // 3. Tạo danh sách các ngày cần ghi
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      throw new Error('Ngày bắt đầu không thể sau ngày kết thúc');
    }

    // Update interface to match PaymentTab pattern
    const paymentRecords: Array<{
      installment_id: string;
      transaction_type: string;
      effective_date: string;
      date_status: string | null;
      installment_amount: number;
      debit_amount: number;
      description: string;
      is_deleted: boolean; // Add this field like PaymentTab
      is_created_from_contract_closure: boolean;
      created_by: string;
    }> = [];

    const current = new Date(start);
    const dates: string[] = [];

    // Tạo danh sách các ngày
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    console.log('Recording payments for dates:', dates);

    // 4. Tạo records cho từng ngày - Follow PaymentTab pattern
    dates.forEach((dateStr, index) => {
      const currentDate = new Date(dateStr);
      
      // Tính day index từ ngày vay
      const dayIndex = Math.floor((currentDate.getTime() - loanStartDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Lấy số tiền lãi cho ngày này - follow PaymentTab pattern
      let dailyAmount = 0;
      if (dayIndex >= 0 && dayIndex < dailyAmounts.length) {
        dailyAmount = dailyAmounts[dayIndex];
      } else if (dailyAmounts.length > 0) {
        // If beyond available daily amounts, use the last available amount
        dailyAmount = dailyAmounts[dailyAmounts.length - 1];
      }
      
      // Xác định date_status - follow PaymentTab pattern exactly
      let dateStatus: string | null = null; // Default for middle days
      if (dates.length === 1) {
        dateStatus = 'only';
      } else if (index === 0) {
        dateStatus = 'start';
      } else if (index === dates.length - 1) {
        dateStatus = 'end';
      }

      // Follow PaymentTab pattern for record structure
      paymentRecords.push({
        installment_id: installmentId,
        transaction_type: 'payment' as const,
        effective_date: currentDate.toISOString(), // Use full ISO string like PaymentTab
        date_status: dateStatus,
        installment_amount: dailyAmount, // Don't round here, keep original amount like PaymentTab
        debit_amount: 0,
        description: `Đóng lãi phí ngày ${index + 1}/${dates.length} khi đóng hợp đồng`,
        is_deleted: false, // Add is_deleted field like PaymentTab
        is_created_from_contract_closure: true, // Keep this for tracking closure records
        created_by: userId
      });
    });

    console.log('Payment records to insert:', paymentRecords);

    // 5. Insert tất cả records cùng lúc
    const { error: insertError } = await supabase
      .from('installment_history')
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

// Add new function for custom amount distribution
export async function recordDailyPaymentsWithCustomAmount(
  installmentId: string,
  startDate: string,
  endDate: string,
  customAmount: number
): Promise<void> {
  try {
    const { id: userId } = await getCurrentUser();
    if (!userId) {
      throw new Error('Không thể xác định người dùng');
    }
    // 1. Lấy thông tin hợp đồng
    const { data: installment, error: installmentError } = await supabase
      .from('installments')
      .select('loan_date')
      .eq('id', installmentId)
      .single();

    if (installmentError || !installment) {
      throw new Error('Không thể lấy thông tin hợp đồng');
    }

    // 2. Tạo danh sách các ngày cần ghi
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      throw new Error('Ngày bắt đầu không thể sau ngày kết thúc');
    }

    const current = new Date(start);
    const dates: string[] = [];

    // Tạo danh sách các ngày
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    console.log('Recording custom amount payments for dates:', dates);

    // 3. Phân phối custom amount đều cho các ngày (với adjustment cho ngày cuối)
    const totalDays = dates.length;
    const dailyAmount = Math.floor(customAmount / totalDays);
    const lastDayAdjustment = customAmount - (dailyAmount * totalDays);

    console.log(`Custom amount distribution: ${totalDays} days, ${dailyAmount} per day, last day adjustment: ${lastDayAdjustment}`);

    const paymentRecords: Array<{
      installment_id: string;
      transaction_type: string;
      effective_date: string;
      date_status: string | null;
      installment_amount: number;
      debit_amount: number;
      description: string;
      is_deleted: boolean;
      is_created_from_contract_closure: boolean;
      created_by: string;
    }> = [];

    // 4. Tạo records cho từng ngày với custom amount
    dates.forEach((dateStr, index) => {
      const currentDate = new Date(dateStr);
      
      // Xác định date_status
      let dateStatus: string | null = null;
      if (totalDays === 1) {
        dateStatus = 'only';
      } else if (index === 0) {
        dateStatus = 'start';
      } else if (index === totalDays - 1) {
        dateStatus = 'end';
      }

      // Calculate amount for this day
      let dayAmount = dailyAmount;
      if (index === totalDays - 1) {
        // Last day gets the adjustment
        dayAmount = dailyAmount + lastDayAdjustment;
      }

      paymentRecords.push({
        installment_id: installmentId,
        transaction_type: 'payment' as const,
        effective_date: currentDate.toISOString(),
        date_status: dateStatus,
        installment_amount: dayAmount,
        debit_amount: 0,
        description: `Đóng lãi phí tùy biến ngày ${index + 1}/${totalDays} (${dayAmount} VNĐ)`,
        is_deleted: false,
        is_created_from_contract_closure: false, // Custom payment, not from closure
        created_by: userId
      });
    });

    console.log('Custom payment records to insert:', paymentRecords);

    // 5. Insert tất cả records cùng lúc
    const { error: insertError } = await supabase
      .from('installment_history')
      .insert(paymentRecords as any[]);

    if (insertError) {
      throw new Error(`Lỗi khi ghi lịch sử thanh toán tùy biến: ${insertError.message}`);
    }

    console.log(`✅ Successfully recorded ${paymentRecords.length} custom payment records with total amount ${customAmount} from ${startDate} to ${endDate}`);

  } catch (error) {
    console.error('Error recording custom daily payments:', error);
    throw error;
  }
}

