import { getCurrentUser } from './auth';
import { calculateActualLoanAmount } from './Pawns/calculate_actual_loan_amount';
import { supabase } from './supabase';
import { 
  Pawn, 
  PawnWithCustomerAndCollateral, 
  CreatePawnParams, 
  UpdatePawnParams,
  PawnStatus,
  PawnFilters 
} from '@/models/pawn';

/**
 * Lấy danh sách hợp đồng cầm đồ có phân trang và tìm kiếm
 */
export async function getPawns(
  page = 1,
  pageSize = 10,
  filters?: PawnFilters,
  signal?: AbortSignal
) {
  try {
    // Calculate pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    // Build base query using pawns_by_store view with customer join
    let query = supabase
      .from('pawns_by_store')
      .select(`
        *,
        customer:customers!inner(
          name,
          phone,
          id_number,
          blacklist_reason
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
    
    if (filters?.loan_period) {
      query = query.eq('loan_period', filters.loan_period);
    }
    
    // Filter by status using enhanced pawns_by_store view
    if (filters?.status && filters.status !== 'all') {
      switch (filters.status) {
        case 'overdue':
          query = query.eq('status_code', 'OVERDUE');
          break;
        case 'late_interest':
          query = query.eq('status_code', 'LATE_INTEREST');
          break;
        case 'on_time':
          query = query.in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST']);
          break;
        case 'closed':
          query = query.eq('status_code', 'CLOSED');
          break;
        case 'deleted':
          query = query.eq('status_code', 'DELETED');
          break;
        case 'bad_debt':
          query = query.eq('status_code', 'BAD_DEBT');
          break;
        case 'finished':
          query = query.eq('status_code', 'FINISHED');
          break;
        case 'due_tomorrow':
          // Server-side filtering using next_payment_date from pawns_by_store view
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD format
          query = query.eq('next_payment_date', tomorrowStr);
          break;
        default:
          // Fallback to original status field for backward compatibility
          if (filters.status === PawnStatus.ON_TIME) {
            query = query.eq('status_code', 'ON_TIME');
          } else if (filters.status === PawnStatus.CLOSED) {
            query = query.eq('status_code', 'CLOSED');
          } else if (filters.status === PawnStatus.DELETED) {
            query = query.eq('status_code', 'DELETED');
          } else if (filters.status === PawnStatus.BAD_DEBT) {
            query = query.eq('status_code', 'BAD_DEBT');
          } else {
            query = query.eq('status', filters.status as PawnStatus);
          }
          break;
      }
    }
    
    if (filters?.store_id) {
      query = query.eq('store_id', filters.store_id);
    }
    
    // Check if request was cancelled before executing query
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }
    
    // Execute query with pagination
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    
    if (error) {
      throw error;
    }
    
    // Check if request was cancelled after query
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }
    
    // Transform data to match UI requirements
    const pawnsWithRelations = (data || []).map(pawn => ({
      ...pawn,
      customer: pawn.customer || { name: 'Unknown Customer', phone: null, id_number: null },
      collateral_asset: null
    })) as PawnWithCustomerAndCollateral[];
    
    // Calculate total pages
    const totalPages = Math.ceil((count || 0) / pageSize);

    return {
      data: pawnsWithRelations,
      total: count || 0,
      page,
      pageSize,
      totalPages,
      error: null
    };
  } catch (error: any) {
    // Handle abort errors gracefully without logging
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        error: null
      };
    }
    
    console.error('Error fetching pawns:', error);
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
      error
    };
  }
}

/**
 * Backward compatibility wrapper for old getPawns signature
 * @deprecated Use getPawns with PawnFilters instead
 */
export async function getPawnsLegacy(
  page = 1,
  pageSize = 10,
  searchQuery = '',
  storeId = '',
  status = '',
  signal?: AbortSignal
) {
  const filters: PawnFilters = {};
  
  if (searchQuery) {
    filters.contract_code = searchQuery;
  }
  if (storeId) {
    filters.store_id = storeId;
  }
  if (status) {
    filters.status = status as PawnStatus;
  }
  
  return getPawns(page, pageSize, filters, signal);
}

/**
 * Lấy thông tin hợp đồng cầm đồ theo ID
 */
export async function getPawnById(id: string, signal?: AbortSignal) {
  try {
    const { data, error } = await supabase
      .from('pawns_by_store')
      .select(`
        *,
        customer:customers!inner(
          name,
          phone,
          id_number,
          blacklist_reason
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    // Check if request was cancelled
    if (signal?.aborted) {
      return { data: null, error: null };
    }
    
    // Map the data to include customer information
    const pawnWithRelations = {
      ...data,
      customer: data.customer || { name: 'Unknown Customer', phone: null, id_number: null },
    };
    
    return { 
      data: pawnWithRelations as PawnWithCustomerAndCollateral, 
      error: null 
    };
  } catch (error: any) {
    // Handle abort errors gracefully without logging
    if (error instanceof Error && error.name === 'AbortError') {
      return { data: null, error: null };
    }
    
    console.error('Error fetching pawn by ID:', error);
    return { data: null, error };
  }
}

export async function getPawnStatus(id: string) {
  const { data, error } = await supabase
    .from('pawns')
    .select('status')
    .eq('id', id)
    .single();
  if (error) {
    throw error;
  }
  return data?.status as PawnStatus;
}

/**
 * Tạo hợp đồng cầm đồ mới
 */
export async function createPawn(params: CreatePawnParams) {
  try {
    const userId = (await getCurrentUser())?.id;
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

    // Insert into pawn_history
    const { error: pawnHistoryError } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: data.id,
        transaction_type: 'initial_loan',
        debit_amount: data.loan_amount,
        description: 'Khoản vay ban đầu',
        created_by: userId
      })
      .select()
      .single();

    if (pawnHistoryError) throw pawnHistoryError;
    
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
    const { id: userId } = await getCurrentUser();
    // First, get the pawn data
    const { data: pawnData, error: pawnError } = await getPawnById(id);
    if (pawnError) throw pawnError;
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

    // Insert pawn history
    const { data: pawnHistoryData, error: pawnHistoryError } = await supabase
      .from('pawn_history')
      .insert({
        pawn_id: id,
        transaction_type: 'update_contract',
        credit_amount: pawnData?.loan_amount,
        debit_amount: updateData.loan_amount,
        description: `Cập nhật hợp đồng cầm đồ`,
        created_by: userId,
      })
    
    return { data: pawnWithRelations as PawnWithCustomerAndCollateral, error: null };
  } catch (error) {
    console.error('Error updating pawn:', error);
    return { data: null, error };
  }
}

