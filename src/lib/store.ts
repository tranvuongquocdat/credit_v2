import { supabase } from './supabase';
import { Store, StoreFormData } from '@/models/store';
import { getCurrentUser } from './auth';

// Interface cho dữ liệu tài chính cửa hàng
export interface StoreFinancialData {
  totalFund: number;      // Tổng quỹ/vốn đầu tư
  totalLoan: number;      // Tổng cho vay
  profit: number;         // Lợi nhuận/lãi dự kiến
  availableFund: number;  // Quỹ khả dụng
  oldDebt: number;        // Nợ cũ/nợ xấu
  collectedInterest?: number; // Lãi đã thu
}

const TABLE_NAME = 'stores';

// Lấy danh sách cửa hàng
export async function getStores(
  page: number = 1,
  limit: number = 10,
  searchQuery: string = '',
  statusFilter: string = ''
) {
  try {
    // Đã import tĩnh ở đầu file – dùng trực tiếp để tận dụng cache của auth
    const currentUser = await getCurrentUser();
    
    if (!currentUser || !currentUser.id) {
      return { 
        data: [], 
        error: { message: 'Người dùng chưa đăng nhập' }, 
        count: 0,
        totalPages: 0
      };
    }

    const { id: userId, role } = currentUser;

    let query = supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact' })
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    // Áp dụng phân quyền theo role
    if (role === 'admin') {
      // Nếu là admin, chỉ lấy các store mà họ tạo (created_by = user_id)
      query = query.eq('created_by', userId);
    } else if (role === 'employee') {
      // Nếu là employee, lấy store mà họ thuộc về thông qua bảng employees
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('store_id')
        .eq('user_id', userId)
        .single();

      if (employeeError || !employeeData?.store_id) {
        return { 
          data: [], 
          error: { message: 'Không tìm thấy thông tin nhân viên hoặc cửa hàng' }, 
          count: 0,
          totalPages: 0
        };
      }

      // Lấy thông tin store mà employee thuộc về
      query = query.eq('id', employeeData.store_id);
    } else {
      // Các role khác không có quyền truy cập store
      return { 
        data: [], 
        error: { message: 'Không có quyền truy cập cửa hàng' }, 
        count: 0,
        totalPages: 0
      };
    }

    // Lọc theo trạng thái nếu có
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    // Tìm kiếm theo tên nếu có
    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    // Phân trang
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw error;
    }

    // Thay cash_fund (bị drift do Bug A) bằng RPC event-sourced. Parallel N
    // calls — N ≤ limit (mặc định 10) → ~400ms warm, chấp nhận được.
    const stores = (data || []) as Store[];
    const funds = await Promise.all(
      stores.map((s) =>
        (supabase as any)
          .rpc('calc_cash_fund_as_of', { p_store_id: s.id })
          .then((r: { data: unknown }) => Number(r.data) || 0)
      )
    );
    const storesWithFund: Store[] = stores.map((s, i) => ({
      ...s,
      cash_fund: funds[i],
    }));

    return {
      data: storesWithFund,
      error: null,
      count,
      totalPages: count ? Math.ceil(count / limit) : 0
    };

  } catch (error) {
    console.error('Error fetching stores:', error);
    return { 
      data: [], 
      error, 
      count: 0,
      totalPages: 0
    };
  }
}

// Lấy thông tin cửa hàng theo ID
export async function getStoreById(id: string) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single();
  
  return { data: data as Store | null, error };
}

