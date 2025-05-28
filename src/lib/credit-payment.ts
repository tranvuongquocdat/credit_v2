import { supabase } from './supabase';
import { CreditPaymentPeriod, CreatePaymentPeriodData, UpdatePaymentPeriodData } from '@/models/credit-payment';

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
  try {
    // Lấy thông tin kỳ thanh toán trước khi xóa
    const { data: periodData, error: fetchError } = await supabase
      .from('credit_payment_periods')
      .select('*')
      .eq('id', periodId)
      .single();
      
    if (fetchError) {
      return { error: fetchError };
    }
    
    // Update debt amount if there was an actual payment
    if (periodData && periodData.actual_amount && periodData.actual_amount > 0) {
      await updateCreditDebtAmount(
        periodData.credit_id, 
        periodData.expected_amount || 0, 
        periodData.actual_amount, 
        false // Unchecking (removing payment)
      );
    }
    
    // Xóa kỳ thanh toán
    const { error } = await supabase
      .from('credit_payment_periods')
      .delete()
      .eq('id', periodId);
    
    if (error) {
      return { error };
    }
    
    // Ghi nhận việc hủy đóng lãi vào lịch sử
    if (periodData && periodData.actual_amount && periodData.actual_amount > 0) {
      try {
        const { recordCancelInterestPayment } = await import('./credit-amount-history');
        
        // Ghi nhận không đồng bộ (không chờ đợi)
        recordCancelInterestPayment(
          periodData.credit_id,
          periodData.actual_amount,
          `Hủy đóng lãi kỳ ${periodData.period_number}`
        ).catch(e => console.error('Error recording cancel interest payment:', e));
      } catch (historyError) {
        console.error('Error importing recordCancelInterestPayment:', historyError);
      }
    }
    
    return { error: null };
  } catch (error) {
    console.error('Error deleting payment period:', error);
    return { error };
  }
}

/**
 * Đánh dấu một kỳ thanh toán là đã thanh toán
 */
export async function markPeriodAsPaid(periodId: string, actualAmount: number, paymentDate: string, notes?: string) {
  const updateData: UpdatePaymentPeriodData = {
    actual_amount: actualAmount,
    payment_date: paymentDate,
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
    notes: notes
  };
  
  return await updatePaymentPeriod(periodId, updateData);
}

/**
 * Đánh dấu một kỳ thanh toán là quá hạn
 */
