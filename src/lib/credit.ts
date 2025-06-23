import { getCurrentUser } from './auth';
import { calculateActualLoanAmount } from './Credits/calculate_actual_loan_amount';
import { supabase } from './supabase';
import { 
  Credit, 
  CreditWithCustomer, 
  CreateCreditParams, 
  UpdateCreditParams,
  CreditStatus 
} from '@/models/credit';

// Unified filter interface
export interface CreditFilters {
  contract_code?: string;
  customer_name?: string;
  start_date?: string;
  end_date?: string;
  status?: CreditStatus | "all";
  store_id?: string;
  duration?: number;
}

// Narrow set of statuses that actually exist in DB enum
type DbCreditStatus =
  | CreditStatus.ON_TIME
  | CreditStatus.OVERDUE
  | CreditStatus.LATE_INTEREST
  | CreditStatus.BAD_DEBT
  | CreditStatus.CLOSED
  | CreditStatus.DELETED;

const dbStatuses: DbCreditStatus[] = [
  CreditStatus.ON_TIME,
  CreditStatus.OVERDUE,
  CreditStatus.LATE_INTEREST,
  CreditStatus.BAD_DEBT,
  CreditStatus.CLOSED,
  CreditStatus.DELETED,
];

function isDbCreditStatus(status: CreditStatus): status is DbCreditStatus {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return dbStatuses.includes(status);
}

/**
 * Lấy danh sách hợp đồng tín chấp có phân trang và tìm kiếm
 */
export async function getCredits(
  page = 1,
  limit = 10,
  filters?: CreditFilters,
  signal?: AbortSignal
) {
  try {
    // Bắt đầu từ record thứ mấy
    const from = (page - 1) * limit;
    
    // Tạo query cơ bản với join bảng customers để lấy thông tin khách hàng
    let query = supabase
      .from('credits')
      .select(`
        *,
        customer:customers(name, phone, id_number, blacklist_reason)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });
    
    // Set AbortController signal
    if (signal) {
      query = query.abortSignal(signal);
    }
    
    // Áp dụng các filter nếu có
    if (filters) {
      if (filters.contract_code) {
        query = query.ilike('contract_code', `%${filters.contract_code}%`);
      }
      
      if (filters?.customer_name) {
        // Handle search with customer name support (similar to installments)
        const queryWithoutCustomerFilter = query;
        
        // Get all customer IDs whose names match the filter
        const { data: matchingCustomers } = await supabase
          .from('customers')
          .select('id')
          .ilike('name', `%${filters.customer_name}%`);
        
        if (matchingCustomers && matchingCustomers.length > 0) {
          // Extract customer IDs
          const customerIds = matchingCustomers.map(c => c.id);
          // Apply in filter to original query
          query = queryWithoutCustomerFilter.in('customer_id', customerIds);
        } else {
          // No matching customers, return empty result
          query = queryWithoutCustomerFilter.eq('id', '00000000-0000-0000-0000-000000000000'); // Non-existent ID
        }
      }
      
      
      if (filters.start_date) {
        query = query.gte('loan_date', filters.start_date);
      }
      
      if (filters.end_date) {
        query = query.lte('loan_date', filters.end_date);
      }
      
      if (filters.status && filters.status !== 'all' && isDbCreditStatus(filters.status)) {
        query = query.eq('status', filters.status);
      }
      
      if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
      }

      if (filters.duration) {
        query = query.eq('loan_period', filters.duration);
      }
    }
    
    // Thực hiện query với phân trang
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    
    if (error) throw error;
    
    return {
      data: data as CreditWithCustomer[],
      total: count || 0,
      page,
      limit,
      error: null
    };
  } catch (error) {
    // Don't log cancelled requests
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        data: [],
        total: 0,
        page,
        limit,
        error: null
      };
    }
    
    console.error('Error fetching credits:', error);
    return {
      data: [],
      total: 0,
      page,
      limit,
      error
    };
  }
}

/**
 * Legacy function for backward compatibility
 */
export async function getCreditsLegacy(
  page = 1,
  limit = 10,
  searchQuery = '',
  storeId = '',
  status = ''
) {
  const filters: CreditFilters = {};
  
  if (searchQuery) {
    // Try to determine if it's a contract code or customer name
    if (searchQuery.match(/^[A-Z0-9-]+$/i)) {
      filters.contract_code = searchQuery;
    } else {
      filters.customer_name = searchQuery;
    }
  }
  
  if (storeId) {
    filters.store_id = storeId;
  }
  
  if (status) {
    filters.status = status as CreditStatus;
  }
  
  return getCredits(page, limit, filters);
}

/**
 * Lấy thông tin chi tiết hợp đồng tín chấp theo ID
 */
export async function getCreditById(id: string) {
  try {
    const { data, error } = await supabase
      .from('credits')
      .select(`
        *,
        customer:customers(name, phone, id_number, blacklist_reason)
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return { data: null, error: { message: 'Không tìm thấy hợp đồng' } };
    }
    
    return { data: data as CreditWithCustomer, error: null };
  } catch (error) {
    console.error('Error fetching credit:', error);
    return { data: null, error };
  }
}

