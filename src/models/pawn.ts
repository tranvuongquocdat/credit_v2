import { Collateral } from './collateral';

export enum PawnStatus {
  ON_TIME = 'on_time',           // Đúng hẹn
  OVERDUE = 'overdue',          // Quá hạn
  LATE_INTEREST = 'late_interest', // Chậm lãi
  BAD_DEBT = 'bad_debt',        // Nợ xấu
  CLOSED = 'closed',           // Kết thúc (hoặc đóng hợp đồng sớm)
  DELETED = 'deleted',           // Đã xóa
}

export enum InterestType {
  PERCENTAGE = 'percentage',   // Phần trăm
  FIXED_AMOUNT = 'fixed_amount' // Số tiền cố định
}

export interface Pawn {
  id: string;
  store_id: string;
  customer_id: string;
  contract_code?: string | null;
  id_number?: string | null;
  phone?: string | null;
  address?: string | null;
  collateral_id: string;        // ID của tài sản thế chấp
  collateral_detail?: any | null; // Chi tiết về tài sản dưới dạng JSON: {name: string, attributes: {attr_01: string, ...}}
  loan_amount: number;
  interest_type: InterestType;
  interest_value: number;
  interest_ui_type?: string;    // UI interest type: 'daily', 'monthly_30', 'weekly_percent', etc.
  interest_notation?: string;   // Notation: 'k_per_million', 'percent_per_month', etc.
  loan_period: number;          // Số ngày vay
  interest_period: number;      // Kỳ lãi phí (VD: 10 ngày đóng lãi 1 lần)
  loan_date: string;            // Ngày vay
  notes?: string | null;
  status?: PawnStatus | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CreatePawnParams {
  store_id: string;
  customer_id: string;
  contract_code?: string;
  id_number?: string;
  phone?: string;
  address?: string;
  collateral_id: string;
  collateral_detail?: any;
  loan_amount: number;
  interest_type: InterestType;
  interest_value: number;
  interest_ui_type?: string;
  interest_notation?: string;
  loan_period: number;
  interest_period: number;
  loan_date: string | Date;
  notes?: string;
  status?: PawnStatus;
}

export interface UpdatePawnParams {
  store_id?: string;
  customer_id?: string;
  contract_code?: string;
  id_number?: string;
  phone?: string;
  address?: string;
  collateral_id?: string;
  collateral_detail?: any;
  loan_amount?: number;
  interest_type?: InterestType;
  interest_value?: number;
  interest_ui_type?: string;
  interest_notation?: string;
  loan_period?: number;
  interest_period?: number;
  loan_date?: string | Date;
  notes?: string;
  status?: PawnStatus;
}

// Thông tin hợp đồng với dữ liệu khách hàng và tài sản
export interface PawnWithCustomerAndCollateral extends Pawn {
  customer: {
    name: string;
    phone?: string | null;
    id_number?: string | null;
    address?: string | null;
  };
  collateral_asset?: Collateral | null;
  // Warning fields
  latestPaymentDate?: string | null;
  reason?: string;
  needsWarning?: boolean;
  actualLoanAmount?: number;
  oldDebt?: number;
  interestAmount?: number;
  totalDueAmount?: number;
}

// Thông tin hợp đồng với dữ liệu khách hàng
export interface PawnWithCustomer extends Pawn {
  customer: {
    name: string;
    phone?: string | null;
    id_number?: string | null;
  };
}

export interface PawnFilters {
  contract_code?: string;
  customer_name?: string;
  start_date?: string;
  end_date?: string;
  loan_period?: number;
  status?: PawnStatus | "all";
  store_id?: string;
} 