export async function markPeriodAsOverdue(periodId: string, notes?: string) {
  const updateData: UpdatePaymentPeriodData = {
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
      periods_param: JSON.parse(JSON.stringify(periodsAsJson)) // Convert to proper Json type
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

/**
 * Lưu hoặc cập nhật thanh toán của một kỳ: xử lý cả khi kỳ chưa có trong DB và cả khi đã có
 * @param creditId - ID của hợp đồng
 * @param periodData - Dữ liệu kỳ thanh toán (nếu đã tồn tại trong DB)
 * @param actualAmount - Số tiền lãi thực tế
 * @param otherAmount - Số tiền khác
 * @param isCalculatedPeriod - Có phải là kỳ chưa có trong DB không
 */
export async function savePaymentWithOtherAmount(
  creditId: string,
  periodData: Partial<CreditPaymentPeriod>,
  actualAmount: number,
  otherAmount: number,
  isCalculatedPeriod: boolean = false
) {
  try {
    console.log('savePaymentWithOtherAmount called with:', { 
      creditId, 
      periodData, 
      actualAmount, 
      otherAmount, 
      isCalculatedPeriod 
    });
    
    const now = new Date().toISOString();
    
    let response;
    const expectedAmount = periodData.expected_amount || 0;
    
    if (isCalculatedPeriod) {
      // Trường hợp kỳ tính toán động chưa được lưu
      // Tạo mới kỳ trong DB
      if (!periodData.period_number || !periodData.start_date || !periodData.end_date || !periodData.expected_amount) {
        return { data: null, error: new Error('Missing required period data') };
      }

      response = await supabase
        .from('credit_payment_periods')
        .insert({
          credit_id: creditId,
          period_number: periodData.period_number,
          start_date: periodData.start_date,
          end_date: periodData.end_date,
          expected_amount: periodData.expected_amount,
          actual_amount: actualAmount,
          other_amount: otherAmount,
          payment_date: now,
          notes: periodData.notes || null
        })
        .select()
        .single();
        
      // Update debt amount for new payment
      if (response.data) {
        await updateCreditDebtAmount(creditId, expectedAmount, actualAmount, true);
      }
    } else {
      // Cập nhật kỳ đã tồn tại
      if (!periodData.id) {
        return { data: null, error: new Error('Missing period ID for update') };
      }
      
      // Get current actual amount before update
      const { data: currentPeriod } = await supabase
        .from('credit_payment_periods')
        .select('actual_amount')
        .eq('id', periodData.id)
        .single();
      
      const previousActualAmount = currentPeriod?.actual_amount || 0;

      response = await supabase
        .from('credit_payment_periods')
        .update({
          actual_amount: actualAmount,
          other_amount: otherAmount,
          payment_date: now,
          notes: periodData.notes || null
        })
        .eq('id', periodData.id)
        .select()
        .single();
        
      // Update debt amount for payment change
      if (response.data) {
        // First undo the previous payment
        if (previousActualAmount > 0) {
          await updateCreditDebtAmount(creditId, expectedAmount, previousActualAmount, false);
        }
        // Then apply the new payment
        if (actualAmount > 0) {
          await updateCreditDebtAmount(creditId, expectedAmount, actualAmount, true);
        }
      }
    }

    if (response.error) {
      console.error('Database error:', response.error);
      return { data: null, error: response.error };
    }

    // Ghi nhận việc đóng lãi vào lịch sử nếu có số tiền thực tế
    if (response.data && actualAmount > 0) {
      try {
        const { recordInterestPayment } = await import('./credit-amount-history');
        
        const totalAmount = actualAmount + otherAmount;
        
        // Ghi nhận không đồng bộ (không chờ đợi)
        recordInterestPayment(
          creditId,
          totalAmount,
          `Đóng lãi kỳ ${periodData.period_number}`
        ).catch(e => console.error('Error recording interest payment:', e));
      } catch (historyError) {
        console.error('Error importing recordInterestPayment:', historyError);
      }
    }

    return { data: response.data, error: null };
  } catch (error) {
    console.error('Error saving payment:', error);
    return { data: null, error };
  }
}

// Function to update debt amount when payment is checked/unchecked
export async function updateCreditDebtAmount(
  creditId: string,
  expectedAmount: number,
  actualAmount: number,
  isChecked: boolean
) {
  try {
    // Get current debt amount
    const { data: credit, error: fetchError } = await supabase
      .from('credits')
      .select('debt_amount')
      .eq('id', creditId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const currentDebt = credit.debt_amount || 0;
    
    // Calculate new debt amount
    let newDebtAmount: number;
    
    // If expectedAmount is 0, treat actualAmount as the total change amount
    if (expectedAmount === 0) {
      // Direct change mode for batch updates
      newDebtAmount = currentDebt + (isChecked ? actualAmount : -actualAmount);
    } else {
      // Individual period mode
      const difference = actualAmount - expectedAmount;
      if (isChecked) {
        // When checking: debt + (actual - expected)
        newDebtAmount = currentDebt + difference;
      } else {
        // When unchecking: debt - (actual - expected)
        newDebtAmount = currentDebt - difference;
      }
    }

    // Update debt amount in database
    const { error: updateError } = await supabase
      .from('credits')
      .update({ 
        debt_amount: newDebtAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', creditId);

    if (updateError) {
      throw updateError;
    }

    return { success: true, newDebtAmount };
  } catch (error: unknown) {
    console.error('Error updating credit debt amount:', error);
    return { success: false, error: error as Error };
  }
}

/**
 * Reset debt amount of a credit to 0
 */
export async function resetCreditDebtAmount(creditId: string) {
  try {
    const { error } = await supabase
      .from('credits')
      .update({ 
        debt_amount: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', creditId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Error resetting credit debt amount:', error);
    return { success: false, error: error as Error };
  }
}
