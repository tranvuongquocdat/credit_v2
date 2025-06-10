import { supabase } from './supabase';
import { Permission, PermissionNode, DEFAULT_PERMISSIONS } from '@/models/permission';

// Lấy tất cả permissions
export async function getPermissions(): Promise<{ data: Permission[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .order('name');

    return { data: data as Permission[], error };
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return { data: null, error };
  }
}

// Lấy permissions của một nhân viên
export async function getEmployeePermissions(employeeId: string): Promise<{ data: string[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('employee_permissions')
      .select('permission_id')
      .eq('employee_id', employeeId);

    if (error) return { data: null, error };

    const permissionIds = data?.map(item => item.permission_id) || [];
    return { data: permissionIds, error: null };
  } catch (error) {
    console.error('Error fetching employee permissions:', error);
    return { data: null, error };
  }
}

// Cập nhật permissions cho nhân viên
export async function updateEmployeePermissions(
  employeeId: string, 
  permissionIds: string[], 
  grantedBy: string
): Promise<{ error: any }> {
  try {
    // Xóa tất cả permissions hiện tại của nhân viên
    const { error: deleteError } = await supabase
      .from('employee_permissions')
      .delete()
      .eq('employee_id', employeeId);

    if (deleteError) return { error: deleteError };

    // Thêm permissions mới
    if (permissionIds.length > 0) {
      const newPermissions = permissionIds.map(permissionId => ({
        employee_id: employeeId,
        permission_id: permissionId,
        granted_by: grantedBy
      }));

      const { error: insertError } = await supabase
        .from('employee_permissions')
        .insert(newPermissions);

      if (insertError) return { error: insertError };
    }

    return { error: null };
  } catch (error) {
    console.error('Error updating employee permissions:', error);
    return { error };
  }
}

// Khởi tạo permissions mặc định (chạy một lần để setup)
export async function initializeDefaultPermissions(): Promise<{ error: any }> {
  try {
    // Kiểm tra xem đã có permissions chưa
    const { data: existingPermissions } = await supabase
      .from('permissions')
      .select('id')
      .limit(1);

    if (existingPermissions && existingPermissions.length > 0) {
      return { error: null }; // Đã có permissions rồi
    }

    // Tạo permissions từ DEFAULT_PERMISSIONS
    const permissionsToInsert: Omit<Permission, 'created_at'>[] = [];

    DEFAULT_PERMISSIONS.forEach(category => {
      // Thêm category parent
      permissionsToInsert.push({
        id: category.id,
        name: category.name,
        module: category.module,
        parent_id: null
      });

      // Thêm children
      category.children?.forEach(child => {
        permissionsToInsert.push({
          id: child.id,
          name: child.name,
          module: category.module,
          parent_id: category.id
        });
      });
    });

    const { error } = await supabase
      .from('permissions')
      .insert(permissionsToInsert);

    return { error };
  } catch (error) {
    console.error('Error initializing default permissions:', error);
    return { error };
  }
}

// Chuyển đổi flat permissions thành tree structure
export function buildPermissionTree(permissions: Permission[], checkedIds: string[] = []): PermissionNode[] {
  const permissionMap = new Map<string, PermissionNode>();
  const rootNodes: PermissionNode[] = [];

  // Tạo map của tất cả permissions
  permissions.forEach(permission => {
    permissionMap.set(permission.id, {
      ...permission,
      children: [],
      checked: checkedIds.includes(permission.id),
      indeterminate: false,
      level: 0
    });
  });

  // Xây dựng tree structure
  permissions.forEach(permission => {
    const node = permissionMap.get(permission.id)!;
    
    if (permission.parent_id) {
      const parent = permissionMap.get(permission.parent_id);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(node);
        node.level = (parent.level || 0) + 1;
      }
    } else {
      rootNodes.push(node);
    }
  });

  // Tính toán trạng thái indeterminate cho parent nodes
  const updateParentStates = (node: PermissionNode): { checked: boolean; indeterminate: boolean } => {
    if (!node.children || node.children.length === 0) {
      return { checked: node.checked || false, indeterminate: false };
    }

    const childStates = node.children.map(child => updateParentStates(child));
    const checkedChildren = childStates.filter(state => state.checked).length;
    const indeterminateChildren = childStates.filter(state => state.indeterminate).length;

    if (checkedChildren === node.children.length) {
      node.checked = true;
      node.indeterminate = false;
    } else if (checkedChildren > 0 || indeterminateChildren > 0) {
      node.checked = false;
      node.indeterminate = true;
    } else {
      node.checked = false;
      node.indeterminate = false;
    }

    return { checked: node.checked, indeterminate: node.indeterminate };
  };

  rootNodes.forEach(updateParentStates);

  return rootNodes;
}

// Lấy tất cả permission IDs từ một node và children của nó
export function getAllPermissionIds(node: PermissionNode): string[] {
  const ids = [node.id];
  
  if (node.children) {
    node.children.forEach(child => {
      ids.push(...getAllPermissionIds(child));
    });
  }
  
  return ids;
}

// Lọc permissions theo search term
export function filterPermissions(nodes: PermissionNode[], searchTerm: string): PermissionNode[] {
  if (!searchTerm.trim()) return nodes;

  const filterNode = (node: PermissionNode): PermissionNode | null => {
    const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase());
    const filteredChildren = node.children?.map(filterNode).filter(Boolean) as PermissionNode[] || [];

    if (matchesSearch || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren
      };
    }

    return null;
  };

  return nodes.map(filterNode).filter(Boolean) as PermissionNode[];
} 