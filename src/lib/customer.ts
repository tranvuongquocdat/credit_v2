import { supabase } from './supabase';
import { Customer, CreateCustomerParams, UpdateCustomerParams } from '@/models/customer';

// Debug helper
const debugLog = (message: string, data?: any) => {
  console.log(`[Customer API] ${message}`, data ? data : '');
};

/**
 * Lấy danh sách khách hàng có phân trang và tìm kiếm
 */
export async function getCustomers(
  page = 1,
  limit = 10,
  searchQuery = '',
  storeId = '',
  status = ''
) {
  debugLog('Getting customers with params:', { page, limit, searchQuery, storeId, status });
  
  try {
    // Bắt đầu từ record thứ mấy
    const from = (page - 1) * limit;
    
    // Build query
    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' });
    
    // Apply filters
    if (searchQuery) {
      debugLog(`Applying search query: ${searchQuery}`);
      query = query.or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,id_number.ilike.%${searchQuery}%`);
    }
    
    if (storeId) {
      // Basic store filter
      debugLog(`Filtering by store_id: ${storeId} (${typeof storeId})`);
      query = query.eq('store_id', storeId);
    } else {
      debugLog('No store filter applied');
    }

    if (status) {
      debugLog(`Filtering by status: ${status}`);
      query = query.eq('status', status);
    }
    
    // Execute with pagination
    debugLog(`Executing query with pagination: ${from} to ${from + limit - 1}`);
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    
    if (error) {
      debugLog('Error from database:', error);
      throw error;
    }
    
    debugLog(`Query returned ${data?.length || 0} results of ${count} total`);
    
    return {
      data: data as Customer[],
      total: count || 0,
      page,
      limit,
      error: null
    };
  } catch (error) {
    debugLog('Error fetching customers:', error);
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

/**
 * Function to directly test the store filter
 * This is a special debug function to isolate the issue
 */
export async function getCustomersByStore(storeId: string) {
  try {
    console.log('Testing direct store filter with ID:', storeId);
    
    // Create a simple query that only filters by store
    const { data, error, count } = await supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('store_id', String(storeId));
    
    if (error) {
      console.error('Store filter test failed:', error);
      return { success: false, error, data: null, count: 0 };
    }
    
    console.log(`Direct store filter found ${count} customers`);
    if (data && data.length > 0) {
      console.log('Sample customer:', {
        id: data[0].id,
        name: data[0].name,
        store_id: data[0].store_id,
        store_id_type: typeof data[0].store_id
      });
    }
    
    return { success: true, data, count, error: null };
  } catch (err) {
    console.error('Error in direct store test:', err);
    return { success: false, error: err, data: null, count: 0 };
  }
}
