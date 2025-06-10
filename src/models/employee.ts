import { Database } from '../types/database.types';
import { Store } from './store';

export enum EmployeeStatus {
  WORKING = 'working',
  INACTIVE = 'inactive'
}

export interface Employee {
  uid: string;
  full_name: string;
  store_id: string | null;
  phone: string | null;
  status: EmployeeStatus;
  created_at: string;
  updated_at: string | null;
  store?: Store | null; // Thông tin cửa hàng (khi join)
}

export interface EmployeeWithProfile extends Employee {
  profiles: {
    email: string;
    username: string;
  };
}

export interface EmployeeFormData {
  full_name: string;
  store_id: string | null;
  phone: string | null;
  email: string | null;
  status: EmployeeStatus;
  username: string; // Để tạo auth user
  password: string; // Để tạo auth user (chỉ dùng khi tạo mới)
}

export interface CreateEmployeeParams extends EmployeeFormData {}

export interface UpdateEmployeeParams {
  full_name?: string;
  store_id?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: EmployeeStatus;
  password?: string; // Optional - nếu muốn thay đổi mật khẩu
}

export interface EmployeeWithAuth extends Employee {
  uid: string;
  // Add any other auth-related fields
}

export type DbEmployee = Database['public']['Tables']['employees']['Row'];
