export interface Store {
  id: string;             // ID cửa hàng
  name: string;           // Tên cửa hàng
  address?: string | null; // Địa chỉ
  phone?: string | null;   // Số điện thoại
  investment?: number;    // Vốn đầu tư (VNĐ)
  cash_fund?: number;     // Quỹ tiền mặt (VNĐ)
  status?: StoreStatus;   // Trạng thái
  is_deleted?: boolean;   // Xóa mềm
  created_at?: string;    // Thời gian tạo
  updated_at?: string | null; // Thời gian cập nhật
}

export enum StoreStatus {
  ACTIVE = 'active',      // Hoạt động
  SUSPENDED = 'suspended', // Tạm ngưng
  INACTIVE = 'inactive'   // Không hoạt động
}

export type StoreFormData = Omit<Store, 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
