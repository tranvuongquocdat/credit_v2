import { supabase } from "../supabase";

// Interface cho payment history record
export interface PaymentHistoryRecord {
  id: string;
  installment_id: string;
  transaction_type: string;
  effective_date: string | null;
  transaction_date: string | null;
  date_status: string | null;
  credit_amount: number | null;
  debit_amount: number | null;
  description: string | null;
  period_number?: number | null;
  created_at: string | null;
  updated_at?: string | null;
  is_deleted?: boolean;
  employee_id?: string | null;
}

/**
 * Lấy lịch sử thanh toán lãi phí của một hợp đồng installment
 * @param installmentId - ID của hợp đồng installment
 * @returns Promise<PaymentHistoryRecord[]> - Danh sách lịch sử thanh toán
 */
export async function getinstallmentPaymentHistory(
  installmentId: string, 
): Promise<PaymentHistoryRecord[]> {
  let query = supabase
    .from('installment_history')
    .select('*')
    .eq('installment_id', installmentId)
    .eq('transaction_type', 'payment')
    .eq('is_deleted', false);

  const { data, error } = await query.order('effective_date', { ascending: true });
  if (error) {
    console.error('Error fetching payment history:', error);
    throw new Error(`Failed to fetch payment history: ${error.message}`);
  }

  return data || [];
}

/**
 * Lấy lịch sử thanh toán lãi phí của một hợp đồng installment trong khoảng thời gian
 * @param installmentId - ID của hợp đồng installment
 * @param startDate - Ngày bắt đầu (YYYY-MM-DD)
 * @param endDate - Ngày kết thúc (YYYY-MM-DD)
 * @returns Promise<PaymentHistoryRecord[]> - Danh sách lịch sử thanh toán trong khoảng thời gian
 */
export async function getinstallmentPaymentHistoryByDateRange(
  installmentId: string, 
  startDate: string, 
  endDate: string
): Promise<PaymentHistoryRecord[]> {
  const { data, error } = await supabase
    .from('installment_history')
    .select('*')
    .eq('installment_id', installmentId)
    .eq('transaction_type', 'payment')
    .gte('effective_date', startDate)
    .lte('effective_date', endDate + 'T23:59:59Z')
    .order('effective_date', { ascending: true });

  if (error) {
    console.error('Error fetching payment history by date range:', error);
    throw new Error(`Failed to fetch payment history: ${error.message}`);
  }

  return data || [];
}

/**
 * Lấy lịch sử thanh toán theo date_status
 * @param installmentId - ID của hợp đồng installment
 * @param dateStatus - Status cần filter ('start', 'end', 'only', null)
 * @returns Promise<PaymentHistoryRecord[]> - Danh sách lịch sử thanh toán theo status
 */
export async function getinstallmentPaymentHistoryByStatus(
  installmentId: string, 
  dateStatus: string | null
): Promise<PaymentHistoryRecord[]> {
  let query = supabase
    .from('installment_history')
    .select('*')
    .eq('installment_id', installmentId)
    .eq('transaction_type', 'payment');

  if (dateStatus === null) {
    query = query.is('date_status', null);
  } else {
    query = query.eq('date_status', dateStatus);
  }

  const { data, error } = await query.order('effective_date', { ascending: true });

  if (error) {
    console.error('Error fetching payment history by status:', error);
    throw new Error(`Failed to fetch payment history: ${error.message}`);
  }

  return data || [];
}

/**
 * Lấy tổng số tiền đã thanh toán của một hợp đồng installment
 * @param installmentId - ID của hợp đồng installment
 * @returns Promise<number> - Tổng số tiền đã thanh toán
 */