/**
 * Xóa hợp đồng cầm đồ (chỉ khi chưa có kỳ thanh toán nào)
 */
export async function deletePawn(id: string) {
  try {
    // Skip payment period check since table doesn't exist yet
    // Check if pawn has any payment periods before allowing deletion
    const { data: paymentPeriods, error: paymentError } = await supabase
      .from('pawn_history')
      .select('id')
      .eq('is_deleted', false)
      .eq('transaction_type', 'payment')
      .eq('pawn_id', id)
      .limit(1);
    
    if (paymentError) throw paymentError;
    
    // If there are payment periods, don't allow deletion
    if (paymentPeriods && paymentPeriods.length > 0) {
      return { 
        success: false, 
        error: { message: 'Không thể xóa hợp đồng đã có kỳ thanh toán' } 
      };
    }
    
    // Lấy thông tin hợp đồng để ghi lịch sử
    const { data: pawnData, error: pawnError } = await supabase
      .from('pawns')
      .select('contract_code')
      .eq('id', id)
      .single();
    
    if (pawnError) throw pawnError;
    
    // Get actual loan amount
    const loan_amount = await calculateActualLoanAmount(id);

    // Ghi lịch sử xóa hợp đồng
    const { recordPawnContractDeletion } = await import('@/lib/pawn-amount-history');
    await recordPawnContractDeletion(
      id,
      loan_amount,
      `Xóa hợp đồng cầm đồ ${pawnData.contract_code || id}`
    );
    
    // Cập nhật trạng thái hợp đồng thành DELETED
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
export async function getPawnsByCustomerId(customerId: string, signal?: AbortSignal) {
  try {
    let query = supabase
      .from('pawns')
      .select('*')
      .eq('customer_id', customerId)
      .eq('status', PawnStatus.ON_TIME)
      .order('created_at', { ascending: false });
    
    if (signal) {
      query = query.abortSignal(signal);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Check if request was cancelled
    if (signal?.aborted) {
      return { data: [], error: null };
    }
    
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
  } catch (error: any) {
    // Handle abort errors gracefully without logging
    if (error instanceof Error && error.name === 'AbortError') {
      return { data: [], error: null };
    }
    
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


export async function hasPawnAnyPayments(id: string) {
  const { data, error } = await supabase
    .from('pawn_history')
    .select('id')
    .eq('is_deleted', false)
    .eq('transaction_type', 'payment')
    .eq('pawn_id', id)
    .limit(1);
    if (error) throw error;
    return {
      hasPaidPeriods: data && data.length > 0,
      error: null
    };
}