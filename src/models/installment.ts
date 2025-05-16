import { Customer } from "./customer";

export enum InstallmentStatus {
  ON_TIME = "on_time",
  OVERDUE = "overdue", 
  LATE_INTEREST = "late_interest",
  BAD_DEBT = "bad_debt",
  CLOSED = "closed",
  DELETED = "deleted",
  DUE_TOMORROW = "due_tomorrow"
}

export interface Installment {
  id: string;
  contract_code: string;
  customer_id: string;
  amount_given: number;       // Tiền giao khách
  interest_rate: number;      // Tỷ lệ lãi suất
  duration: number;          // Thời gian vay (ngày)
  amount_paid: number;        // Tiền đã đóng
  old_debt: number;           // Nợ cũ
  daily_amount: number;       // Tiền 1 ngày
  remaining_amount: number;   // Còn phải đóng
  status: InstallmentStatus;  // Tình trạng
  due_date: string;           // Ngày phải đóng tiền
  start_date: string;         // Ngày bắt đầu
  store_id?: string;          // ID cửa hàng
  created_at?: string;
  updated_at?: string;
}

export interface InstallmentWithCustomer extends Installment {
  customer?: Customer;
}

export interface CreateInstallmentParams {
  contract_code: string;
  customer_id: string;
  amount_given: number;
  interest_rate: number;
  duration: number;
  start_date: string;
  amount_paid?: number;
  old_debt?: number;
  store_id?: string;
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
