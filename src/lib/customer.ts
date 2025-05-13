import { supabase } from './supabase';
import { Customer, CreateCustomerParams, UpdateCustomerParams } from '@/models/customer';

/**
 * Lấy danh sách khách hàng có phân trang và tìm kiếm
 */
export async function getCustomers(
  page = 1,
  limit = 10,
  searchQuery = '',
  storeId = ''
) {
  try {
    // Bắt đầu từ record thứ mấy
    const from = (page - 1) * limit;
    
    // Tạo query cơ bản
    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' });
    
    // Áp dụng filter nếu có
    if (searchQuery) {
      query = query.or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,id_number.ilike.%${searchQuery}%`);
    }
    
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    
    // Thực hiện query với phân trang
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    
    if (error) throw error;
    
    return {
      data: data as Customer[],
      total: count || 0,
      page,
      limit,
      error: null
    };
  } catch (error) {
    console.error('Error fetching customers:', error);
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
 * Lấy thông tin chi tiết khách hàng theo ID
 */
export async function getCustomerById(id: string) {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return { data: null, error: { message: 'Không tìm thấy khách hàng' } };
    }
    
    return { data: data as Customer, error: null };
  } catch (error) {
    console.error('Error fetching customer:', error);
    return { data: null, error };
  }
}

/**
 * Tạo khách hàng mới
 */
export async function createCustomer(params: CreateCustomerParams) {
  try {
    // Tạo customer record
    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: params.name,
        store_id: params.store_id,
        phone: params.phone,
        address: params.address,
        id_number: params.id_number
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return { data: data as Customer, error: null };
  } catch (error) {
    console.error('Error creating customer:', error);
    return { data: null, error };
  }
}

/**
 * Cập nhật thông tin khách hàng
 */
export async function updateCustomer(id: string, params: UpdateCustomerParams) {
  try {
    const updateData: Record<string, any> = {};
    
    // Chỉ cập nhật các trường được cung cấp
    if (params.name !== undefined) updateData.name = params.name;
    if (params.store_id !== undefined) updateData.store_id = params.store_id;
    if (params.phone !== undefined) updateData.phone = params.phone;
    if (params.address !== undefined) updateData.address = params.address;
    if (params.id_number !== undefined) updateData.id_number = params.id_number;
    
    // Tự động cập nhật thời gian sửa đổi
    updateData.updated_at = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    return { data: data as Customer, error: null };
  } catch (error) {
    console.error('Error updating customer:', error);
    return { data: null, error };
  }
}

/**
 * Xóa khách hàng
 */
export async function deleteCustomer(id: string) {
  try {
    // Kiểm tra xem khách hàng có liên quan đến hợp đồng nào không
    const { data: credits, error: checkError } = await supabase
      .from('credits')
      .select('id')
      .eq('customer_id', id)
      .limit(1);
    
    if (checkError) throw checkError;
    
    if (credits && credits.length > 0) {
      return { 
        success: false, 
        error: { 
          message: 'Không thể xóa khách hàng vì đã có hợp đồng liên quan' 
        } 
      };
    }
    
    // Nếu không có hợp đồng liên quan, tiến hành xóa
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error deleting customer:', error);
    return { success: false, error };
  }
}