/**
 * Tạo hợp đồng tín chấp mới
 */
export async function createCredit(params: CreateCreditParams) {
  try {
    const userId = (await getCurrentUser())?.id;
    // Chuyển đổi Date object thành string nếu cần
    const loanDate = params.loan_date instanceof Date 
      ? params.loan_date.toISOString() 
      : params.loan_date;
    
    // Tạo credit record
    const { data, error } = await supabase
      .from('credits')
      .insert({
        store_id: params.store_id,
        customer_id: params.customer_id,
        contract_code: params.contract_code,
        id_number: params.id_number,
        phone: params.phone,
        address: params.address,
        collateral: params.collateral,
        loan_amount: params.loan_amount,
        interest_type: params.interest_type,
        interest_value: params.interest_value,
        interest_ui_type: params.interest_ui_type,
        interest_notation: params.interest_notation,
        loan_period: params.loan_period,
        interest_period: params.interest_period,
        loan_date: loanDate,
        notes: params.notes,
        status: (params.status || CreditStatus.ON_TIME) as NonNullable<Credit['status']>
      } as any)
      .select(`
        *,
        customer:customers(name, phone, id_number, blacklist_reason)
      `)
      .single();
    
    if (error) throw error;
    
    // Insert into credit_history
    const { error: creditHistoryError } = await supabase
      .from('credit_history')
      .insert({
        credit_id: data.id,
        transaction_type: 'initial_loan',
        debit_amount: params.loan_amount,
        description: 'Khoản vay ban đầu',
        created_by: userId
      })
      .select()
      .single();

    if (creditHistoryError) throw creditHistoryError;
    
    return { data: data as CreditWithCustomer, error: null };
  } catch (error) {
    console.error('Error creating credit:', error);
    return { data: null, error };
  }
}

/**
 * Cập nhật thông tin hợp đồng tín chấp
 */
