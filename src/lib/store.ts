import { supabase } from './supabase';
import { Store, StoreFormData } from '@/models/store';

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
