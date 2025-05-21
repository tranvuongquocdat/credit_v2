import { InstallmentStatus } from '@/models/installment';
import { supabase } from './supabase';
import { 
  InstallmentPaymentPeriodDB,
  InstallmentPaymentPeriod,
  CreateInstallmentPaymentPeriodParams,
  UpdateInstallmentPaymentPeriodParams,
  InstallmentPaymentPeriodFilters
} from '@/models/installmentPayment';
import { addDays, format, differenceInDays, parseISO } from 'date-fns';

// Helper for logging
const logError = (message: string, error: unknown) => {
  console.error(`[InstallmentPayment] ${message}:`, error);
};

/**
 * Get payment periods for an installment
 */
export async function getInstallmentPaymentPeriods(
  installmentId: string,
  filters?: InstallmentPaymentPeriodFilters
) {
  try {
    let query = supabase
      .from('installment_payment_period')
      .select('*', { count: 'exact' })
      .eq('installment_id', installmentId);
    
    // Apply filters if provided
    if (filters) {
      if (filters.from_date) {
        query = query.gte('date', filters.from_date);
      }
      
      if (filters.to_date) {
        query = query.lte('date', filters.to_date);
      }
    }
    
    // Execute query
    const { data, error, count } = await query.order('period_number', { ascending: true });
    
    if (error) throw error;
    
    // Transform data for UI
    const today = new Date();
    const paymentPeriods = (data || []).map(item => {
      // Ensure item has all required properties with proper types
      const safeItem: InstallmentPaymentPeriodDB = {
        ...item,
      };
      return transformPaymentPeriod(safeItem, today);
    });
    
    return {
      data: paymentPeriods,
      total: count || 0,
      error: null
    };
  } catch (error) {
    logError('Error fetching payment periods', error);
    return {
      data: [],
      total: 0,
      error
    };
  }
}

/**
 * Get a single payment period by ID
 */
export async function getInstallmentPaymentPeriodById(id: string) {
  try {
    const { data, error } = await supabase
      .from('installment_payment_period')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    // Transform data for UI
    const today = new Date();
    // Ensure data has all required properties with proper types
    const safeItem: InstallmentPaymentPeriodDB = {
      ...data,
    };
    const paymentPeriod = transformPaymentPeriod(safeItem, today);
    
    return {
      data: paymentPeriod,
      error: null
    };
  } catch (error) {
    logError('Error fetching payment period', error);
    return {
      data: null,
      error
    };
  }
}

/**
 * Create a new payment period
 */
export async function createInstallmentPaymentPeriod(params: CreateInstallmentPaymentPeriodParams) {
  try {
    const { data, error } = await supabase
      .from('installment_payment_period')
      .insert(params)
      .select()
      .single();
    
    if (error) throw error;
    
    // Transform data for UI
    const today = new Date();
    const paymentPeriod = transformPaymentPeriod(data, today);
    
    return {
      data: paymentPeriod,
      error: null
    };
  } catch (error) {
    logError('Error creating payment period', error);
    return {
      data: null,
      error
    };
  }
}

/**
 * Update a payment period (e.g., when a payment is made)
 */
export async function updateInstallmentPaymentPeriod(
  id: string,
  params: UpdateInstallmentPaymentPeriodParams
) {
  try {
    const { data, error } = await supabase
      .from('installment_payment_period')
      .update(params)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Transform data for UI
    const today = new Date();
    const paymentPeriod = transformPaymentPeriod(data, today);
    
    return {
      data: paymentPeriod,
      error: null
    };
  } catch (error) {
    logError('Error updating payment period', error);
    return {
      data: null,
      error
    };
  }
}

/**
 * Delete a payment period
 */
