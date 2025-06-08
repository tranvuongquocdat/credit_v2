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

// Function to update debt amount when payment is checked/unchecked
export async function updateInstallmentDebtAmount(
  installmentId: string,
  expectedAmount: number,
  actualAmount: number,
  isChecked: boolean
) {
  try {
    // Get current debt amount
    const { data: installment, error: fetchError } = await supabase
      .from('installments')
      .select('debt_amount')
      .eq('id', installmentId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const currentDebt = installment.debt_amount || 0;
    
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
      .from('installments')
      .update({ 
        debt_amount: newDebtAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', installmentId);

    if (updateError) {
      throw updateError;
    }

    return { success: true, newDebtAmount };
  } catch (error: any) {
    console.error('Error updating debt amount:', error);
    return { success: false, error };
  }
}

/**
 * Get payment periods for an installment
 */
export async function getInstallmentPaymentPeriods(
  installmentId: string,
  filters?: InstallmentPaymentPeriodFilters
) {
  try {
    if (!installmentId) {
      console.error('getInstallmentPaymentPeriods: Missing installmentId');
      return {
        data: [],
        total: 0,
        error: new Error('Missing installmentId')
      };
    }

    // Theo dõi thời gian thực hiện để debug
    const startTime = performance.now();
    console.log(`getInstallmentPaymentPeriods: started for ${installmentId}`);
    
    // Setup main query for data
    let dataQuery = supabase
      .from('installment_payment_period')
      .select('*')
      .eq('installment_id', installmentId);
    
    // Apply filters if provided
    if (filters) {
      if (filters.from_date) {
        dataQuery = dataQuery.gte('date', filters.from_date);
      }
      
      if (filters.to_date) {
        dataQuery = dataQuery.lte('date', filters.to_date);
      }
    }
    
    // Thực hiện truy vấn và sắp xếp kết quả
    const dataResult = await dataQuery.order('period_number', { ascending: true });
    
    if (dataResult.error) throw dataResult.error;
    
    const data = dataResult.data || [];
    
    // Transform data for UI - optimize by using map instead of forEach
    const today = new Date();
    const paymentPeriods = data.map(item => transformPaymentPeriod(item, today));
    
    // Đo thời gian hoàn thành
    const endTime = performance.now();
    console.log(`getInstallmentPaymentPeriods: completed in ${endTime - startTime}ms for ${installmentId}, returned ${paymentPeriods.length} periods`);
    
    return {
      data: paymentPeriods,
      total: data.length,
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
export async function deleteInstallmentPaymentPeriod(id: string, installmentId?: string) {
  try {
    // Get the payment period data before deleting
    const getPeriodPromise = supabase
      .from('installment_payment_period')
      .select('*')
      .eq('id', id)
      .single();
    
    // If installmentId is provided, get installment data in parallel
    const getInstallmentPromise = installmentId 
      ? supabase.from('installments').select('employee_id').eq('id', installmentId).single()
      : Promise.resolve({ data: null, error: null });
    
    // Execute both requests in parallel
    const [periodResult, installmentResult] = await Promise.all([
      getPeriodPromise,
      getInstallmentPromise
    ]);
    
    if (periodResult.error) throw periodResult.error;
    const periodData = periodResult.data;
    
    // Delete the payment period
    const { error } = await supabase
      .from('installment_payment_period')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    return {
      success: true,
      error: null,
      data: periodData // Return the deleted period data
    };
  } catch (error) {
    logError('Error deleting payment period', error);
    return {
      success: false,
      error,
      data: null
    };
  }
}

/**
 * Đánh dấu một kỳ thanh toán là đã thanh toán
 */
export async function markInstallmentPeriodAsPaid(periodId: string, actualAmount: number, paymentStartDate: string, notes?: string) {
  const updateData: UpdateInstallmentPaymentPeriodParams = {
    actual_amount: actualAmount,
    payment_start_date: paymentStartDate,
    notes
  };
  
  return await updateInstallmentPaymentPeriod(periodId, updateData);
}

/**
 * Đánh dấu một kỳ thanh toán là thanh toán một phần
 */
export async function markInstallmentPeriodAsPartiallyPaid(periodId: string, actualAmount: number, paymentStartDate: string, notes?: string) {
  const updateData: UpdateInstallmentPaymentPeriodParams = {
    actual_amount: actualAmount,
    payment_start_date: paymentStartDate,
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
    const paymentStartDate = now.split('T')[0];
    let response;
    
    // Nếu là kỳ tính toán (chưa lưu trong DB), tạo mới
    if (isCalculatedPeriod) {
      // Đảm bảo có đủ các trường cần thiết
      if (!periodData.periodNumber || !periodData.dueDate || !periodData.expectedAmount) {
        return { data: null, error: new Error('Missing required period data') };
      }
      
      // Convert dueDate from DD/MM/YYYY to YYYY-MM-DD
      const date = periodData.dueDate.split('/').reverse().join('-');
      
      // Calculate or use provided endDate
      let payment_end_date;
      if (periodData.endDate) {
        payment_end_date = periodData.endDate.split('/').reverse().join('-');
      } else {
        // Get installment details to calculate a proper end date
        const { data: installmentData } = await supabase
          .from('installments')
          .select('payment_period')
          .eq('id', installmentId)
          .single();
        
        // Default to 30 days if we can't get the payment period
        const paymentPeriod = installmentData?.payment_period || 30;
        
        // Calculate end date based on the payment period from the installment
        const startDate = new Date(date);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + paymentPeriod - 1);
        payment_end_date = format(endDate, 'yyyy-MM-dd');
      }
      
      // Tạo kỳ mới trong DB
      const { data, error } = await supabase
        .from('installment_payment_period')
        .insert({
          installment_id: installmentId,
          period_number: periodData.periodNumber,
          date,
          payment_end_date,
          expected_amount: periodData.expectedAmount,
          actual_amount: actualAmount,
          payment_start_date: paymentStartDate,
          notes: periodData.notes || `Payment made on ${new Date().toLocaleDateString()}`
        })
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      response = { data: transformPaymentPeriod(data), error: null };
    } else {
      // Cập nhật kỳ đã có trong DB
      if (!periodData.id) {
        return { data: null, error: new Error('Period ID is required for updating') };
      }
      
      // Create update parameters with all available data
      const updateParams: UpdateInstallmentPaymentPeriodParams = {
        actual_amount: actualAmount,
        notes: periodData.notes
      };
      
      // Add payment_start_date if provided in periodData or use default
      if (periodData.paymentStartDate) {
        updateParams.payment_start_date = periodData.paymentStartDate.split('/').reverse().join('-');
      } else if (actualAmount > 0) {
        // If actually paying something and no date specified, use current date
        updateParams.payment_start_date = paymentStartDate;
      }
      
      // Add payment_end_date if provided
      if (periodData.endDate) {
        updateParams.payment_end_date = periodData.endDate.split('/').reverse().join('-');
      }
      
      // Cập nhật kỳ thanh toán
      const { data, error } = await supabase
        .from('installment_payment_period')
        .update(updateParams)
        .eq('id', periodData.id)
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      response = { data: transformPaymentPeriod(data), error: null };
    }
    
    // Record payment history
    try {
      const { recordPayment } = await import('./installmentAmountHistory');
      const { getInstallmentById } = await import('./installment');
      
      // Get employee_id from installment
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
    // Calculate amount per period - distribute evenly across all periods
    const amountPerPeriod = Math.round(totalAmount / totalPeriods);
    
    // Generate payment periods
    const periods: CreateInstallmentPaymentPeriodParams[] = [];
    
    for (let i = 0; i < totalPeriods; i++) {
      const periodNumber = i + 1;
      const periodStartDate = addDays(new Date(startDate), i * periodDays);
      const date = format(periodStartDate, 'yyyy-MM-dd');
      
      // Calculate end date for this period
      let actualPeriodDays = periodDays;
      if (i === totalPeriods - 1) {
        // For the last period, make sure we don't exceed the total loan duration
        const totalDuration = periodDays * totalPeriods;
        const daysElapsed = i * periodDays;
        actualPeriodDays = Math.min(periodDays, totalDuration - daysElapsed);
      }
      
      // End date is start date + (periodDays - 1) to include start date in the count
      const periodEndDate = addDays(periodStartDate, actualPeriodDays - 1);
      const payment_end_date = format(periodEndDate, 'yyyy-MM-dd');
      
      // Calculate expected amount for this period
      let expected_amount = amountPerPeriod;
      
      // Last period might need adjustment to ensure the total matches exactly
      if (periodNumber === totalPeriods) {
        // Calculate the sum of all previous periods
        const previousPeriodsSum = periods.reduce((sum, period) => sum + period.expected_amount, 0);
        // Adjust the last period to make the total match exactly
        expected_amount = totalAmount - previousPeriodsSum;
      }
      
      periods.push({
        installment_id: installmentId,
        period_number: periodNumber,
        date,
        payment_end_date,
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
  const isOverdue = !item.payment_start_date && dueDate < today;
  
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
    endDate: item.payment_end_date ? format(parseISO(item.payment_end_date), 'dd/MM/yyyy') : undefined,
    paymentStartDate: item.payment_start_date ? format(parseISO(item.payment_start_date), 'dd/MM/yyyy') : undefined,
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

// Interface for batch payment processing
interface BatchPaymentItem {
  installmentId: string;
  periodData: Partial<InstallmentPaymentPeriod>;
  actualAmount: number;
  isCalculatedPeriod: boolean;
}

/**
 * Process multiple payment periods in a batch for better performance
 */
export async function batchSaveInstallmentPayments(payments: BatchPaymentItem[]) {
  if (!payments || payments.length === 0) {
    return { data: [], error: null };
  }
  
  try {
    const results = [];
    
    // Process in parallel with Promise.all for better performance
    const promises = payments.map(async item => {
      const result = await saveInstallmentPayment(
        item.installmentId,
        item.periodData,
        item.actualAmount,
        item.isCalculatedPeriod
      );
      return result.data;
    });
    
    const data = await Promise.all(promises);
    
    return {
      data,
      error: null
    };
  } catch (error) {
    logError('Error batch processing payments', error);
    return {
      data: [],
      error
    };
  }
}

// Helper function để kiểm tra kỳ đã có trong database
const isPeriodInDatabase = (period: InstallmentPaymentPeriod): boolean => {
  if (!period || !period.id) return false;
  return !period.id.startsWith("calculated-") && Boolean(period.actualAmount);
};

/**
 * Save multiple periods at once (e.g., when user pays for multiple periods)
 * @param installmentId - Installment ID
 * @param periods - List of periods to save
 * @param employeeId - Employee who processed the payment
 */
export async function bulkSaveInstallmentPayments(
  installmentId: string,
  periods: InstallmentPaymentPeriod[],
  employeeId?: string
) {
  try {
    const startTime = performance.now();
    console.log(`bulkSaveInstallmentPayments: started for ${installmentId} with ${periods.length} periods`);
    
    if (!installmentId || !periods || periods.length === 0) {
      return { data: null, error: new Error('Missing required parameters') };
    }

    const paymentDate = new Date().toISOString().split('T')[0];
    
    // Separate periods into:
    // 1. New periods (need to be created)
    // 2. Existing periods (need to be updated)
    const newPeriods = periods.filter(period => period.id.startsWith('calculated-'));
    const existingPeriods = periods.filter(period => !period.id.startsWith('calculated-'));
    
    console.log(`bulkSaveInstallmentPayments: ${newPeriods.length} new periods, ${existingPeriods.length} existing periods`);
    
    // Collect all period IDs to be updated or created
    const periodIds: string[] = [];
    
    // Get installment details for employee_id and payment period info - không chờ kết quả ngay
    const installmentPromise = supabase
      .from('installments')
      .select('payment_period, installment_amount, employee_id')
      .eq('id', installmentId)
      .single();
    
    // 1. Process new periods (bulk insert) - parallel processing
    let newPeriodsPromise = Promise.resolve({ data: null }) as Promise<any>;
    if (newPeriods.length > 0) {
      // Prepare data for bulk insert
      const periodsToCreate = newPeriods.map(period => {
        // Convert dueDate from DD/MM/YYYY to YYYY-MM-DD
        const date = period.dueDate.split('/').reverse().join('-');
        return {
          installment_id: installmentId,
          period_number: period.periodNumber,
          date,
          expected_amount: period.expectedAmount || 0,
          actual_amount: period.actualAmount || period.expectedAmount || 0,
          payment_start_date: period.dueDate.split('/').reverse().join('-'),
          payment_end_date: period.endDate ? period.endDate.split('/').reverse().join('-') : null
        };
      });
      
      // Execute bulk insert
      newPeriodsPromise = Promise.resolve(supabase
        .from('installment_payment_period')
        .insert(periodsToCreate)
        .select('id'));
    }
    
    // 2. Process existing periods (bulk update) - chuẩn bị song song
    let existingPeriodsPromise = Promise.resolve({ data: null }) as Promise<any>;
    if (existingPeriods.length > 0) {
      // Existing periods need to be updated individually
      const updatePromises = existingPeriods.map(period => {
        const payment_start_date = period.paymentStartDate 
          ? period.paymentStartDate.split('/').reverse().join('-')
          : paymentDate;
        
        return supabase
          .from('installment_payment_period')
          .update({
            actual_amount: period.actualAmount || period.expectedAmount || 0,
            payment_start_date,
            employee_id: employeeId || null,
          })
          .eq('id', period.id)
          .select('id');
      });
      
      // Execute all updates in parallel
      existingPeriodsPromise = Promise.all(updatePromises)
        .then(results => {
          // Combine results from all updates
          const ids = results
            .filter(res => !res.error && res.data)
            .flatMap(res => res.data)
            .map((item: any) => item.id);
          
          return { data: ids.map((id: string) => ({ id })) };
        });
    }
    
    // Wait for all operations to complete in parallel
    const [installmentResult, newPeriodsResult, existingPeriodsResult] = await Promise.all([
      installmentPromise, 
      newPeriodsPromise, 
      existingPeriodsPromise
    ]);
    
    // Process results
    if (installmentResult.error) {
      console.error('Error getting installment details:', installmentResult.error);
    }
    
    // Collect all created/updated period IDs
    if (newPeriodsResult.data) {
      periodIds.push(...newPeriodsResult.data.map((item: any) => item.id));
    }
    
    if (existingPeriodsResult.data) {
      periodIds.push(...existingPeriodsResult.data.map((item: any) => item.id));
    }
    
    // Không tự động cập nhật trạng thái thành FINISHED khi tất cả kỳ được thanh toán
    // theo yêu cầu người dùng
    
    const endTime = performance.now();
    console.log(`bulkSaveInstallmentPayments: completed in ${endTime - startTime}ms for ${installmentId}`);
    
    return {
      data: {
        periodIds,
        count: periodIds.length
      },
      error: null
    };
  } catch (error) {
    logError('Error bulk saving installment payments', error);
    return {
      data: null,
      error
    };
  }
}

/**
 * Check if an installment has any paid periods
 */
export async function hasInstallmentAnyPayments(installmentId: string) {
  try {
    const { data, error, count } = await supabase
      .from('installment_history')
      .select('id', { count: 'exact' })
      .eq('installment_id', installmentId)
      .eq('transaction_type', 'payment')
      .eq('is_deleted', false)
    
    if (error) throw error;
    
    return {
      hasPaidPeriods: (count || 0) > 0,
      error: null
    };
  } catch (error) {
    logError('Error checking if installment has payments', error);
    return {
      hasPaidPeriods: false,
      error
    };
  }
}

/**
 * Count overdue installment payments for notifications
 */
export async function countOverdueInstallments(storeId?: string) {
  try {
    // Get the current date in ISO format
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from('installments_by_store')
      .select('id, payment_due_date')
      .eq('store_id', storeId || '')
      .lte('payment_due_date', today.toISOString())
      .eq('status', 'on_time');
    
    return {
      count: data?.length || 0,
      error: null
    };
  } catch (error) {
    logError('Error counting overdue installments', error);
    return {
      count: 0,
      error
    };
  }
}

/**
 * Reset debt amount to 0 when closing a contract
 */
export async function resetInstallmentDebtAmount(installmentId: string) {
  try {
    // Update debt amount to 0 in database
    const { error: updateError } = await supabase
      .from('installments')
      .update({ 
        debt_amount: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', installmentId);

    if (updateError) {
      throw updateError;
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error resetting debt amount:', error);
    return { success: false, error };
  }
} 