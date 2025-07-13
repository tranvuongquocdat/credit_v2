import { supabase } from './supabase';
import { CreateInstallmentParams, Installment, InstallmentFilters, InstallmentStatus, InstallmentWithCustomer } from '@/models/installment';
import { Customer } from '@/models/customer';
import { formatCurrency } from '@/lib/utils';
import { getCurrentUser } from './auth';
import { calculateDebtToLatestPaidPeriod } from './Installments/calculate_remaining_debt';

// Get all installments with pagination and filters
export async function getInstallments(
  page = 1,
  pageSize = 10,
  filters?: InstallmentFilters,
  signal?: AbortSignal
) {
  // Debug logging removed - race condition fixed with AbortController
  try {
    // Use the installments_by_store view to include store_id and status_code
    let query = supabase
      .from('installments_by_store')
      .select(`
        *,
        customer:customers!inner(
          id, name, phone, address, blacklist_reason, id_number
        )
      `, { count: 'exact' })
    
    // Apply filters if provided
    if (filters?.contract_code) {
      query = query.ilike('contract_code', `%${filters.contract_code}%`);
    }
    
    if (filters?.customer_name) {
      // Lọc trực tiếp trên cột name của bảng customers thông qua INNER JOIN
      query = query.ilike('customers.name', `%${filters.customer_name}%`);
    }
    
    if (filters?.start_date) {
      query = query.gte('loan_date', filters.start_date);
    }
    
    if (filters?.end_date) {
      query = query.lte('loan_date', filters.end_date);
    }
    
    if (filters?.duration) {
      query = query.eq('loan_period', filters.duration);
    }
    
    // Filter by status using the new status_code column from the view
    if (filters?.status) {
      switch (filters.status) {
        case InstallmentStatus.DUE_TOMORROW:
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const yyyy = tomorrow.getFullYear();
          const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
          const dd = String(tomorrow.getDate()).padStart(2, '0');
          const tomorrowStr = `${yyyy}-${mm}-${dd}`;
          query = query.eq('payment_due_date', tomorrowStr);
          break;
        case InstallmentStatus.OVERDUE:
          query = query.eq('status_code', 'OVERDUE');
          break;
        case InstallmentStatus.LATE_INTEREST:
          query = query.eq('status_code', 'LATE_INTEREST');
          break;
        case InstallmentStatus.ON_TIME:
          query = query.in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST']);
          break;
        case InstallmentStatus.CLOSED:
          query = query.eq('status_code', 'CLOSED');
          break;
        case InstallmentStatus.DELETED:
          query = query.eq('status_code', 'DELETED');
          break;
        case InstallmentStatus.BAD_DEBT:
          query = query.eq('status_code', 'BAD_DEBT');
          break;
        case InstallmentStatus.FINISHED:
          query = query.eq('status_code', 'FINISHED');
          break;
      }
    }
    
    if (filters?.store_id) {
      query = query.eq('store_id', filters.store_id);
    }
    
    // Calculate pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    // Check if request was cancelled
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }
    
    // Execute query (ensure ordering BEFORE pagination)
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id',          { ascending: false })
      .range(from, to);
      
    if (error) {
      throw error;
    }
    
    // Check if request was cancelled after query
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }
    // Ngay sau khi lấy biến `data` từ supabase
    const ids = (data ?? []).map((it: any) => it.id);

    // RPC 1 lần duy nhất
    const { data: debtRows, error: debtErr } = await (supabase.rpc as any)(
      'get_installment_old_debt',
      { p_installment_ids: ids }
    );
    if (debtErr) throw debtErr;

    const debtMap = new Map<string, number>();
    (debtRows ?? []).forEach(
      (r: { installment_id: string; old_debt: number }) =>
        debtMap.set(r.installment_id, Number(r.old_debt || 0))
    );

    // Get latest payment dates for all installments
    const { data: latestPaymentRows, error: latestPaymentErr } = await (supabase.rpc as any)(
      'get_latest_installment_payment_paid_dates',
      { p_installment_ids: ids }
    );
    if (latestPaymentErr) throw latestPaymentErr;

    const latestPaymentMap = new Map<string, string>();
    (latestPaymentRows ?? []).forEach(
      (r: { installment_id: string; latest_paid_date: string }) =>
        latestPaymentMap.set(r.installment_id, r.latest_paid_date)
    );
    // Transform data to match UI requirements
    const installmentPromises = (data || []).map(async (item: any) => {
      // Ensure values are not null
      const downPayment = item.down_payment || 0;
      const installmentAmount = item.installment_amount || 0;
      const loanPeriod = item.loan_period || 0;
      const paymentPeriod = item.payment_period || 30;
      const loanDate = item.loan_date || new Date().toISOString();
      
      // Convert customer data to Customer type or undefined
      const customerData = item.customer ? {
        id: item.customer.id || '',
        name: item.customer.name || '',
        phone: item.customer.phone || undefined,
        address: item.customer.address || undefined,
        blacklist_reason: item.customer.blacklist_reason || undefined,
        id_number: item.customer.id_number || undefined,
      } as Customer : undefined;
      
      return {
        id: item.id || '',
        contract_code: item.contract_code || '',
        customer_id: item.customer_id || '',
        employee_id: item.employee_id || '',
        amount_given: downPayment,
        duration: loanPeriod,
        payment_period: paymentPeriod,
        amount_paid: 0, // This will need to be calculated from payment records
        old_debt: debtMap.get(item.id) ?? 0, // Lấy trực tiếp từ DB thay vì tính toán
        daily_amount: installmentAmount / loanPeriod,
        installment_amount: installmentAmount,
        remaining_amount: downPayment,
        status: item.status_code as InstallmentStatus,
        due_date: calculateDueDate(loanDate, loanPeriod),
        start_date: new Date(loanDate).toISOString().split('T')[0],
        payment_due_date: item.payment_due_date || null,
        store_id: item.store_id || '',
        created_at: item.created_at || undefined,
        updated_at: item.updated_at || undefined,
        notes: item.notes || '',
        debt_amount: debtMap.get(item.id) ?? 0,
        latest_payment_date: latestPaymentMap.get(item.id) ?? null,
        customer: customerData
      };
    });
    
    const installments = await Promise.all(installmentPromises);
    
    // Calculate total pages
    const totalPages = Math.ceil((count || 0) / pageSize);
    
    // Debug logging removed - race condition fixed with AbortController
    
    return { 
      data: installments, 
      error: null, 
      count, 
      totalPages 
    };
  } catch (error: any) {
    console.error('Error fetching installments:', error);
    return { 
      data: [], 
      error, 
      count: 0, 
      totalPages: 0 
    };
  }
}

