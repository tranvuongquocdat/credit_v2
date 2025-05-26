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
    
    // Tạo query cơ bản với join customers
    let query = supabase
      .from('pawns')
      .select(`
        *,
        customers (
          name,
          phone,
          id_number
        )
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
    
    // Map the data to include customer information
    return {
      data: (data || []).map(pawn => ({
        ...pawn,
        customer: pawn.customers || { name: 'Unknown Customer', phone: null, id_number: null },
        collateral_asset: null
      })) as PawnWithCustomerAndCollateral[],
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
        customers (
          name,
          phone,
          id_number
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    // Map the data to include customer information
    const pawnWithRelations = {
      ...data,
      customer: data.customers || { name: 'Unknown Customer', phone: null, id_number: null },
      collateral_asset: null
    };
    
    return { 
      data: pawnWithRelations as PawnWithCustomerAndCollateral, 
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
    
    // Prepare insert data - only include fields that exist in database
    const insertData: any = {
      store_id: params.store_id,
      customer_id: params.customer_id,
      contract_code: params.contract_code,
      collateral_id: params.collateral_id,
      collateral_detail: params.collateral_detail,
      loan_amount: params.loan_amount,
      interest_type: params.interest_type,
      interest_value: params.interest_value,
      loan_period: params.loan_period,
      interest_period: params.interest_period,
      loan_date: loanDate,
      notes: params.notes,
      status: params.status || PawnStatus.ON_TIME
    };

    // Only add these fields if they are provided (for backward compatibility)
    if (params.interest_ui_type) {
      insertData.interest_ui_type = params.interest_ui_type;
    }
    if (params.interest_notation) {
      insertData.interest_notation = params.interest_notation;
    }

    // Tạo pawn record
    const { data, error } = await supabase
      .from('pawns')
      .insert(insertData)
      .select('*')
      .single();
    
    if (error) throw error;
    
    // Temporarily return basic pawn data without customer/collateral joins
    const pawnWithRelations = {
      ...data,
      customer: { name: 'Unknown Customer', phone: null, id_number: null },
      collateral_asset: null
    };
    
    return { data: pawnWithRelations as PawnWithCustomerAndCollateral, error: null };
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
    
    // Prepare update data - only include fields that exist in database
    const updateData: any = {
      store_id: params.store_id,
      customer_id: params.customer_id,
      contract_code: params.contract_code,
      collateral_id: params.collateral_id,
      collateral_detail: params.collateral_detail,
      loan_amount: params.loan_amount,
      interest_type: params.interest_type,
      interest_value: params.interest_value,
      loan_period: params.loan_period,
      interest_period: params.interest_period,
      loan_date: loanDate,
      notes: params.notes,
      status: params.status,
      updated_at: new Date().toISOString()
    };

    // Only add these fields if they are provided (for backward compatibility)
    if (params.interest_ui_type !== undefined) {
      updateData.interest_ui_type = params.interest_ui_type;
    }
    if (params.interest_notation !== undefined) {
      updateData.interest_notation = params.interest_notation;
    }

    // Cập nhật pawn record
    const { data, error } = await supabase
      .from('pawns')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();
    
    if (error) throw error;
    
    // Temporarily return basic pawn data without customer/collateral joins
    const pawnWithRelations = {
      ...data,
      customer: { name: 'Unknown Customer', phone: null, id_number: null },
      collateral_asset: null
    };
    
    return { data: pawnWithRelations as PawnWithCustomerAndCollateral, error: null };
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
      .select('*')
      .eq('customer_id', customerId)
      .eq('status', PawnStatus.ON_TIME)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Temporarily return basic pawn data without customer/collateral joins
    const pawnsWithRelations = (data || []).map(pawn => ({
      ...pawn,
      customer: { name: 'Unknown Customer', phone: null, id_number: null },
      collateral_asset: null
    }));
    
    return { 
      data: pawnsWithRelations as PawnWithCustomerAndCollateral[], 
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