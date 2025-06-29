import { supabase } from './supabase';
import { Employee, EmployeeWithProfile, EmployeeStatus, CreateEmployeeParams, UpdateEmployeeParams } from '@/models/employee';

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
    // Nếu không có storeId, trả về rỗng (cần có store để filter)
    if (!storeId) {
      return { 
        data: [], 
        error: null, 
        totalPages: 0, 
        count: 0 
      };
    }

    // Tính toán offset dựa trên trang và limit
    const offset = (page - 1) * limit;

    // Tạo query cơ bản với filter theo store
    let query = supabase
      .from('employees')
      .select('*, profiles(email,username), stores(id,name)', { count: 'exact' })
      .eq('store_id', storeId);

    // Thêm các điều kiện tìm kiếm nếu có
    if (searchQuery) {
      query = query.ilike('full_name', `%${searchQuery}%`);
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
    console.log(data);
    // Transform data to include auth user info
    const employees: EmployeeWithProfile[] = (data as any[])?.map((employee) => {
      const userData = Array.isArray(employee.profiles) ? employee.profiles[0] : employee.profiles;
      return {
        uid: employee.id,
        full_name: employee.full_name,
        store_id: employee.store_id,
        phone: employee.phone,
        status: employee.status as EmployeeStatus,
        created_at: employee.created_at,
        updated_at: employee.updated_at,
        profiles: {
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
      .select('*, profiles(email,username), stores(id,name)')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return { data: null, error: { message: 'Không tìm thấy nhân viên' } };
    }

    if (data) {
      const userData = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
      const employee: EmployeeWithProfile = {
        uid: data.id,
        full_name: data.full_name,
        store_id: data.store_id,
        phone: data.phone,
        status: data.status as EmployeeStatus,
        created_at: data.created_at || '',
        updated_at: data.updated_at || '',
        profiles: {
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
    const email = `${params.username}@creditapp.local`;

    // 1. Tạo auth user với username và password
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: params.password,
    });

    if (authError || !authData?.user?.id) {
      throw authError || new Error('Failed to create user');
    }
    // Nếu đăng ký thành công, lưu username vào bảng profiles
    if (authData && authData.user) {
      const { error: profileError } = await supabase.from('profiles').insert([
        { id: authData.user.id, username: params.username, role: "employee" }
      ]);
      if (profileError) {
        // Nếu có lỗi khi lưu profile, có thể cần xóa user đã tạo
        console.error('Error saving username:', profileError);
      }
    }
    // 2. Tạo employee record liên kết với auth user
    const { data, error } = await supabase
      .from('employees')
      .insert({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15), // Tạo ID duy nhất
        user_id: authData.user.id, // Liên kết với auth user ID
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
      await supabase.auth.admin.deleteUser(authData.user.id);
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
    // Lấy ra profile id từ employee id trong bảng employees
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('user_id')
      .eq('id', id)
      .single();
    if (employeeError) {
      throw employeeError;
    }
    // Kiểm tra nếu có thay đổi mật khẩu
    if (params.password) {
      const response = await fetch(`/api/users/${employeeData.user_id}/changePassword`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: params.password,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to update password');
      }
    }

    // Cập nhật thông tin nhân viên
    const updateData: any = {};
    if (params.full_name !== undefined) updateData.full_name = params.full_name;
    if (params.store_id !== undefined) updateData.store_id = params.store_id;
    if (params.phone !== undefined) updateData.phone = params.phone;
    if (params.status !== undefined) updateData.status = params.status;
    if (params.email !== undefined) updateData.email = params.email;

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
    //  Cập nhật status của employee
    const { data, error } = await supabase
      .from('employees')
      .update({ status: EmployeeStatus.INACTIVE, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Cập nhật is_banned trong profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles') 
      .update({ is_banned: true, updated_at: new Date().toISOString() })
      .eq('id', data?.user_id)
      .select()
      .single();

    if (profileError) {
      throw profileError;
    }

    return { data: profileData, error: null };
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
    // Cập nhật status của employee
    const { data, error } = await supabase
      .from('employees')
      .update({ status: EmployeeStatus.WORKING, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw error;
    }

    // Cập nhật is_banned trong profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .update({ is_banned: false, updated_at: new Date().toISOString() })
      .eq('id', data?.user_id)
      .select()
      .single();
    if (profileError) {
      throw profileError;
    }

    return { data: profileData, error: null };
  } catch (error) {
    console.error('Error activating employee:', error);
    return { data: null, error };
  }
}
