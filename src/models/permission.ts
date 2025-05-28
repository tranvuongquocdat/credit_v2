export interface Permission {
  id: string;
  name: string;
  description?: string;
  parent_id?: string | null;
  module?: string;
  created_at: string;
}

export interface EmployeePermission {
  employee_id: string;
  permission_id: string;
  granted_by: string;
  granted_at: string;
}

export interface PermissionNode extends Permission {
  children?: PermissionNode[];
  checked?: boolean;
  indeterminate?: boolean;
  level?: number;
}

export interface EmployeePermissionFormData {
  employee_id: string;
  permission_ids: string[];
}

// Predefined permissions structure
export const DEFAULT_PERMISSIONS = [
  {
    id: 'database',
    name: 'Cơ sở dữ liệu',
    module: 'database',
    children: [
      { id: 'database.view_scale', name: 'Xem thông tin quy mô, tên đăng ký, tỷ lệ tăng trưởng, tỷ lệ nợ xấu' },
      { id: 'database.view_customer', name: 'Xem danh sách khách hàng' },
      { id: 'database.view_interest', name: 'Tài mật lãi đăng' },
      { id: 'database.view_stats', name: 'Số ngày vay' },
      { id: 'database.view_loan_stats', name: 'Số lượng đăng' },
      { id: 'database.view_debt_stats', name: 'Đồng tài' },
      { id: 'database.view_growth', name: 'Tỷ lệ tăng trưởng tài' },
      { id: 'database.view_debt_ratio', name: 'Tỷ lệ nợ xấu tài' },
      { id: 'database.view_customer_debt', name: 'Chỉ nợ khách hàng tài' },
      { id: 'database.view_payment_debt', name: 'Chỉ nợ nợ tài' },
      { id: 'database.view_thank_you', name: 'Thành lý tài' }
    ]
  },
  {
    id: 'finance',
    name: 'Tài chính',
    module: 'finance',
    children: [
      { id: 'finance.view_scale', name: 'Xem thông tin quy mô, tên đăng ký, tỷ lệ tăng trưởng, tỷ lệ nợ xấu' },
      { id: 'finance.view_customer', name: 'Xem danh sách khách hàng' },
      { id: 'finance.view_interest', name: 'Tài mật lãi đăng' },
      { id: 'finance.view_stats', name: 'Số ngày vay' },
      { id: 'finance.view_loan_stats', name: 'Số lượng đăng' },
      { id: 'finance.view_debt_stats', name: 'Đồng tài' },
      { id: 'finance.view_growth', name: 'Tỷ lệ tăng trưởng tài' },
      { id: 'finance.view_debt_ratio', name: 'Tỷ lệ nợ xấu tài' },
      { id: 'finance.view_customer_debt', name: 'Chỉ nợ khách hàng tài' },
      { id: 'finance.view_payment_debt', name: 'Chỉ nợ nợ tài' },
      { id: 'finance.view_thank_you', name: 'Thành lý tài' }
    ]
  },
  {
    id: 'financial_management',
    name: 'Quản lý tài chính',
    module: 'financial_management',
    children: [
      { id: 'financial_management.view_scale', name: 'Xem thông tin quy mô, tên đăng ký, tỷ lệ tăng trưởng, tỷ lệ nợ xấu' },
      { id: 'financial_management.view_customer', name: 'Xem danh sách khách hàng' },
      { id: 'financial_management.view_interest', name: 'Tài mật lãi đăng' },
      { id: 'financial_management.view_stats', name: 'Số ngày vay' },
      { id: 'financial_management.view_loan_stats', name: 'Số lượng đăng' },
      { id: 'financial_management.view_debt_stats', name: 'Đồng tài' },
      { id: 'financial_management.view_growth', name: 'Tỷ lệ tăng trưởng tài' },
      { id: 'financial_management.view_debt_ratio', name: 'Tỷ lệ nợ xấu tài' },
      { id: 'financial_management.view_customer_debt', name: 'Chỉ nợ khách hàng tài' },
      { id: 'financial_management.view_payment_debt', name: 'Chỉ nợ nợ tài' },
      { id: 'financial_management.view_thank_you', name: 'Thành lý tài' }
    ]
  },
  {
    id: 'employee_management',
    name: 'Quản lý nhân viên',
    module: 'employee_management',
    children: [
      { id: 'employee_management.view', name: 'Xem danh sách nhân viên' },
      { id: 'employee_management.create', name: 'Tạo nhân viên mới' },
      { id: 'employee_management.edit', name: 'Sửa thông tin nhân viên' },
      { id: 'employee_management.delete', name: 'Xóa nhân viên' },
      { id: 'employee_management.permissions', name: 'Quản lý phân quyền' }
    ]
  },
  {
    id: 'statistics',
    name: 'Thống kê',
    module: 'statistics',
    children: [
      { id: 'statistics.view_reports', name: 'Xem báo cáo' },
      { id: 'statistics.export', name: 'Xuất báo cáo' },
      { id: 'statistics.dashboard', name: 'Xem dashboard' }
    ]
  }
]; 