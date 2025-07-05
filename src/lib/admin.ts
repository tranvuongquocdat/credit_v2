import { supabase } from './supabase';
import { AdminDB, Admin, AdminWithProfile, CreateAdminParams, UpdateAdminParams, AdminStatus } from '@/models/admin';

// Convert database admin to UI admin
function convertToAdmin(adminDB: any): Admin {
  return {
    id: adminDB.id,
    username: adminDB.username,
    email: adminDB.email || undefined,
    full_name: adminDB.full_name || undefined,
    role: adminDB.role as 'admin' | 'superadmin',
    status: adminDB.is_banned ? AdminStatus.INACTIVE : AdminStatus.ACTIVE,
    created_at: adminDB.created_at,
    updated_at: adminDB.updated_at,
  };
}

// Get admins with pagination and filtering
export async function getAdmins(
  page: number = 1,
  limit: number = 10,
  searchQuery: string = '',
  statusFilter: string = ''
) {
  try {
    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .eq('role', 'admin'); // Only get admin role users

    // Apply search filter
    if (searchQuery.trim()) {
      query = query.or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
    }

    // Apply status filter
    if (statusFilter && statusFilter !== 'all') {
      const isBanned = statusFilter === 'inactive';
      query = query.eq('is_banned', isBanned);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    // Order by created_at desc
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching admins:', error);
      return { data: [], error, totalPages: 0 };
    }

    const admins: AdminWithProfile[] = (data || []).map(convertToAdmin);
    const totalPages = Math.ceil((count || 0) / limit);

    return { data: admins, error: null, totalPages };
  } catch (err) {
    console.error('Error in getAdmins:', err);
    return { 
      data: [], 
      error: { message: 'Đã xảy ra lỗi khi tải danh sách admin' }, 
      totalPages: 0 
    };
  }
}

// Create new admin
export async function createAdmin(adminData: CreateAdminParams) {
  try {
    // First create the auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: `${adminData.username}@creditapp.local`,
      password: adminData.password,
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return { data: null, error: authError };
    }

    if (!authData.user) {
      return { data: null, error: { message: 'Không thể tạo tài khoản người dùng' } };
    }

    // Then update the profile
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        username: adminData.username,
        email: adminData.email,
        role: 'admin',
        is_banned: adminData.status === AdminStatus.INACTIVE,
      })
      .eq('id', authData.user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return { data: null, error };
    }

    return { data: convertToAdmin(data), error: null };
  } catch (err) {
    console.error('Error in createAdmin:', err);
    return { 
      data: null, 
      error: { message: 'Đã xảy ra lỗi khi tạo admin' } 
    };
  }
}

// Update admin
export async function updateAdmin(adminId: string, adminData: UpdateAdminParams) {
  try {
    // get profile id from admin id
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', adminId)
      .single();
    if (profileError) return { data: null, error: profileError };

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (adminData.username !== undefined) updateData.username = adminData.username;
    if (adminData.password !== undefined) {
      const response = await fetch(`/api/users/${profileData.id}/changePassword`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminData.password,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to update password');
      }
    }
    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', adminId)
      .select()
      .single();

    if (error) {
      console.error('Error updating admin:', error);
      return { data: null, error };
    }

    return { data: convertToAdmin(data), error: null };
  } catch (err) {
    console.error('Error in updateAdmin:', err);
    return { 
      data: null, 
      error: { message: 'Đã xảy ra lỗi khi cập nhật admin' } 
    };
  }
}

