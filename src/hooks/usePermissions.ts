'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function fetchPermissions() {
      try {
        setLoading(true);
        
        // Lấy thông tin user hiện tại
        const user = await getCurrentUser();
        
        if (!user || !user.id) {
          setPermissions([]);
          setLoading(false);
          return;
        }

        // Kiểm tra nếu user có role là admin
        if (user.role === 'admin') {
          setIsAdmin(true);
          setPermissions([]);
          setLoading(false);
          return;
        }
        
        // Chỉ lấy quyền nếu user có role là employee
        if (user.role !== 'employee') {
          setPermissions([]);
          setLoading(false);
          return;
        }
        
        // Tìm employee_id từ user_id
        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', user.id)
          .single();
          
        if (employeeError || !employeeData) {
          setPermissions([]);
          setLoading(false);
          return;
        }
        
        // Lấy danh sách quyền của nhân viên
        const { data: permissionData, error: permissionError } = await supabase
          .from('employee_permissions')
          .select('permission_id')
          .eq('employee_id', employeeData.id);
          
        if (permissionError) {
          throw permissionError;
        }
        
        // Lưu danh sách quyền
        const permissionIds = permissionData?.map(p => p.permission_id) || [];
        console.log('Loaded permissions:', permissionIds);
        setPermissions(permissionIds);
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    }
    
    fetchPermissions();
  }, []);
  
  // Hàm kiểm tra quyền
  const hasPermission = (permissionId: string): boolean => {
    // Admin có tất cả các quyền
    if (isAdmin) return true;
    
    // Kiểm tra quyền cho employee
    return permissions.includes(permissionId);
  };
  
  return { permissions, hasPermission, loading, error, isAdmin };
}
