import { supabase } from './supabase';
import { CreditPaymentPeriod, CreatePaymentPeriodData, UpdatePaymentPeriodData, PaymentPeriodStatus } from '@/models/credit-payment';

/**
 * Lấy danh sách kỳ thanh toán của một hợp đồng
 */
export async function getCreditPaymentPeriods(creditId: string) {
  console.log(creditId);
  const { data, error } = await supabase
    .from('credit_payment_periods')
    .select('*')
    .eq('credit_id', creditId)
    .order('period_number', { ascending: true });
  
  return { data, error };
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
  const { data, error } = await supabase
    .rpc('recreate_payment_periods', {
      credit_id_param: creditId,
      periods_param: periods
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
