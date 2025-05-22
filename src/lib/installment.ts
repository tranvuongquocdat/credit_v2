import { supabase } from './supabase';
import { CreateInstallmentParams, Installment, InstallmentFilters, InstallmentStatus, InstallmentWithCustomer } from '@/models/installment';
import { Customer } from '@/models/customer';
import { format, addDays } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

// Get all installments with pagination and filters
export async function getInstallments(
  page = 1,
  pageSize = 10,
  filters?: InstallmentFilters
) {
  try {
    // Use the installments_by_store view to include store_id
    let query = supabase
      .from('installments_by_store')
      .select(`
        *,
        customer:customers(
          id, name, phone, address
        )
      `, { count: 'exact' });
    
    // Apply filters if provided
    if (filters?.contract_code) {
      query = query.ilike('contract_code', `%${filters.contract_code}%`);
    }
    
    if (filters?.customer_name) {
      query = query.textSearch('customer.name', filters.customer_name);
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
    
    if (filters?.status && filters.status !== 'all') {
      // Convert enum value to string for the database query
      query = query.eq('status', filters.status as "on_time" | "overdue" | "late_interest" | "bad_debt" | "closed" | "deleted");
    }
    
    if (filters?.store_id) {
      query = query.eq('store_id', filters.store_id);
    }
    
    // Calculate pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    // Execute query
    const { data, error, count } = await query
      .range(from, to)
      .order('created_at', { ascending: false });
      
    if (error) {
      throw error;
    }
    
    // Transform data to match UI requirements
    const installments = (data || []).map(item => {
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
      } as Customer : undefined;
      
      return {
        id: item.id || '',
        contract_code: item.contract_code || '',
        customer_id: item.customer_id || '',
        employee_id: item.employee_id || '',
        amount_given: downPayment,
        interest_rate: calculateInterestRate(downPayment, installmentAmount, loanPeriod),
        duration: loanPeriod,
        payment_period: paymentPeriod,
        amount_paid: 0, // This will need to be calculated from payment records
        old_debt: 0, // This will need to be calculated or tracked separately
        daily_amount: installmentAmount / paymentPeriod,
        remaining_amount: downPayment,
        status: item.status as InstallmentStatus,
        due_date: calculateDueDate(loanDate, loanPeriod),
        start_date: new Date(loanDate).toISOString().split('T')[0],
        store_id: item.store_id || '',
        created_at: item.created_at || undefined,
        updated_at: item.updated_at || undefined,
        notes: item.notes || '',
        customer: customerData
      };
    }) as InstallmentWithCustomer[];
    
    // Calculate total pages
    const totalPages = Math.ceil((count || 0) / pageSize);
    
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

// Helper function to calculate interest rate from down_payment and installment_amount
function calculateInterestRate(downPayment: number, installmentAmount: number, loanPeriod: number): number {
  // Công thức: (installmentAmount - downPayment) / downPayment * 100%
  // Ví dụ: khách đưa 10,000,000 VND, phải trả lại 12,000,000 VND
  // Lãi suất = ((12,000,000 - 10,000,000) / 10,000,000) * 100% = 20%
  const rate = Math.round(((installmentAmount - downPayment) / downPayment) * 100 * 100) / 100;
  return isNaN(rate) || !isFinite(rate) ? 0 : rate;
}

// Helper function to calculate due date
function calculateDueDate(loanDate: string, loanPeriod: number): string {
  try {
    const date = new Date(loanDate);
    date.setDate(date.getDate() + loanPeriod);
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
          id, name, phone, address
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
    } as Customer : undefined;
    
    // Transform data to match UI requirements
    const installment: InstallmentWithCustomer = {
      id: data.id || '',
      contract_code: data.contract_code || '',
      customer_id: data.customer_id || '',
      employee_id: data.employee_id || '',
      amount_given: downPayment,
      interest_rate: calculateInterestRate(downPayment, installmentAmount, loanPeriod),
      duration: loanPeriod,
      payment_period: paymentPeriod,
      amount_paid: 0, // This will need to be calculated from payment records
      old_debt: 0, // This will need to be calculated or tracked separately
      daily_amount: installmentAmount / paymentPeriod,
      remaining_amount: downPayment,
      status: data.status as InstallmentStatus,
      due_date: calculateDueDate(loanDate, loanPeriod),
      start_date: new Date(loanDate).toISOString().split('T')[0],
      
      // Direct DB field references
      down_payment: downPayment,
      installment_amount: installmentAmount,
      loan_period: loanPeriod,
      loan_date: loanDate,
      
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

// Create a new installment
export async function createInstallment(installment: CreateInstallmentParams) {
  try {
    // Import recordContractCreation and updateStoreCashFund
    const { recordContractCreation } = await import('./installmentAmountHistory');
    const { updateStoreCashFund } = await import('./store');
    
    // Get employee info to find store_id
    let storeId = '1'; // Default store_id
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
    
    // Ensure values are not null
    const downPayment = data.down_payment || 0;
    const installmentAmount = data.installment_amount || 0;
    const loanPeriod = data.loan_period || 0;
    const paymentPeriod = data.payment_period || 30;
    const loanDate = data.loan_date || new Date().toISOString();
    
    // Deduct down payment from store's cash fund
    try {
      // Negative amount to subtract from cash fund
      const { success, error: fundError } = await updateStoreCashFund(storeId, -downPayment);
      if (!success) {
        console.error('Error updating store cash fund:', fundError);
        // Continue anyway
      }
    } catch (fundError) {
      console.error('Error updating store cash fund:', fundError);
      // Continue anyway
    }
    
    // Transform result to match UI requirements
    const result: Installment = {
      id: data.id || '',
      contract_code: data.contract_code || '',
      customer_id: data.customer_id || '',
      employee_id: data.employee_id || '',
      
      // UI-specific mappings
      amount_given: downPayment,
      interest_rate: calculateInterestRate(downPayment, installmentAmount, loanPeriod),
      duration: loanPeriod,
      payment_period: paymentPeriod,
      amount_paid: 0,
      old_debt: 0,
      daily_amount: installmentAmount / paymentPeriod,
      remaining_amount: downPayment,
      status: data.status as InstallmentStatus,
      due_date: calculateDueDate(loanDate, loanPeriod),
      start_date: new Date(loanDate).toISOString().split('T')[0],
      
      // Direct DB field references
      down_payment: downPayment,
      installment_amount: installmentAmount,
      loan_period: loanPeriod,
      loan_date: loanDate,
      
      notes: data.notes || '',
      created_at: data.created_at || undefined,
      updated_at: data.updated_at || undefined
    };
    
    // Record history
    try {
      await recordContractCreation(data.id, data.employee_id, downPayment);
    } catch (historyError) {
      console.error('Error recording contract creation history:', historyError);
      // Continue anyway
    }
    
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
    
    if (installment.amount_given !== undefined) {
      dbInstallment.down_payment = installment.amount_given;
      
      // Recalculate installment_amount if interest_rate is also provided
      if (installment.interest_rate !== undefined) {
        dbInstallment.installment_amount = calculateInstallmentAmount(
          installment.amount_given,
          installment.interest_rate,
          installment.duration || currentData.loan_period
        );
      }
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
    
    if (installment.notes !== undefined) {
      dbInstallment.notes = installment.notes;
    }
    
    if (installment.status !== undefined) {
      dbInstallment.status = installment.status.toString() as any;
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
      interest_rate: installment.interest_rate !== undefined ? 
        installment.interest_rate : 
        calculateInterestRate(downPayment, installmentAmount, loanPeriod),
      duration: loanPeriod,
      payment_period: paymentPeriod,
      amount_paid: installment.amount_paid || 0,
      old_debt: installment.old_debt || 0,
      daily_amount: installmentAmount / paymentPeriod,
      remaining_amount: downPayment - (installment.amount_paid || 0),
      status: data.status as InstallmentStatus,
      due_date: calculateDueDate(loanDate, loanPeriod),
      start_date: new Date(loanDate).toISOString().split('T')[0],
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
      } else if (installment.interest_rate !== undefined) {
        description = `Cập nhật lãi suất: ${installment.interest_rate}%`;
      } else if (installment.duration !== undefined) {
        description = `Cập nhật thời hạn: ${installment.duration} ngày`;
      }
      
      await recordContractUpdate(data.id, data.employee_id, description);
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
      interest_rate: calculateInterestRate(downPayment, installmentAmount, loanPeriod),
      duration: loanPeriod,
      payment_period: paymentPeriod,
      amount_paid: 0, // This should be calculated from payment records
      old_debt: 0, // This should be calculated or tracked separately
      daily_amount: installmentAmount / paymentPeriod,
      remaining_amount: downPayment,
      status: data.status as InstallmentStatus,
      due_date: calculateDueDate(loanDate, loanPeriod),
      start_date: new Date(loanDate).toISOString().split('T')[0],
      notes: data.notes || '',
      created_at: data.created_at || undefined,
      updated_at: data.updated_at || undefined
    };
    
    // Record history based on status change
    try {
      if (status === InstallmentStatus.CLOSED) {
        await recordContractClosure(data.id, data.employee_id);
      } else if (status === InstallmentStatus.FINISHED) {
        await recordContractReopening(data.id, data.employee_id);
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

// Delete an installment (soft delete by changing status)
export async function deleteInstallment(id: string) {
  try {
    const { error } = await supabase
      .from('installments')
      .update({ status: InstallmentStatus.DELETED.toString() as any })
      .eq('id', id);
      
    if (error) {
      throw error;
    }
    
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