export async function deleteInstallmentPaymentPeriod(id: string) {
  try {
    // Get the payment period data before deleting
    const { data: periodData, error: getPeriodError } = await supabase
      .from('installment_payment_period')
      .select('*')
      .eq('id', id)
      .single();
    
    if (getPeriodError) throw getPeriodError;
    
    // Delete the payment period
    const { error } = await supabase
      .from('installment_payment_period')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    // Record payment cancellation history
    if (periodData && periodData.actual_amount && periodData.actual_amount > 0) {
      try {
        const { recordCancelPayment } = await import('./installmentAmountHistory');
        const { getInstallmentById } = await import('./installment');
        
        // Get employee_id from installment
        const { data: installmentData } = await getInstallmentById(periodData.installment_id);
        
        if (installmentData) {
          await recordCancelPayment(
            periodData.installment_id,
            installmentData.employee_id,
            periodData.actual_amount
          );
        }
      } catch (historyError) {
        console.error('Error recording payment cancellation history:', historyError);
        // Continue anyway
      }
    }
    
    return {
      success: true,
      error: null
    };
  } catch (error) {
    logError('Error deleting payment period', error);
    return {
      success: false,
      error
    };
  }
}

/**
 * Đánh dấu một kỳ thanh toán là đã thanh toán
 */
export async function markInstallmentPeriodAsPaid(periodId: string, actualAmount: number, paymentDate: string, notes?: string) {
  const updateData: UpdateInstallmentPaymentPeriodParams = {
    actual_amount: actualAmount,
    payment_date: paymentDate,
    notes
  };
  
  return await updateInstallmentPaymentPeriod(periodId, updateData);
}

/**
 * Đánh dấu một kỳ thanh toán là thanh toán một phần
 */
export async function markInstallmentPeriodAsPartiallyPaid(periodId: string, actualAmount: number, paymentDate: string, notes?: string) {
  const updateData: UpdateInstallmentPaymentPeriodParams = {
    actual_amount: actualAmount,
    payment_date: paymentDate,
    notes
  };
  
  return await updateInstallmentPaymentPeriod(periodId, updateData);
}

/**
 * Lưu hoặc cập nhật thanh toán của một kỳ: xử lý cả khi kỳ chưa có trong DB và cả khi đã có
 * @param installmentId - ID của hợp đồng
 * @param periodData - Dữ liệu kỳ thanh toán (nếu đã tồn tại trong DB)
 * @param actualAmount - Số tiền lãi thực tế
 * @param isCalculatedPeriod - Có phải là kỳ chưa có trong DB không
 */
export async function saveInstallmentPayment(
  installmentId: string,
  periodData: Partial<InstallmentPaymentPeriod>,
  actualAmount: number,
  isCalculatedPeriod: boolean = false
) {
  if (!installmentId) return { data: null, error: new Error('Installment ID is required') };
  
  try {
    const now = new Date().toISOString();
    
    // Dữ liệu cập nhật cho DB
    const paymentDate = now.split('T')[0];
    let response;
    
    // Nếu là kỳ tính toán (chưa lưu trong DB), tạo mới
    if (isCalculatedPeriod) {
      // Đảm bảo có đủ các trường cần thiết
      if (!periodData.periodNumber || !periodData.dueDate || !periodData.expectedAmount) {
        return { data: null, error: new Error('Missing required period data') };
      }
      
      // Tạo mới kỳ trong DB
      const createParams: CreateInstallmentPaymentPeriodParams = {
        installment_id: installmentId,
        period_number: periodData.periodNumber,
        date: periodData.dueDate.split('/').reverse().join('-'), // Convert from DD/MM/YYYY to YYYY-MM-DD
        expected_amount: periodData.expectedAmount,
        actual_amount: actualAmount,
        payment_date: paymentDate,
        notes: periodData.notes
      };
      
      response = await createInstallmentPaymentPeriod(createParams);
    } else {
      // Cập nhật kỳ đã có trong DB
      if (!periodData.id) {
        return { data: null, error: new Error('Period ID is required for updating') };
      }
      
      const updateParams: UpdateInstallmentPaymentPeriodParams = {
        actual_amount: actualAmount,
        payment_date: paymentDate,
        notes: periodData.notes
      };
      
      response = await updateInstallmentPaymentPeriod(periodData.id, updateParams);
    }
    
    // Ghi lịch sử giao dịch
    try {
      const { recordPayment } = await import('./installmentAmountHistory');
      const { getInstallmentById } = await import('./installment');
      
      // Lấy thông tin của hợp đồng để lấy employee_id
      const { data: installmentData } = await getInstallmentById(installmentId);
      
      if (installmentData && actualAmount > 0) {
        await recordPayment(installmentId, installmentData.employee_id, actualAmount);
      }
    } catch (historyError) {
      console.error('Error recording payment history:', historyError);
      // Không throw error ở đây, tiếp tục trả về kết quả của việc lưu thanh toán
    }
    
    return response;
  } catch (error) {
    logError('Error saving payment', error);
    return { data: null, error };
  }
}