// Helper function to calculate due date
function calculateDueDate(loanDate: string, loanPeriod: number): string {
  try {
    const date = new Date(loanDate);
    date.setDate(date.getDate() + loanPeriod - 1);
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.error('Error calculating due date:', error);
    return new Date().toISOString().split('T')[0];
  }
}

// Get a single installment by ID
export async function getInstallmentById(id: string) {
  try {
    const { data, error } = await supabase
      .from('installments_by_store')
      .select(`
        *,
        customer:customers(
          id, name, phone, address, blacklist_reason
        )
      `)
      .eq('id', id)
      .single();
      
    if (error) {
      throw error;
    }
    
    if (!data) {
      throw new Error('Installment not found');
    }
    
    // Ensure values are not null
    const downPayment = data.down_payment || 0;
    const installmentAmount = data.installment_amount || 0;
    const loanPeriod = data.loan_period || 0;
    const paymentPeriod = data.payment_period || 30;
    const loanDate = data.loan_date || new Date().toISOString();
    
    // Convert customer data to Customer type or undefined
    const customerData = data.customer ? {
      id: data.customer.id || '',
      name: data.customer.name || '',
      phone: data.customer.phone || undefined,
      address: data.customer.address || undefined,
      blacklist_reason: data.customer.blacklist_reason || undefined,
    } as Customer : undefined;
    
    // ngay trước khi return
    const debtAmount = await calculateDebtToLatestPaidPeriod(data.id || '');
    
    // Transform data to match UI requirements
    const installment: InstallmentWithCustomer = {
      id: data.id || '',
      contract_code: data.contract_code || '',
      customer_id: data.customer_id || '',
      employee_id: data.employee_id || '',
      amount_given: downPayment,
      duration: loanPeriod,
      payment_period: paymentPeriod,
      amount_paid: 0, // This will need to be calculated from payment records
      old_debt: debtAmount, // Lấy trực tiếp từ DB
      daily_amount: installmentAmount / loanPeriod,
      remaining_amount: downPayment,
      status: data.status_code as InstallmentStatus,
      due_date: calculateDueDate(loanDate, loanPeriod),
      start_date: new Date(loanDate).toISOString().split('T')[0],
      
      // Direct DB field references
      down_payment: downPayment,
      installment_amount: installmentAmount,
      loan_period: loanPeriod,
      loan_date: loanDate,
      debt_amount: debtAmount,
      
      store_id: data.store_id || '',
      created_at: data.created_at || undefined,
      updated_at: data.updated_at || undefined,
      notes: data.notes || '',
      customer: customerData
    };
    
    return { 
      data: installment, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error fetching installment:', error);
    return { 
      data: null, 
      error 
    };
  }
}

export async function getInstallmentStatus(id: string) {
  const { data, error } = await supabase
    .from('installments')
    .select('status')
    .eq('id', id)
    .single();
  if (error) {
    throw error;
  }
  return data?.status as InstallmentStatus;
}

// Create a new installment
export async function createInstallment(installment: CreateInstallmentParams) {
  try {
    
    // Get employee info to find store_id
    let storeId = '1'; // Default store_id
    const userId = (await getCurrentUser())?.id;
    try {
      const { data: employeeData } = await supabase
        .from('employees')
        .select('store_id')
        .eq('id', installment.employee_id)
        .single();
      
      if (employeeData && employeeData.store_id) {
        storeId = employeeData.store_id;
      }
    } catch (err) {
      console.error('Error getting employee store_id:', err);
      // Continue with default store_id
    }

    // Convert UI model to database model
    const newInstallment = {
      customer_id: installment.customer_id,
      employee_id: installment.employee_id,
      contract_code: installment.contract_code,
      down_payment: installment.down_payment,
      installment_amount: installment.installment_amount,
      loan_period: installment.loan_period,
      payment_period: installment.payment_period,
      loan_date: installment.loan_date,
      payment_due_date: installment.payment_due_date,
      debt_amount: installment.debt_amount || 0, // Default 0
      notes: installment.notes || '',
      status: (installment.status || InstallmentStatus.ON_TIME).toString() as any
    };
    
    // Insert into database
    const { data, error } = await supabase
      .from('installments')
      .insert(newInstallment)
      .select()
      .single();
      
    if (error) {
      throw error;
    }

    
    if (!data) {
      throw new Error('Failed to create installment');
    }

    // Insert into installment_history
    const { data: installmentHistoryData, error: installmentHistoryError } = await supabase
      .from('installment_history')
      .insert({
        installment_id: data.id,
        debit_amount: data.down_payment,
        transaction_type: 'initial_loan',
        description: 'Khoản vay ban đầu',
        created_by: userId
      })
      .select()
      .single();

    if (installmentHistoryError) {
      throw installmentHistoryError;
    }
    
    // Ensure values are not null
    const downPayment = data.down_payment || 0;
    const installmentAmount = data.installment_amount || 0;
    const loanPeriod = data.loan_period || 0;
    const paymentPeriod = data.payment_period || 30;
    const loanDate = data.loan_date || new Date().toISOString();
    
    // REMOVED: Deduct down payment from store's cash fund - Việc cập nhật quỹ tiền mặt sẽ được thực hiện ở phía client
    
    // Transform result to match UI requirements
    const result: Installment = {
      id: data.id || '',
      contract_code: data.contract_code || '',
      customer_id: data.customer_id || '',
      employee_id: data.employee_id || '',
      
      // UI-specific mappings
      amount_given: downPayment,
      duration: loanPeriod,
      payment_period: paymentPeriod,
      amount_paid: 0,
      old_debt: data.debt_amount || 0,
      daily_amount: installmentAmount / loanPeriod,
      remaining_amount: downPayment,
      status: data.status as InstallmentStatus,
      due_date: calculateDueDate(loanDate, loanPeriod),
      start_date: new Date(loanDate).toISOString().split('T')[0],
      payment_due_date: data.payment_due_date || null,
      
      // Direct DB field references
      down_payment: downPayment,
      installment_amount: installmentAmount,
      loan_period: loanPeriod,
      loan_date: loanDate,
      debt_amount: data.debt_amount || 0,
      
      notes: data.notes || '',
      created_at: data.created_at || undefined,
      updated_at: data.updated_at || undefined
    };
    
    return { 
      data: result, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error creating installment:', error);
    return { 
      data: null, 
      error 
    };
  }
}

// Helper function to calculate installment amount from amount_given and interest_rate
function calculateInstallmentAmount(amountGiven: number, interestRate: number, duration: number): number {
  // Công thức: amountGiven * (1 + interestRate / 100)
  // Ví dụ: khách đưa 10,000,000 VND với lãi suất 20%
  // Tiền trả góp = 10,000,000 * (1 + 20/100) = 12,000,000 VND
  return amountGiven * (1 + interestRate / 100);
}

// Update an installment
export async function updateInstallment(id: string, installment: Partial<Installment>) {
  try {
    // Import recordContractUpdate
    const { recordContractUpdate } = await import('./installmentAmountHistory');
    
    // First get the current installment to have reference data
    const { data: currentData, error: fetchError } = await supabase
      .from('installments')
      .select('*')
      .eq('id', id)
      .single();
      
    if (fetchError) {
      throw fetchError;
    }
    
    if (!currentData) {
      throw new Error('Installment not found');
    }
    
    // Convert UI model to database model
    const dbInstallment: any = {};
    
    if (installment.contract_code !== undefined) {
      dbInstallment.contract_code = installment.contract_code;
    }
    
    if (installment.customer_id !== undefined) {
      dbInstallment.customer_id = installment.customer_id;
    }
    
    if (installment.employee_id !== undefined) {
      dbInstallment.employee_id = installment.employee_id;
    }
    
    if (installment.down_payment !== undefined) {
      dbInstallment.down_payment = installment.down_payment;
    }

    if (installment.installment_amount !== undefined) {
      dbInstallment.installment_amount = installment.installment_amount;
    }
    
    if (installment.duration !== undefined) {
      dbInstallment.loan_period = installment.duration;
    }
    
    if (installment.payment_period !== undefined) {
      dbInstallment.payment_period = installment.payment_period;
    }
    
    if (installment.start_date !== undefined) {
      dbInstallment.loan_date = installment.start_date;
    }
    
    if (installment.payment_due_date !== undefined) {
      dbInstallment.payment_due_date = installment.payment_due_date;
    }
    
    if (installment.notes !== undefined) {
      dbInstallment.notes = installment.notes;
    }
    
    if (installment.status !== undefined) {
      dbInstallment.status = installment.status.toString() as any;
    }

    if (installment.employee_id !== undefined) {
      dbInstallment.employee_id = installment.employee_id;
    }
    
    // Update the database record
    const { data, error } = await supabase
      .from('installments')
      .update(dbInstallment)
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      throw error;
    }
    
    if (!data) {
      throw new Error('Failed to update installment');
    }
    
    // Ensure values are not null
    const downPayment = data.down_payment || 0;
    const installmentAmount = data.installment_amount || 0;
    const loanPeriod = data.loan_period || 0;
    const paymentPeriod = data.payment_period || 30;
    const loanDate = data.loan_date || new Date().toISOString();
    
    // Transform result back to UI model
    const result: Installment = {
      id: data.id || '',
      contract_code: data.contract_code || '',
      customer_id: data.customer_id || '',
      employee_id: data.employee_id || '',
      amount_given: downPayment,
      duration: loanPeriod,
      payment_period: paymentPeriod,
      amount_paid: installment.amount_paid || 0,
      old_debt: installment.old_debt || 0,
      daily_amount: installmentAmount / loanPeriod,
      remaining_amount: downPayment - (installment.amount_paid || 0),
      status: data.status as InstallmentStatus,
      due_date: calculateDueDate(loanDate, loanPeriod),
      start_date: new Date(loanDate).toISOString().split('T')[0],
      payment_due_date: data.payment_due_date || null,
      notes: data.notes || '',
      store_id: installment.store_id,
      created_at: data.created_at || undefined,
      updated_at: data.updated_at || undefined
    };
    
    // Record history
    try {
      // Generate description based on what changed
      let description = 'Cập nhật hợp đồng';
      if (installment.amount_given !== undefined) {
        description = `Cập nhật tiền đưa khách: ${formatCurrency(installment.amount_given)}`;
      } else if (installment.duration !== undefined) {
        description = `Cập nhật thời hạn: ${installment.duration} ngày`;
      }
      
      await recordContractUpdate(data.id, downPayment, currentData.down_payment, description);
    } catch (historyError) {
      console.error('Error recording contract update history:', historyError);
      // Continue anyway
    }
    
    return { 
      data: result, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error updating installment:', error);
    return { 
      data: null, 
      error 
    };
  }
}

// Update installment status
export async function updateInstallmentStatus(id: string, status: InstallmentStatus) {
  try {
    // Import record functions
    const { 
      recordContractClosure, 
      recordContractReopening 
    } = await import('./installmentAmountHistory');

    const { data, error } = await supabase
      .from('installments')
      .update({ status: status.toString() as any })
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      throw error;
    }
    
    if (!data) {
      throw new Error('Failed to update installment status');
    }
    
    // Ensure values are not null
    const downPayment = data.down_payment || 0;
    const installmentAmount = data.installment_amount || 0;
    const loanPeriod = data.loan_period || 0;
    const paymentPeriod = data.payment_period || 30;
    const loanDate = data.loan_date || new Date().toISOString();
    
    // Transform result back to UI model
    const result: Installment = {
      id: data.id || '',
      contract_code: data.contract_code || '',
      customer_id: data.customer_id || '',
      employee_id: data.employee_id || '',
      amount_given: downPayment,
      duration: loanPeriod,
      payment_period: paymentPeriod,
      amount_paid: 0, // This should be calculated from payment records
      old_debt: 0, // This should be calculated or tracked separately
      daily_amount: installmentAmount / loanPeriod,
      remaining_amount: downPayment,
      status: data.status as InstallmentStatus,
      due_date: calculateDueDate(loanDate, loanPeriod),
      start_date: new Date(loanDate).toISOString().split('T')[0],
      payment_due_date: data.payment_due_date || null,
      notes: data.notes || '',
      created_at: data.created_at || undefined,
      updated_at: data.updated_at || undefined
    };
    
    // Record history based on status change
    try {
      if (status === InstallmentStatus.CLOSED) {
        await recordContractClosure(data.id);
      } else if (status === InstallmentStatus.FINISHED) {
        await recordContractReopening(data.id);
      }
    } catch (historyError) {
      console.error('Error recording status update history:', historyError);
      // Continue anyway
    }
    
    return { 
      data: result, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error updating installment status:', error);
    return { 
      data: null, 
      error 
    };
  }
}

// Delete an installment (only if no payment periods exist)
export async function deleteInstallment(id: string) {
  try {
    // Check if installment has any payment periods
    const { data: paymentPeriods, error: paymentError } = await supabase
      .from('installment_history')
      .select('id')
      .eq('is_deleted', false)
      .eq('transaction_type', 'payment')
      .eq('installment_id', id)
      .limit(1);
    
    if (paymentError) throw paymentError;
    
    // If there are payment periods, don't allow deletion
    if (paymentPeriods && paymentPeriods.length > 0) {
      return { 
        success: false, 
        error: { message: 'Không thể xóa hợp đồng đã có kỳ thanh toán' } 
      };
    }
    
    // Get installment data for history logging
    const { data: installmentData, error: installmentError } = await supabase
      .from('installments')
      .select('down_payment, contract_code')
      .eq('id', id)
      .single();
    
    if (installmentError) throw installmentError;
    
    // Record deletion history
    const { recordInstallmentContractDeletion } = await import('@/lib/installmentAmountHistory');
    await recordInstallmentContractDeletion(
      id,
      installmentData.down_payment,
      `Xóa hợp đồng trả góp ${installmentData.contract_code || id}`
    );
    
    // Update status to DELETED instead of hard delete
    const { error } = await supabase
      .from('installments')
      .update({ status: InstallmentStatus.DELETED.toString() as any, updated_at: new Date().toISOString() })
      .eq('id', id);
      
    if (error) throw error;
    
    return { 
      success: true, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error deleting installment:', error);
    return { 
      success: false, 
      error 
    };
  }
}

// Hard delete an installment (only for admin purposes)
export async function hardDeleteInstallment(id: string) {
  try {
    const { error } = await supabase
      .from('installments')
      .delete()
      .eq('id', id);
      
    if (error) {
      throw error;
    }
    
    return { 
      success: true, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error hard deleting installment:', error);
    return { 
      success: false, 
      error 
    };
  }
}

// Update installment payment due date
export async function updateInstallmentPaymentDueDate(id: string, paymentDueDate: string | null) {
  try {
    const { data, error } = await supabase
      .from('installments')
      .update({ 
        payment_due_date: paymentDueDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      throw error;
    }
    
    if (!data) {
      throw new Error('Failed to update payment due date');
    }
    
    // Return the updated installment with simplified data
    return { 
      data: {
        id: data.id,
        payment_due_date: data.payment_due_date
      }, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error updating payment due date:', error);
    return { 
      data: null, 
      error 
    };
  }
}
