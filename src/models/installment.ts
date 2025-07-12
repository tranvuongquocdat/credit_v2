import { Customer } from "./customer";

export enum InstallmentStatus {
  ON_TIME = "on_time",
  OVERDUE = "overdue", 
  LATE_INTEREST = "late_interest",
  BAD_DEBT = "bad_debt",
  CLOSED = "closed",
  DELETED = "deleted",
  DUE_TOMORROW = "due_tomorrow",
  FINISHED = "finished"
}

// Database model - maps directly to the database table
export interface InstallmentDB {
  id: string;
  contract_code: string;
  customer_id: string;
  employee_id: string;
  down_payment: number;         // Tiền đưa khách
  installment_amount: number;   // Tiền trả góp
  loan_period: number;          // Thời gian vay (ngày)
  payment_period: number;       // Số ngày đóng tiền
  loan_date: string;            // Ngày vay
  payment_due_date?: string;    // Ngày phải đóng tiền
  debt_amount: number;          // Tiền nợ
  notes?: string;               // Ghi chú
  status: string;               // Trạng thái
  store_id?: string;            // ID cửa hàng (from view)
  created_at?: string;
  updated_at?: string;
}

// UI model - what's used in the UI
export interface Installment {
  id: string;
  contract_code: string;
  customer_id: string;
  employee_id: string;        
  
  // UI-specific fields (mapping from DB)
  amount_given: number;       // down_payment (Tiền đưa khách)
  duration: number;           // loan_period (Thời gian vay)
  payment_period: number;     // Số ngày đóng tiền
  
  // Calculated fields for UI
  amount_paid: number;        // Tiền đã đóng (calculated from payments)
  old_debt: number;           // Nợ cũ (mapped from debt_amount)
  daily_amount: number;       // Tiền 1 ngày (installment_amount/payment_period)
  remaining_amount: number;   // Còn phải đóng (calculated)
  
  status: InstallmentStatus;  // Tình trạng
  due_date: string;           // Ngày phải đóng tiền (calculated)
  start_date: string;         // loan_date (Ngày bắt đầu)
  payment_due_date?: string | null;  // Ngày phải đóng tiền từ DB
  
  notes?: string;             // Ghi chú
  store_id?: string;          // ID cửa hàng (from employee.store_id)
  created_at?: string;
  updated_at?: string;
  
  // Additional fields
  down_payment?: number;      // Direct reference to DB field
  installment_amount?: number; // Direct reference to DB field
  loan_period?: number;       // Direct reference to DB field 
  loan_date?: string;         // Direct reference to DB field
  debt_amount?: number;       // Direct reference to DB field
}

export interface InstallmentWithCustomer extends Installment {
  customer?: Customer;
  reason?: string; // Add optional reason field for warnings
}

// Interface for creating a new installment - matches DB schema
export interface CreateInstallmentParams {
  customer_id: string;
  employee_id: string;        
  contract_code: string;
  down_payment: number;       // Tiền đưa khách
  installment_amount: number; // Tiền trả góp
  loan_period: number;        // Thời gian vay
  payment_period: number;     // Số ngày đóng tiền
  loan_date: string;          // Ngày vay
  payment_due_date?: string;  // Ngày phải đóng tiền
  debt_amount?: number;       // Tiền nợ (default 0)
  notes?: string;
  status?: InstallmentStatus;
}

export interface InstallmentFilters {
  contract_code?: string;
  customer_name?: string;
  start_date?: string;
  end_date?: string;
  duration?: number;
  status?: InstallmentStatus | "all";
  store_id?: string;
}