/**
 * Generate payment periods for an installment
 */
export async function generateInstallmentPaymentPeriods(
  installmentId: string,
  totalAmount: number,
  startDate: string,
  periodDays: number,
  totalPeriods: number
) {
  try {
    // Calculate amount per period
    const amountPerPeriod = Math.round(totalAmount / totalPeriods);
    
    // Generate payment periods
    const periods: CreateInstallmentPaymentPeriodParams[] = [];
    
    for (let i = 0; i < totalPeriods; i++) {
      const periodNumber = i + 1;
      const date = format(
        addDays(new Date(startDate), i * periodDays),
        'yyyy-MM-dd'
      );
      
      // Last period might have a different amount due to rounding
      const expected_amount = 
        periodNumber === totalPeriods
          ? totalAmount - (amountPerPeriod * (totalPeriods - 1))
          : amountPerPeriod;
      
      periods.push({
        installment_id: installmentId,
        period_number: periodNumber,
        date,
        expected_amount,
      });
    }
    
    // Insert all periods at once
    const { data, error } = await supabase
      .from('installment_payment_period')
      .insert(periods)
      .select();
    
    if (error) throw error;
    
    // Transform data for UI
    const today = new Date();
    const paymentPeriods = (data || []).map(item => transformPaymentPeriod(item, today));
    
    return {
      data: paymentPeriods,
      error: null
    };
  } catch (error) {
    logError('Error generating payment periods', error);
    return {
      data: null,
      error
    };
  }
}

/**
 * Transform database model to UI model
 */
function transformPaymentPeriod(
  item: InstallmentPaymentPeriodDB,
  today: Date = new Date()
): InstallmentPaymentPeriod {
  const dueDate = new Date(item.date);
  const isOverdue = !item.payment_date && dueDate < today;
  
  // Calculate days overdue if applicable
  let daysOverdue: number | undefined;
  if (isOverdue) {
    daysOverdue = differenceInDays(today, dueDate);
  }
  
  // Calculate remaining amount for partial payments
  let remainingAmount: number | undefined;
  if (
    item.actual_amount !== undefined && 
    item.actual_amount !== null
  ) {
    remainingAmount = item.expected_amount - item.actual_amount;
  }
  
  return {
    id: item.id,
    installmentId: item.installment_id,
    periodNumber: item.period_number,
    dueDate: format(dueDate, 'dd/MM/yyyy'),
    paymentDate: item.payment_date ? format(parseISO(item.payment_date), 'dd/MM/yyyy') : undefined,
    expectedAmount: item.expected_amount,
    actualAmount: item.actual_amount || undefined,
    notes: item.notes || undefined,
    created: item.created_at || undefined,
    updated: item.updated_at || undefined,
    
    // Computed properties
    remainingAmount,
    isOverdue,
    daysOverdue
  };
}

/**
 * Update the status of an installment
 */
export async function updateInstallmentStatus(installmentId: string, status: InstallmentStatus) {
  try {
    const { data, error } = await supabase
      .from('installments')
      .update({ status: status.toString() as any })
      .eq('id', installmentId)
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      data,
      error: null
    };
  } catch (error) {
    logError('Error updating installment status', error);
    return {
      data: null,
      error
    };
  }
} 