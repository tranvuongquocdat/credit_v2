import { supabase } from './supabase';
import { Employee, EmployeeWithAuth, EmployeeStatus, CreateEmployeeParams, UpdateEmployeeParams } from '@/models/employee';

/**
 * Lấy danh sách nhân viên có phân trang và tìm kiếm
 */
export async function getEmployees(
  page = 1,
  limit = 10,
  searchQuery = '',
  storeId = '',
  status = ''
) {
  try {
    // Tính toán offset dựa trên trang và limit
    const offset = (page - 1) * limit;

    // Tạo query cơ bản
    let query = supabase
      .from('employees')
      .select('*, users(email,username), stores(id,name)', { count: 'exact' });

    // Thêm các điều kiện tìm kiếm nếu có
    if (searchQuery) {
      query = query.ilike('full_name', `%${searchQuery}%`);
    }

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    // Thực thi query với phân trang
    const { data, error, count } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Transform data to include auth user info
    const employees: EmployeeWithAuth[] = (data as any[])?.map((employee) => {
      const userData = Array.isArray(employee.users) ? employee.users[0] : employee.users;
      return {
        uid: employee.id,
        full_name: employee.full_name,
        store_id: employee.store_id,
        phone: employee.phone,
        status: employee.status as EmployeeStatus,
        created_at: employee.created_at,
        updated_at: employee.updated_at,
        auth: {
          email: userData?.email || '',
          username: userData?.username || ''
        },
        store: employee.stores
      };
    }) || [];

    // Tính tổng số trang
    const totalPages = count ? Math.ceil(count / limit) : 0;

    return { 
      data: employees, 
      error: null, 
      totalPages, 
      count 
    };
  } catch (error) {
    console.error('Error fetching employees:', error);
    return { 
      data: [], 
      error, 
      totalPages: 0, 
      count: 0 
    };
  }
}

/**
 * Lấy thông tin chi tiết nhân viên theo ID
 */
export async function getEmployeeById(id: string) {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*, users(email,username), stores(id,name)')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return { data: null, error: { message: 'Không tìm thấy nhân viên' } };
    }

    if (data) {
      const userData = Array.isArray(data.users) ? data.users[0] : data.users;
      const employee: EmployeeWithAuth = {
        uid: data.id,
        full_name: data.full_name,
        store_id: data.store_id,
        phone: data.phone,
        status: data.status as EmployeeStatus,
        created_at: data.created_at || '',
        updated_at: data.updated_at || '',
        auth: {
          email: userData?.email || '',
          username: userData?.username || ''
        },
        store: data.stores
      };
      return { data: employee, error: null };
    }
  } catch (error) {
    console.error('Error fetching employee:', error);
    return { data: null, error };
  }
}

/**
 * Tạo nhân viên mới (bao gồm tạo user trong auth.users và thêm vào bảng employees)
 */
export async function createEmployee(params: CreateEmployeeParams) {
  try {
    // 1. Tạo auth user với username và password
    const { data: authData, error: authError } = await supabase.functions.invoke(
      'create-auth-user', 
      { 
        body: {
          username: params.username,
          email: params.email || `${params.username}@temporary.com`,
          password: params.password,
          full_name: params.full_name
        }
      }
    );

    if (authError || !authData?.userId) {
      throw authError || new Error('Failed to create user');
    }

    // 2. Tạo employee record liên kết với auth user
    const { data, error } = await supabase
      .from('employees')
      .insert({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15), // Tạo ID duy nhất
        user_id: authData.userId, // Liên kết với auth user ID
        full_name: params.full_name,
        email: params.email, // Thêm email field mới
        store_id: params.store_id,
        phone: params.phone,
        status: params.status
      })
      .select()
      .single();

    if (error) {
      // Nếu có lỗi khi tạo employee, cần xóa auth user đã tạo
      await supabase.functions.invoke('delete-user', {
        body: { userId: authData.userId }
      });
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error creating employee:', error);
    return { data: null, error };
  }
}

/**
 * Cập nhật thông tin nhân viên
 */
export async function updateEmployee(id: string, params: UpdateEmployeeParams) {
  try {
    // Kiểm tra nếu có thay đổi mật khẩu
    if (params.password) {
      const { error: passwordError } = await supabase.functions.invoke(
        'update-employee-password', 
        { 
          body: {
            userId: id,
            password: params.password
          }
        }
      );

      if (passwordError) {
        throw passwordError;
      }
    }

    // Cập nhật thông tin nhân viên
    const updateData: any = {};
    if (params.full_name !== undefined) updateData.full_name = params.full_name;
    if (params.store_id !== undefined) updateData.store_id = params.store_id;
    if (params.phone !== undefined) updateData.phone = params.phone;
    if (params.status !== undefined) updateData.status = params.status;

    // Cập nhật email nếu cần (thông qua admin API)
    if (params.email !== undefined) {
      const { error: emailError } = await supabase.functions.invoke(
        'update-employee-email', 
        { 
          body: {
            userId: id,
            email: params.email
          }
        }
      );

      if (emailError) {
        throw emailError;
      }
    }

    // Chỉ cập nhật employee trong database nếu có dữ liệu cần thay đổi
    if (Object.keys(updateData).length > 0) {
      const { data, error } = await supabase
        .from('employees')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return { data, error: null };
    }

    // Nếu không có dữ liệu cần thay đổi trong bảng employees, chỉ thay đổi mật khẩu/email
    // thì vẫn trả về thành công
    const { data: currentData, error: fetchError } = await supabase
      .from('employees')
      .select()
      .eq('id', id)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    return { data: currentData, error: null };
  } catch (error) {
    console.error('Error updating employee:', error);
    return { data: null, error };
  }
}

/**
 * Vô hiệu hóa nhân viên (chuyển trạng thái sang inactive)
 */
export async function deactivateEmployee(id: string) {
  try {
    // 1. Cập nhật trạng thái nhân viên sang inactive
    const { data, error } = await supabase
      .from('employees')
      .update({ status: EmployeeStatus.INACTIVE })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // 2. Vô hiệu hóa tài khoản xác thực
    const { error: disableError } = await supabase.functions.invoke(
      'disable-user', 
      { 
        body: { userId: id }
      }
    );

    if (disableError) {
      // Nếu có lỗi khi vô hiệu hóa auth user, hoàn tác thay đổi trạng thái employee
      await supabase
        .from('employees')
        .update({ status: EmployeeStatus.WORKING })
        .eq('id', id);
      throw disableError;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error deactivating employee:', error);
    return { data: null, error };
  }
}

/**
 * Kích hoạt lại nhân viên đã bị vô hiệu hóa
 */
export async function activateEmployee(id: string) {
  try {
    // 1. Cập nhật trạng thái nhân viên sang working
    const { data, error } = await supabase
      .from('employees')
      .update({ status: EmployeeStatus.WORKING })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // 2. Kích hoạt lại tài khoản xác thực
    const { error: enableError } = await supabase.functions.invoke(
      'enable-user', 
      { 
        body: { userId: id }
      }
    );

    if (enableError) {
      // Nếu có lỗi khi kích hoạt auth user, hoàn tác thay đổi trạng thái employee
      await supabase
        .from('employees')
        .update({ status: EmployeeStatus.INACTIVE })
        .eq('id', id);
      throw enableError;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error activating employee:', error);
    return { data: null, error };
  }
}