// Deactivate admin
export async function deactivateAdmin(adminId: string) {
  try {
    console.log('🚫 Starting deactivateAdmin for adminId:', adminId);
    
    // Step 1: Set is_banned and is_banned_by_superadmin = true for the admin
    const { data: adminData, error: adminError } = await supabase
      .from('profiles')
      .update({
        is_banned: true,
        is_banned_by_superadmin: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adminId)
      .select()
      .single();

    if (adminError) {
      console.error('❌ Error deactivating admin:', adminError);
      return { data: null, error: adminError };
    }

    console.log('✅ Admin deactivated:', adminData);

    // Step 2: Find all stores created by this admin
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name')
      .eq('created_by', adminId);

    if (storesError) {
      console.error('❌ Error fetching stores:', storesError);
      return { data: convertToAdmin(adminData), error: storesError };
    }

    console.log('🏪 Found stores created by admin:', stores);

    if (stores && stores.length > 0) {
      const storeIds = stores.map(store => store.id);
      
      // Step 3: Find all employees in these stores
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('id, profiles!inner(id, is_banned)')
        .in('store_id', storeIds);

      if (employeesError) {
        console.error('❌ Error fetching employees:', employeesError);
        return { data: convertToAdmin(adminData), error: employeesError };
      }

      console.log('👥 Found employees in stores:', employees);

      if (employees && employees.length > 0) {
        // Step 4: Filter employees that are not already banned and update them
        const employeesToBan = employees.filter(emp => 
          emp.profiles && !emp.profiles.is_banned
        );

        console.log('🎯 Employees to ban:', employeesToBan);

        if (employeesToBan.length > 0) {
          const employeeProfileIds = employeesToBan.map(emp => emp.profiles.id);
          const employeeIds = employeesToBan.map(emp => emp.id);
          // update employee status to inactive 
          const { error: updateErrorStatus } = await supabase
            .from('employees')
            .update({
              status: 'inactive',
            })
            .in('id', employeeIds)
            .select();  
          if (updateErrorStatus) {
            console.error('❌ Error updating employees:', updateErrorStatus);
            return { data: convertToAdmin(adminData), error: updateErrorStatus };
          }

          const { data: updatedEmployees, error: updateError } = await supabase
            .from('profiles')
            .update({
              is_banned: true,
              is_banned_by_superadmin: true,
              updated_at: new Date().toISOString(),
            })
            .in('id', employeeProfileIds)
            .select();

          if (updateError) {
            console.error('❌ Error updating employees:', updateError);
            return { data: convertToAdmin(adminData), error: updateError };
          }

          console.log('✅ Updated employees:', updatedEmployees);
        }
      }
    }

    return { data: convertToAdmin(adminData), error: null };
  } catch (err) {
    console.error('💥 Error in deactivateAdmin:', err);
    return { 
      data: null, 
      error: { message: 'Đã xảy ra lỗi khi vô hiệu hóa admin' } 
    };
  }
}

// Activate admin
export async function activateAdmin(adminId: string) {
  try {
    console.log('✅ Starting activateAdmin for adminId:', adminId);
    
    // Step 1: Set is_banned and is_banned_by_superadmin = false for the admin
    const { data: adminData, error: adminError } = await supabase
      .from('profiles')
      .update({
        is_banned: false,
        is_banned_by_superadmin: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adminId)
      .select()
      .single();

    if (adminError) {
      console.error('❌ Error activating admin:', adminError);
      return { data: null, error: adminError };
    }

    console.log('✅ Admin activated:', adminData);

    // Step 2: Find all stores created by this admin
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name')
      .eq('created_by', adminId);

    if (storesError) {
      console.error('❌ Error fetching stores:', storesError);
      return { data: convertToAdmin(adminData), error: storesError };
    }

    console.log('🏪 Found stores created by admin:', stores);

    if (stores && stores.length > 0) {
      const storeIds = stores.map(store => store.id);
      
      // Step 3: Find all employees in these stores that were banned by superadmin
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('id, profiles!inner(id, is_banned, is_banned_by_superadmin)')
        .in('store_id', storeIds);

      if (employeesError) {
        console.error('❌ Error fetching employees:', employeesError);
        return { data: convertToAdmin(adminData), error: employeesError };
      }

      console.log('👥 Found employees in stores:', employees);

      if (employees && employees.length > 0) {
        // Step 4: Filter employees that were banned by superadmin and reactivate them
        const employeesToActivate = employees.filter(emp => 
          emp.profiles && 
          emp.profiles.is_banned && 
          emp.profiles.is_banned_by_superadmin
        );

        console.log('🎯 Employees to activate:', employeesToActivate);

        if (employeesToActivate.length > 0) {
          const employeeIds = employeesToActivate.map(emp => emp.profiles.id);
          
          const { data: updatedEmployees, error: updateError } = await supabase
            .from('profiles')
            .update({
              is_banned: false,
              is_banned_by_superadmin: false,
              updated_at: new Date().toISOString(),
            })
            .in('id', employeeIds)
            .select();

          if (updateError) {
            console.error('❌ Error updating employees:', updateError);
            return { data: convertToAdmin(adminData), error: updateError };
          }

          console.log('✅ Updated employees:', updatedEmployees);
        }
      }
    }

    return { data: convertToAdmin(adminData), error: null };
  } catch (err) {
    console.error('💥 Error in activateAdmin:', err);
    return { 
      data: null, 
      error: { message: 'Đã xảy ra lỗi khi kích hoạt admin' } 
    };
  }
}

// Delete admin
export async function deleteAdmin(adminId: string) {
  try {
    console.log('🗑️ Starting deleteAdmin for adminId:', adminId);
    
    const response = await fetch(`/api/users/${adminId}/delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Không thể xóa admin');
    }

    const result = await response.json();
    console.log('✅ Admin deleted successfully:', result);

    return { data: { message: result.message }, error: null };
  } catch (err) {
    console.error('💥 Error in deleteAdmin:', err);
    return { 
      data: null, 
      error: { message: err instanceof Error ? err.message : 'Đã xảy ra lỗi khi xóa admin' } 
    };
  }
} 