export async function updateCredit(id: string, params: UpdateCreditParams) {
  try {

    const { data: currentData, error: fetchError } = await supabase
      .from('credits')
      .select('loan_amount')
      .eq('id', id)
      .single();
      
    if (fetchError) {
      throw fetchError;
    }
    const updateData: Record<string, any> = {};
    
    // Chỉ cập nhật các trường được cung cấp
    if (params.store_id !== undefined) updateData.store_id = params.store_id;
    if (params.customer_id !== undefined) updateData.customer_id = params.customer_id;
    if (params.contract_code !== undefined) updateData.contract_code = params.contract_code;
    if (params.id_number !== undefined) updateData.id_number = params.id_number;
    if (params.phone !== undefined) updateData.phone = params.phone;
    if (params.address !== undefined) updateData.address = params.address;
    if (params.collateral !== undefined) updateData.collateral = params.collateral;
    if (params.loan_amount !== undefined) updateData.loan_amount = params.loan_amount;
    if (params.interest_type !== undefined) updateData.interest_type = params.interest_type;
    if (params.interest_value !== undefined) updateData.interest_value = params.interest_value;
    if (params.interest_ui_type !== undefined) updateData.interest_ui_type = params.interest_ui_type;
    if (params.interest_notation !== undefined) updateData.interest_notation = params.interest_notation;
    if (params.loan_period !== undefined) updateData.loan_period = params.loan_period;
    if (params.interest_period !== undefined) updateData.interest_period = params.interest_period;
    if (params.debt_amount !== undefined) updateData.debt_amount = params.debt_amount;
    if (params.loan_date !== undefined) {
      updateData.loan_date = params.loan_date instanceof Date 
        ? params.loan_date.toISOString() 
        : params.loan_date;
    }
    if (params.notes !== undefined) updateData.notes = params.notes;
    if (params.status !== undefined) updateData.status = params.status as NonNullable<Credit['status']>;
    
    // Tự động cập nhật thời gian sửa đổi
    updateData.updated_at = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('credits')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        customer:customers(name, phone, id_number)
      `)
      .single();
    
    // Cập nhật lịch sử thanh toán
    const { data: paymentData, error: paymentError } = await supabase
      .from('credit_history')
      .insert({
        credit_id: id,
        transaction_type: 'update_contract',
        credit_amount: currentData.loan_amount,
        debit_amount: params.loan_amount,
        description: `Cập nhật hợp đồng`,
        is_deleted: false,
        created_at: new Date().toISOString()
      })
      .select()
    
    if (error) throw error;
    
    return { data: data as CreditWithCustomer, error: null };
  } catch (error) {
    console.error('Error updating credit:', error);
    return { data: null, error };
  }
}

/**
 * Đánh dấu hợp đồng đã đóng (kết thúc)
 */
export async function closeCredit(id: string) {
  try {
    const { data, error } = await supabase
      .from('credits')
      .update({
        status: CreditStatus.CLOSED,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    return { data: data as Credit, error: null };
  } catch (error) {
    console.error('Error closing credit:', error);
    return { data: null, error };
  }
}

/**
 * Đánh dấu hợp đồng quá hạn
 */
export async function markCreditAsOverdue(id: string) {
  try {
    const { data, error } = await supabase
      .from('credits')
      .update({
        status: CreditStatus.OVERDUE,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    return { data: data as Credit, error: null };
  } catch (error) {
    console.error('Error marking credit as overdue:', error);
    return { data: null, error };
  }
}

/**
 * Xoá hợp đồng (chỉ khi chưa có kỳ thanh toán nào)
 */
export async function deleteCredit(id: string) {
  try {
    // Kiểm tra xem hợp đồng có kỳ thanh toán nào không
    const { data: paymentPeriods, error: paymentError } = await supabase
      .from('credit_history')
      .select('id')
      .eq('transaction_type', 'payment')
      .eq('is_deleted', false)
      .eq('credit_id', id)
      .limit(1);
    
    if (paymentError) throw paymentError;
    
    // Nếu có kỳ thanh toán, không cho phép xóa
    if (paymentPeriods && paymentPeriods.length > 0) {
      return { 
        data: null, 
        error: { message: 'Không thể xóa hợp đồng đã có kỳ thanh toán' } 
      };
    }
    
    // Lấy thông tin hợp đồng để ghi lịch sử
    const { data: creditData, error: creditError } = await supabase
      .from('credits')
      .select('contract_code')
      .eq('id', id)
      .single();
    
    if (creditError) throw creditError;

    // Get actual loan amount
    const loan_amount = await calculateActualLoanAmount(id);
    
    // Ghi lịch sử xóa hợp đồng
    const { recordContractDeletion } = await import('@/lib/Credits/credit-amount-history');
    await recordContractDeletion(
      id,
      loan_amount,
      `Xóa hợp đồng ${creditData.contract_code || id}`
    );
    
    // Cập nhật trạng thái hợp đồng thành DELETED
    const { data, error } = await supabase
      .from('credits')
      .update({
        status: CreditStatus.DELETED,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    return { data: data as Credit, error: null };
  } catch (error) {
    console.error('Error deleting credit:', error);
    return { data: null, error };
  }
}

/**
 * Tính toán lãi và số tiền phải trả theo thời gian
 * @param credit Thông tin hợp đồng
 * @param currentDate Ngày hiện tại để tính (mặc định là ngày hôm nay)
 */
export function calculateCreditInterest(credit: Credit, currentDate = new Date()) {
  try {
    // Chuyển loan_date từ string sang Date object
    const loanDate = new Date(credit.loan_date);
    
    // Tính số ngày đã vay
    const diffTime = currentDate.getTime() - loanDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Nếu số ngày âm hoặc 0 thì chưa có lãi
    if (diffDays <= 0) {
      return {
        daysElapsed: 0,
        interestAmount: 0,
        totalAmount: credit.loan_amount,
        interestPeriods: 0,
        error: null
      };
    }
    
    // Tính số kỳ lãi đã trải qua
    const interestPeriods = Math.ceil(credit.loan_period / credit.interest_period);
    
    // Tính lãi phải trả
    let interestAmount = 0;
    if (credit.interest_type === 'percentage') {
      // Lãi suất theo phần trăm
      // Công thức mới: loan_amount * (interest_value / 100) * diffDays
      interestAmount = credit.loan_amount * (credit.interest_value / 100) * credit.loan_period;
    } else {
      // Lãi suất theo số tiền cố định
      interestAmount = credit.interest_value * interestPeriods;
    }
    
    // Tổng số tiền phải trả
    const totalAmount = credit.loan_amount + interestAmount;
    
    return {
      daysElapsed: diffDays,
      interestAmount,
      totalAmount,
      interestPeriods,
      error: null
    };
  } catch (error) {
    console.error('Error calculating credit interest:', error);
    return {
      daysElapsed: 0,
      interestAmount: 0,
      totalAmount: 0,
      interestPeriods: 0,
      error
    };
  }
}

export async function hasCreditAnyPayments(id: string) {
  const { data, error } = await supabase
    .from('credit_history')
    .select('id')
    .eq('is_deleted', false)
    .eq('transaction_type', 'payment')
    .eq('credit_id', id)
    .limit(1);
    if (error) throw error;
    return {
      hasPaidPeriods: data && data.length > 0,
      error: null
    };
}


/**
 * Cập nhật trạng thái của hợp đồng tín chấp
 */
export async function updateCreditStatus(id: string, status: CreditStatus) {
  const { data, error } = await supabase
    .from('credits')
    .update({ status: (isDbCreditStatus(status) ? status : CreditStatus.ON_TIME) as DbCreditStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
    if (error) throw error;
    return { data: data as Credit, error: null };
}