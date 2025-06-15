import { supabase } from './supabase';
import { Permission, PermissionNode, DEFAULT_PERMISSIONS } from '@/models/permission';

// Get all permissions - now returns hard-coded permissions instead of fetching from DB
export async function getPermissions(): Promise<{ data: Permission[] | null; error: any }> {
  try {
    // Flatten the tree structure to get all permissions
    const flattenPermissions = (nodes: any[], processedIds: Set<string> = new Set()): Permission[] => {
      let result: Permission[] = [];
      
      nodes.forEach(node => {
        // Skip if we've already processed this node (prevents infinite recursion)
        if (processedIds.has(node.id)) {
          console.warn(`Circular reference detected for node with ID: ${node.id}`);
          return;
        }
        
        // Mark this node as processed
        processedIds.add(node.id);
        
        // Create a permission object from the node
        const permission: Permission = {
          id: node.id,
          name: node.name,
          description: node.description || '',
          parent_id: node.parent_id || null,
          module: node.module || '',
          created_at: new Date().toISOString()
        };
        result.push(permission);
        
        // Process children if they exist
        if (node.children && node.children.length > 0) {
          // Set parent_id for children
          const childrenWithParent = node.children.map((child: any) => ({
            ...child,
            parent_id: node.id,
            module: child.module || node.module
          }));
          
          // Use a new copy of processedIds for each child branch
          result = result.concat(flattenPermissions(childrenWithParent, new Set(processedIds)));
        }
      });
      
      return result;
    };
    
    // Get flattened permissions from DEFAULT_PERMISSIONS
    const permissions = flattenPermissions(DEFAULT_PERMISSIONS);
    return { data: permissions, error: null };
  } catch (error) {
    console.error('Error processing permissions:', error);
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

// Chuyển đổi flat permissions thành tree structure
export function buildPermissionTree(permissions: Permission[], checkedIds: string[] = []): PermissionNode[] {
  const permissionMap = new Map<string, PermissionNode>();
  const rootNodes: PermissionNode[] = [];
  const processedIds = new Set<string>();
  const maxDepth = 10; // Giới hạn độ sâu của cây để tránh đệ quy vô hạn

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
      // Kiểm tra tham chiếu vòng tròn (node tham chiếu đến chính nó)
      if (permission.parent_id === permission.id) {
        console.warn(`Self-reference detected for node with ID: ${permission.id}`);
        rootNodes.push(node);
        return;
      }
      
      const parent = permissionMap.get(permission.parent_id);
      if (parent) {
        parent.children = parent.children || [];
        
        // Kiểm tra xem node đã được thêm vào parent chưa để tránh trùng lặp
        if (!parent.children.some(child => child.id === node.id)) {
          parent.children.push(node);
          node.level = (parent.level || 0) + 1;
          
          // Kiểm tra độ sâu của cây
          if (node.level > maxDepth) {
            console.warn(`Maximum tree depth exceeded for node with ID: ${permission.id}`);
            return;
          }
        }
      } else {
        // Nếu không tìm thấy parent, đưa vào rootNodes
        rootNodes.push(node);
      }
    } else {
      rootNodes.push(node);
    }
  });

  // Tính toán trạng thái indeterminate cho parent nodes
  const updateParentStates = (node: PermissionNode, depth = 0): { checked: boolean; indeterminate: boolean } => {
    // Giới hạn độ sâu đệ quy
    if (depth > maxDepth) {
      console.warn(`Maximum recursion depth exceeded for node with ID: ${node.id}`);
      return { checked: false, indeterminate: false };
    }
    
    if (!node.children || node.children.length === 0) {
      return { checked: node.checked || false, indeterminate: false };
    }

    const childStates = node.children.map(child => updateParentStates(child, depth + 1));
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

  rootNodes.forEach(node => updateParentStates(node));

  return rootNodes;
}

// Lấy tất cả permission IDs từ một node và children của nó
export function getAllPermissionIds(node: PermissionNode): string[] {
  const ids: string[] = [];
  const processedIds = new Set<string>();
  
  // Hàm đệ quy có kiểm soát để lấy tất cả ID
  const collectIds = (currentNode: PermissionNode, depth = 0) => {
    // Giới hạn độ sâu đệ quy
    const maxDepth = 10;
    if (depth > maxDepth) {
      console.warn(`Maximum depth exceeded for node with ID: ${currentNode.id}`);
      return;
    }
    
    // Tránh xử lý lại các node đã xử lý (tránh vòng lặp vô hạn)
    if (processedIds.has(currentNode.id)) {
      console.warn(`Circular reference detected for node with ID: ${currentNode.id}`);
      return;
    }
    
    // Đánh dấu node đã được xử lý
    processedIds.add(currentNode.id);
    
    // Thêm ID của node hiện tại
    ids.push(currentNode.id);
    
    // Xử lý các node con nếu có
    if (currentNode.children && currentNode.children.length > 0) {
      currentNode.children.forEach(child => collectIds(child, depth + 1));
    }
  };
  
  // Bắt đầu thu thập từ node gốc
  collectIds(node);
  
  return ids;
}

// Lọc permissions theo search term
export function filterPermissions(nodes: PermissionNode[], searchTerm: string): PermissionNode[] {
  if (!searchTerm.trim()) return nodes;

  const filterNode = (node: PermissionNode, depth = 0): PermissionNode | null => {
    // Giới hạn độ sâu đệ quy
    const maxDepth = 10;
    if (depth > maxDepth) {
      console.warn(`Maximum filter depth exceeded for node with ID: ${node.id}`);
      return null;
    }
    
    const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Lọc các node con nếu có
    const filteredChildren = node.children 
      ? node.children
          .map(child => filterNode(child, depth + 1))
          .filter(Boolean) as PermissionNode[]
      : [];

    if (matchesSearch || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren
      };
    }

    return null;
  };

  // Lọc các node gốc
  return nodes
    .map(node => filterNode(node))
    .filter(Boolean) as PermissionNode[];
} 