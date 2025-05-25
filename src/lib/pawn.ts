import { supabase } from './supabase';
import { 
  Pawn, 
  PawnWithCustomerAndCollateral, 
  CreatePawnParams, 
  UpdatePawnParams,
  PawnStatus 
} from '@/models/pawn';

/**
 * Lấy danh sách hợp đồng cầm đồ có phân trang và tìm kiếm
 */
export async function getPawns(
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
      .from('pawns')
      .select(`
        *,
        customer:customers(name, phone, id_number),
        collateral_asset:collaterals(id, name, code, default_amount, category, attr_01, attr_02, attr_03, attr_04, attr_05)
      `, { count: 'exact' });
    
    // Áp dụng các filter nếu có
    if (searchQuery) {
      // Manually construct the or filter with a simple syntax to avoid parsing issues
      const filter = 
        `contract_code.ilike.%${searchQuery}%,` +
        `id_number.ilike.%${searchQuery}%,` +
        `phone.ilike.%${searchQuery}%`;
      query = query.or(filter);
    }
    
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    
    if (status) {
      query = query.eq('status', status as PawnStatus);
    }
    
    // Thực hiện query với phân trang
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    
    if (error) throw error;
    
    return {
      data: data as PawnWithCustomerAndCollateral[],
      total: count || 0,
      page,
      limit,
      error: null
    };
  } catch (error) {
    console.error('Error fetching pawns:', error);
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
 * Lấy thông tin hợp đồng cầm đồ theo ID
 */
export async function getPawnById(id: string) {
  try {
    const { data, error } = await supabase
      .from('pawns')
      .select(`
        *,
        customer:customers(name, phone, id_number),
        collateral_asset:collaterals(id, name, code, default_amount, category, attr_01, attr_02, attr_03, attr_04, attr_05)
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    return { 
      data: data as PawnWithCustomerAndCollateral, 
      error: null 
    };
  } catch (error) {
    console.error('Error fetching pawn by ID:', error);
    return { data: null, error };
  }
}

/**
 * Tạo hợp đồng cầm đồ mới
 */
export async function createPawn(params: CreatePawnParams) {
  try {
    // Chuyển đổi Date object thành string nếu cần
    const loanDate = params.loan_date instanceof Date 
      ? params.loan_date.toISOString() 
      : params.loan_date;
    
    // Tạo pawn record
    const { data, error } = await supabase
      .from('pawns')
      .insert({
        store_id: params.store_id,
        customer_id: params.customer_id,
        contract_code: params.contract_code,
        id_number: params.id_number,
        phone: params.phone,
        address: params.address,
        collateral_id: params.collateral_id,
        collateral_detail: params.collateral_detail,
        loan_amount: params.loan_amount,
        interest_type: params.interest_type,
        interest_value: params.interest_value,
        interest_ui_type: params.interest_ui_type,
        interest_notation: params.interest_notation,
        loan_period: params.loan_period,
        interest_period: params.interest_period,
        loan_date: loanDate,
        notes: params.notes,
        status: params.status || PawnStatus.ON_TIME
      })
      .select(`
        *,
        customer:customers(name, phone, id_number),
        collateral_asset:collaterals(id, name, code, default_amount, category, attr_01, attr_02, attr_03, attr_04, attr_05)
      `)
      .single();
    
    if (error) throw error;
    
    return { data: data as PawnWithCustomerAndCollateral, error: null };
  } catch (error) {
    console.error('Error creating pawn:', error);
    return { data: null, error };
  }
}

/**
 * Cập nhật thông tin hợp đồng cầm đồ
 */
export async function updatePawn(id: string, params: UpdatePawnParams) {
  try {
    // Chuyển đổi Date object thành string nếu cần
    const loanDate = params.loan_date instanceof Date 
      ? params.loan_date.toISOString() 
      : params.loan_date;
    
    // Cập nhật pawn record
    const { data, error } = await supabase
      .from('pawns')
      .update({
        store_id: params.store_id,
        customer_id: params.customer_id,
        contract_code: params.contract_code,
        id_number: params.id_number,
        phone: params.phone,
        address: params.address,
        collateral_id: params.collateral_id,
        collateral_detail: params.collateral_detail,
        loan_amount: params.loan_amount,
        interest_type: params.interest_type,
        interest_value: params.interest_value,
        interest_ui_type: params.interest_ui_type,
        interest_notation: params.interest_notation,
        loan_period: params.loan_period,
        interest_period: params.interest_period,
        loan_date: loanDate,
        notes: params.notes,
        status: params.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        customer:customers(name, phone, id_number),
        collateral_asset:collaterals(id, name, code, default_amount, category, attr_01, attr_02, attr_03, attr_04, attr_05)
      `)
      .single();
    
    if (error) throw error;
    
    return { data: data as PawnWithCustomerAndCollateral, error: null };
  } catch (error) {
    console.error('Error updating pawn:', error);
    return { data: null, error };
  }
}

/**
 * Xóa hợp đồng cầm đồ (hoặc cập nhật trạng thái thành đã xóa)
 */
export async function deletePawn(id: string) {
  try {
    // Không xóa thật, chỉ cập nhật trạng thái thành DELETED
    const { data, error } = await supabase
      .from('pawns')
      .update({
        status: PawnStatus.DELETED,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error('Error deleting pawn:', error);
    return { data: null, error };
  }
}

/**
 * Lấy các hợp đồng cầm đồ của một khách hàng
 */
export async function getPawnsByCustomerId(customerId: string) {
  try {
    const { data, error } = await supabase
      .from('pawns')
      .select(`
        *,
        customer:customers(name, phone, id_number),
        collateral_asset:collaterals(id, name, code, default_amount, category, attr_01, attr_02, attr_03, attr_04, attr_05)
      `)
      .eq('customer_id', customerId)
      .eq('status', PawnStatus.ON_TIME)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return { 
      data: data as PawnWithCustomerAndCollateral[], 
      error: null 
    };
  } catch (error) {
    console.error('Error fetching customer pawns:', error);
    return { data: [], error };
  }
}

/**
 * Cập nhật trạng thái của hợp đồng cầm đồ
 */
export async function updatePawnStatus(id: string, status: PawnStatus) {
  try {
    const { data, error } = await supabase
      .from('pawns')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error('Error updating pawn status:', error);
    return { data: null, error };
  }
} 