// Tạo cửa hàng mới
export async function createStore(storeData: StoreFormData) {
  // Dùng hàm getCurrentUser đã import tĩnh
  const currentUser = await getCurrentUser();
  const userId = currentUser?.id;

  // Ensure required fields are not null
  const formattedData = {
    ...storeData,
    // Set required string fields to empty string if null
    name: storeData.name || '',
    address: storeData.address || '',
    phone: storeData.phone || '',
    is_deleted: false,
    created_at: new Date().toISOString(),
    created_by: userId
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(formattedData)
    .select();
  
  return { data: data?.[0] as Store | null, error };
}

// Cập nhật thông tin cửa hàng
export async function updateStore(id: string, storeData: Partial<StoreFormData>) {
  // Ensure nullable fields are properly handled
  const formattedData = {
    ...storeData,
    // Convert null to undefined for optional string fields
    address: storeData.address === null ? undefined : storeData.address,
    phone: storeData.phone === null ? undefined : storeData.phone,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(formattedData)
    .eq('id', id)
    .select();
  
  return { data: data?.[0] as Store | null, error };
}

// Xóa mềm cửa hàng
export async function deleteStore(id: string) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ 
      is_deleted: true,
      updated_at: new Date().toISOString() 
    })
    .eq('id', id);
  
  return { data, error };
}

// Lấy thông tin tài chính của cửa hàng (cash_fund event-sourced qua RPC).
export async function getStoreFinancialData(storeId: string = '1'): Promise<StoreFinancialData> {
  try {
    const [{ data, error }, { data: cashFundData }] = await Promise.all([
      supabase.from(TABLE_NAME).select('investment').eq('id', storeId).single(),
      (supabase as any).rpc('calc_cash_fund_as_of', { p_store_id: storeId }),
    ]);

    if (error) throw error;

    const storeData = data as unknown as { investment?: number };

    return {
      totalFund: storeData.investment ?? 0,
      availableFund: Number(cashFundData) || 0,
      totalLoan: 0,
      oldDebt: 0,
      profit: 0,
      collectedInterest: 0
    };
  } catch (error) {
    console.error('Error fetching store financial data:', error);
    
    // Trả về dữ liệu mẫu nếu có lỗi
    return {
      totalFund: 130750000,
      totalLoan: 105000000,
      profit: 25750000,
      availableFund: 25750000,
      oldDebt: 0,
      collectedInterest: 8240000
    };
  }
}

// Lấy tất cả cửa hàng (không phân trang) - sử dụng cho select options
export async function getAllActiveStores() {
  try {
    // Đã import tĩnh ở đầu file – dùng trực tiếp để tận dụng cache của auth
    const currentUser = await getCurrentUser();
    
    if (!currentUser || !currentUser.id) {
      return { data: [], error: { message: 'Người dùng chưa đăng nhập' } };
    }

    const { id: userId, role } = currentUser;

    let query = supabase
      .from(TABLE_NAME)
      .select('id, name')
      .eq('is_deleted', false)
      .eq('status', 'active');

    if (role === 'admin') {
      // Nếu là admin, lấy các store mà họ tạo (created_by = user_id)
      query = query.eq('created_by', userId);
    } else if (role === 'employee') {
      // Nếu là employee, lấy store mà họ thuộc về thông qua bảng employees
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('store_id')
        .eq('user_id', userId)
        .single();

      if (employeeError || !employeeData?.store_id) {
        return { data: [], error: { message: 'Không tìm thấy thông tin nhân viên hoặc cửa hàng' } };
      }

      // Lấy thông tin store mà employee thuộc về
      query = query.eq('id', employeeData.store_id);
    } else {
      // Các role khác không có quyền truy cập store
      return { data: [], error: { message: 'Không có quyền truy cập cửa hàng' } };
    }

    const { data, error } = await query.order('name');

    if (error) {
      throw error;
    }

    return { data: data as Pick<Store, 'id' | 'name'>[], error: null };

  } catch (error) {
    console.error('Error fetching stores:', error);
    return { data: [], error };
  }
}

// Các hàm updateStoreCashFund / updateStoreCashFundOnly / updateCashFundFromAllSources
// đã bị gỡ trong PR3. Lý do: hệ thống chuyển sang event-sourced — fund derive từ
// history tables qua RPC calc_cash_fund_as_of. Cột stores.cash_fund và bảng
// store_total_fund không còn tồn tại (xem migration 20260424150000_drop_cash_fund_legacy.sql).
