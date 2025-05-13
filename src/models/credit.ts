export enum InterestType {
  PERCENTAGE = 'percentage', // Hình thức lãi theo phần trăm
  FIXED_AMOUNT = 'fixed_amount' // Hình thức lãi theo số tiền cố định
}

export enum CreditStatus {
  ON_TIME = 'on_time',          // Đúng hẹn
  OVERDUE = 'overdue',          // Quá hạn
  LATE_INTEREST = 'late_interest', // Chậm lãi
  BAD_DEBT = 'bad_debt',        // Nợ xấu
  CLOSED = 'closed',           // Kết thúc (hoặc đóng hợp đồng sớm)
  DELETED = 'deleted'           // Đã xóa
}

export interface Credit {
  id: string;
  store_id: string;
  customer_id: string;
  contract_code?: string | null;
  id_number?: string | null;
  phone?: string | null;
  address?: string | null;
  collateral?: string | null;
  loan_amount: number;
  interest_type: InterestType;
  interest_value: number;
  loan_period: number;       // Số ngày vay
  interest_period: number;   // Kỳ lãi phí (VD: 10 ngày đóng lãi 1 lần)
  loan_date: string;         // Ngày vay
  notes?: string | null;
  status?: CreditStatus | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CreateCreditParams {
  store_id: string;
  customer_id: string;
  contract_code?: string;
  id_number?: string;
  phone?: string;
  address?: string;
  collateral?: string;
  loan_amount: number;
  interest_type: InterestType;
  interest_value: number;
  loan_period: number;
  interest_period: number;
  loan_date: string | Date;
  notes?: string;
  status?: CreditStatus;
}

export interface UpdateCreditParams {
  store_id?: string;
  customer_id?: string;
  contract_code?: string;
  id_number?: string;
  phone?: string;
  address?: string;
  collateral?: string;
  loan_amount?: number;
  interest_type?: InterestType;
  interest_value?: number;
  loan_period?: number;
  interest_period?: number;
  loan_date?: string | Date;
  notes?: string;
  status?: CreditStatus;
}

// Thông tin hợp đồng với dữ liệu khách hàng
export interface CreditWithCustomer extends Credit {
  customer: {
    name: string;
    phone?: string | null;
    id_number?: string | null;
  };
}
