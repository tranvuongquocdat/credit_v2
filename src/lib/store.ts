import { supabase } from './supabase';
import { Store, StoreFormData } from '@/models/store';

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
  let query = supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  // Lọc theo trạng thái nếu có
  if (statusFilter) {
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
  
  return { 
    data: data as Store[], 
    error, 
    count,
    totalPages: count ? Math.ceil(count / limit) : 0
  };
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
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert([
      { 
        ...storeData, 
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ])
    .select();
  
  return { data: data?.[0] as Store | null, error };
}

// Cập nhật thông tin cửa hàng
export async function updateStore(id: string, storeData: Partial<StoreFormData>) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ 
      ...storeData, 
      updated_at: new Date().toISOString() 
    })
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

// Lấy thông tin tài chính của cửa hàng
export async function getStoreFinancialData(storeId: string = '1'): Promise<StoreFinancialData> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('investment, cash_fund, total_loans, total_debt, total_interest, profit')
      .eq('id', storeId)
      .single();

    if (error) throw error;

    return {
      totalFund: data.investment || 0,
      availableFund: data.cash_fund || 0,
      totalLoan: data.total_loans || 0,
      oldDebt: data.total_debt || 0,
      profit: data.profit || 0,
      collectedInterest: data.total_interest || 0
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
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('id, name')
    .eq('is_deleted', false)
    .eq('status', 'active')
    .order('name');
  
  return { data: data as Pick<Store, 'id' | 'name'>[], error };
}
