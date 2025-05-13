import { supabase } from './supabase';
import { CreditPaymentPeriod, CreatePaymentPeriodData, UpdatePaymentPeriodData, PaymentPeriodStatus } from '@/models/credit-payment';

/**
 * Lấy danh sách kỳ thanh toán của một hợp đồng
 * Đã thêm logging và xử lý lỗi tốt hơn
 */
export async function getCreditPaymentPeriods(creditId: string) {
  // Kiểm tra ID hợp lệ
  if (!creditId) {
    console.error('getCreditPaymentPeriods called with invalid creditId:', creditId);
    return { data: null, error: new Error('Credit ID is required') };
  }
  
  console.log('getCreditPaymentPeriods - Fetching periods for credit ID:', creditId);
  
  try {
    // Mặc định thử 3 lần nếu có lỗi kết nối
    let attempt = 0;
    let data = null;
    let error = null;
    
    while (attempt < 3 && !data && !error) {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt} for credit ID ${creditId}`);
        // Chờ 500ms trước khi thử lại
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const response = await supabase
        .from('credit_payment_periods')
        .select('*')
        .eq('credit_id', creditId)
        .order('period_number', { ascending: true });
      
      data = response.data;
      error = response.error;
      
      console.log(`Attempt ${attempt + 1} result - data count:`, data?.length, 'error:', error);
      attempt++;
    }
    
    if (error) {
      console.error('Error fetching payment periods after retries:', error);
    } else if (data) {
      console.log('Successfully fetched payment periods. Count:', data.length);
    }
    
    return { data, error };
  } catch (e) {
    console.error('Unexpected error in getCreditPaymentPeriods:', e);
    return { data: null, error: e as Error };
  }
}

/**
 * Tạo một kỳ thanh toán mới
 */
export async function createPaymentPeriod(periodData: CreatePaymentPeriodData) {
  const { data, error } = await supabase
    .from('credit_payment_periods')
    .insert([periodData])
    .select()
    .single();
  
  return { data, error };
}

/**
 * Tạo nhiều kỳ thanh toán cùng lúc
 */
export async function createManyPaymentPeriods(periods: CreatePaymentPeriodData[]) {
  const { data, error } = await supabase
    .from('credit_payment_periods')
    .insert(periods)
    .select();
  
  return { data, error };
}

/**
 * Cập nhật thông tin kỳ thanh toán
 */
export async function updatePaymentPeriod(periodId: string, updateData: UpdatePaymentPeriodData) {
  const { data, error } = await supabase
    .from('credit_payment_periods')
    .update(updateData)
    .eq('id', periodId)
    .select()
    .single();
  
  return { data, error };
}

/**
 * Xóa một kỳ thanh toán
 */
export async function deletePaymentPeriod(periodId: string) {
  const { error } = await supabase
    .from('credit_payment_periods')
    .delete()
    .eq('id', periodId);
  
  return { error };
}

/**
 * Đánh dấu một kỳ thanh toán là đã thanh toán
 */
export async function markPeriodAsPaid(periodId: string, actualAmount: number, paymentDate: string, notes?: string) {
  const updateData: UpdatePaymentPeriodData = {
    actual_amount: actualAmount,
    payment_date: paymentDate,
    status: PaymentPeriodStatus.PAID,
    notes: notes
  };
  
  return await updatePaymentPeriod(periodId, updateData);
}

/**
 * Đánh dấu một kỳ thanh toán là thanh toán một phần
 */
export async function markPeriodAsPartiallyPaid(periodId: string, actualAmount: number, paymentDate: string, notes?: string) {
  const updateData: UpdatePaymentPeriodData = {
    actual_amount: actualAmount,
    payment_date: paymentDate,
    status: PaymentPeriodStatus.PARTIALLY_PAID,
    notes: notes
  };
  
  return await updatePaymentPeriod(periodId, updateData);
}

/**
 * Đánh dấu một kỳ thanh toán là quá hạn
 */
export async function markPeriodAsOverdue(periodId: string, notes?: string) {
  const updateData: UpdatePaymentPeriodData = {
    status: PaymentPeriodStatus.OVERDUE,
    notes: notes
  };
  
  return await updatePaymentPeriod(periodId, updateData);
}

/**
 * Xóa tất cả các kỳ thanh toán của một hợp đồng
 */
export async function deleteAllPaymentPeriods(creditId: string) {
  const { error } = await supabase
    .from('credit_payment_periods')
    .delete()
    .eq('credit_id', creditId);
  
  return { error };
}

/**
 * Tạo lại tất cả các kỳ thanh toán của một hợp đồng
 * (Xóa tất cả các kỳ cũ và tạo mới)
 */
export async function recreatePaymentPeriods(creditId: string, periods: CreatePaymentPeriodData[]) {
  // Sử dụng transaction để đảm bảo tính nhất quán
  // Convert CreatePaymentPeriodData[] to a record object to satisfy Json type requirement
  const periodsAsJson = periods.map(period => {
    return {
      ...period,
      // Ensure all dates are properly formatted as strings
      start_date: period.start_date?.toString() || '',
      end_date: period.end_date?.toString() || '',
      expected_amount: Number(period.expected_amount || 0)
    };
  });
  
  const { data, error } = await supabase
    .rpc('recreate_payment_periods', {
      credit_id_param: creditId,
      periods_param: periodsAsJson as any // Type assertion to bypass TypeScript error
    });
  
  if (error) {
    // Fallback nếu RPC không hoạt động
    // Xóa tất cả các kỳ cũ
    const deleteResult = await deleteAllPaymentPeriods(creditId);
    if (deleteResult.error) {
      return { data: null, error: deleteResult.error };
    }
    
    // Tạo các kỳ mới
    return await createManyPaymentPeriods(periods);
  }
  
  return { data, error };
}

/**
 * Lấy tổng số tiền đã thanh toán của một hợp đồng
 */
export async function getTotalPaidAmount(creditId: string) {
  const { data, error } = await supabase
    .from('credit_payment_periods')
    .select('actual_amount')
    .eq('credit_id', creditId);
    
  if (error || !data) {
    return { total: 0, error };
  }
  
  const total = data.reduce((sum, period) => sum + (period.actual_amount || 0), 0);
  return { total, error: null };
}