export async function getTotalPaidAmount(installmentId: string): Promise<number> {
  const { data, error } = await supabase
    .from('installment_history')
    .select('credit_amount, debit_amount')
    .eq('installment_id', installmentId)
    .eq('transaction_type', 'payment');

  if (error) {
    console.error('Error calculating total paid amount:', error);
    throw new Error(`Failed to calculate total paid amount: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return 0;
  }

  return data.reduce((total, record) => {
    const creditAmount = record.credit_amount || 0;
    const debitAmount = record.debit_amount || 0;
    return total + creditAmount - debitAmount;
  }, 0);
}

/**
 * Lấy payment periods từ lịch sử thanh toán
 * Grouping theo start-end pairs và only status
 * @param installmentId - ID của hợp đồng installment
 * @returns Promise<Array<{start_date: string, end_date: string, total_amount: number}>>
 */
export async function getPaymentPeriods(installmentId: string): Promise<Array<{
  start_date: string;
  end_date: string;
  total_amount: number;
  period_number?: number;
}>> {
  const paymentHistory = await getinstallmentPaymentHistory(installmentId);
  
  const periods: Array<{
    start_date: string;
    end_date: string;
    total_amount: number;
    period_number?: number;
  }> = [];

  let i = 0;
  while (i < paymentHistory.length) {
    const current = paymentHistory[i];
    
    if (current.date_status === 'start') {
      // Tìm end tương ứng
      let endIndex = i + 1;
      while (endIndex < paymentHistory.length && paymentHistory[endIndex].date_status !== 'end') {
        endIndex++;
      }
      
      if (endIndex < paymentHistory.length) {
        // Tính tổng amount từ start đến end
        let totalAmount = 0;
        for (let j = i; j <= endIndex; j++) {
          const record = paymentHistory[j];
          totalAmount += (record.credit_amount || 0) - (record.debit_amount || 0);
        }
        
        periods.push({
          start_date: current.effective_date?.split('T')[0] || '',
          end_date: paymentHistory[endIndex].effective_date?.split('T')[0] || '',
          total_amount: totalAmount,
          period_number: current.period_number || undefined
        });
        
        i = endIndex + 1;
      } else {
        // Start không có end
        periods.push({
          start_date: current.effective_date?.split('T')[0] || '',
          end_date: current.effective_date?.split('T')[0] || '',
          total_amount: (current.credit_amount || 0) - (current.debit_amount || 0),
          period_number: current.period_number || undefined
        });
        i++;
      }
    } else if (current.date_status === 'only') {
      periods.push({
        start_date: current.effective_date?.split('T')[0] || '',
        end_date: current.effective_date?.split('T')[0] || '',
        total_amount: (current.credit_amount || 0) - (current.debit_amount || 0),
        period_number: current.period_number || undefined
      });
      i++;
    } else {
      i++;
    }
  }
  
  return periods;
}

/**
 * Check xem một ngày có payment hay không
 * @param installmentId - ID của hợp đồng installment
 * @param date - Ngày cần check (YYYY-MM-DD)
 * @returns Promise<boolean> - true nếu có payment, false nếu không
 */
export async function hasPaymentOnDate(installmentId: string, date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('installment_history')
    .select('id')
    .eq('installment_id', installmentId)
    .eq('transaction_type', 'payment')
    .gte('effective_date', date)
    .lte('effective_date', date + 'T23:59:59Z')
    .limit(1);

  if (error) {
    console.error('Error checking payment on date:', error);
    return false;
  }

  return (data && data.length > 0);
}

/**
 * Lấy toàn bộ lịch sử thanh toán với transaction_type=payment và is_deleted=false
 * Có xử lý phân trang để tránh giới hạn của Supabase
 * @param installmentId - ID của hợp đồng installment
 * @param endDate - Ngày kết thúc để lọc (YYYY-MM-DD), nếu có
 * @returns Promise<PaymentHistoryRecord[]> - Danh sách lịch sử thanh toán
 */
export async function getAllValidPaymentHistory(
  installmentId: string,
  endDate?: string
): Promise<PaymentHistoryRecord[]> {
  const allRecords: PaymentHistoryRecord[] = [];
  const pageSize = 1000; // Kích thước trang để tránh giới hạn Supabase
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('installment_history')
      .select('*')
      .eq('installment_id', installmentId)
      .eq('transaction_type', 'payment')
      .eq('is_deleted', false)
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order('transaction_date', { ascending: true });

    // Thêm điều kiện lọc theo ngày nếu có
    if (endDate) {
      query = query.lte('transaction_date', endDate + 'T23:59:59Z');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching valid payment history:', error);
      throw new Error(`Failed to fetch valid payment history: ${error.message}`);
    }

    if (data && data.length > 0) {
      allRecords.push(...data);
      hasMore = data.length === pageSize; // Nếu trả về đủ pageSize thì có thể còn trang tiếp theo
    } else {
      hasMore = false;
    }

    page++;
  }

  return allRecords;
}

/**
 * Lấy toàn bộ lịch sử thanh toán với transaction_type=payment và is_deleted=false trong khoảng thời gian
 * @param installmentId - ID của hợp đồng installment
 * @param startDate - Ngày bắt đầu (YYYY-MM-DD)
 * @param endDate - Ngày kết thúc (YYYY-MM-DD)
 * @returns Promise<PaymentHistoryRecord[]> - Danh sách lịch sử thanh toán trong khoảng thời gian
 */
export async function getAllValidPaymentHistoryByDateRange(
  installmentId: string,
  startDate: string,
  endDate: string
): Promise<PaymentHistoryRecord[]> {
  const allRecords: PaymentHistoryRecord[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('installment_history')
      .select('*')
      .eq('installment_id', installmentId)
      .eq('transaction_type', 'payment')
      .eq('is_deleted', false)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate + 'T23:59:59Z')
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order('transaction_date', { ascending: true });

    if (error) {
      console.error('Error fetching valid payment history by date range:', error);
      throw new Error(`Failed to fetch valid payment history: ${error.message}`);
    }

    if (data && data.length > 0) {
      allRecords.push(...data);
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }

    page++;
  }

  return allRecords;
} 