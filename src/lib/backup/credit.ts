import { supabase } from './supabase';
import { 
  Credit, 
  CreditWithCustomer, 
  CreateCreditParams, 
  UpdateCreditParams,
  CreditStatus 
} from '@/models/credit';

/**
 * Lấy danh sách hợp đồng tín chấp có phân trang và tìm kiếm
 */
export async function getCredits(
  page = 1,
  limit = 10,
  searchQuery = '',
  storeId = '',
  status = ''
) {
  try {
    // Bắt đầu từ record thứ mấy
    const from = (page - 1) * limit;
    
    // Tạo query cơ bản với join bảng customers để lấy thông tin khách hàng
    let query = supabase
      .from('credits')
      .select(`
        *,
        customer:customers(name, phone, id_number)
      `, { count: 'exact' });
    
    // Áp dụng các filter nếu có
    if (searchQuery) {
      query = query.or(`
        contract_code.ilike.%${searchQuery}%,
        id_number.ilike.%${searchQuery}%,
        phone.ilike.%${searchQuery}%,
        customers.name.ilike.%${searchQuery}%
      `);
    }
    
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    
    if (status) {
      query = query.eq('status', status);
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
 * Lấy thông tin chi tiết hợp đồng tín chấp theo ID
 */
export async function getCreditById(id: string) {
  try {
    const { data, error } = await supabase
      .from('credits')
      .select(`
        *,
        customer:customers(name, phone, id_number)
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
        loan_period: params.loan_period,
        interest_period: params.interest_period,
        loan_date: loanDate,
        notes: params.notes,
        status: params.status || CreditStatus.ON_TIME
      })
      .select(`
        *,
        customer:customers(name, phone, id_number)
      `)
      .single();
    
    if (error) throw error;
    
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
    if (params.loan_period !== undefined) updateData.loan_period = params.loan_period;
    if (params.interest_period !== undefined) updateData.interest_period = params.interest_period;
    if (params.loan_date !== undefined) {
      updateData.loan_date = params.loan_date instanceof Date 
        ? params.loan_date.toISOString() 
        : params.loan_date;
    }
    if (params.notes !== undefined) updateData.notes = params.notes;
    if (params.status !== undefined) updateData.status = params.status;
    
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
 * Xoá hợp đồng
 */
export async function deleteCredit(id: string) {
  try {
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
    const interestPeriods = Math.ceil(diffDays / credit.interest_period);
    
    // Tính lãi phải trả
    let interestAmount = 0;
    if (credit.interest_type === 'percentage') {
      // Lãi suất theo phần trăm
      interestAmount = (credit.loan_amount * credit.interest_value / 100) * interestPeriods;
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
