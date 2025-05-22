/**
 * Database model - maps directly to the installment_payment_period table
 */
export interface InstallmentPaymentPeriodDB {
  id: string;
  installment_id: string;
  period_number: number;      // Kỳ trả góp số mấy
  date: string;               // Ngày dự kiến đóng tiền (ISO format)
  payment_end_date?: string | null; // Ngày kết thúc kỳ (ISO format)
  payment_start_date?: string | null; // Ngày thực tế đã đóng (null nếu chưa đóng)
  expected_amount: number;    // Số tiền dự kiến phải đóng
  actual_amount?: number | null; // Số tiền thực tế đã đóng (null nếu chưa đóng)
  notes?: string | null;      // Ghi chú
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * UI model - what's used in the front-end
 */
export interface InstallmentPaymentPeriod {
  id: string;
  installmentId: string;
  periodNumber: number;
  dueDate: string;            // Ngày dự kiến đóng tiền (format for display)
  endDate?: string;           // Ngày kết thúc kỳ (format for display)
  paymentStartDate?: string;       // Ngày thực tế đã đóng (format for display)
  expectedAmount: number;
  actualAmount?: number;
  notes?: string;
  created?: string;
  updated?: string;
  
  // Computed properties
  remainingAmount?: number;   // Số tiền còn thiếu
  isOverdue: boolean;         // Quá hạn hay chưa
  daysOverdue?: number;       // Số ngày quá hạn
}

/**
 * Parameters for creating a new payment period
 */
export interface CreateInstallmentPaymentPeriodParams {
  installment_id: string;
  period_number: number;
  date: string;
  payment_end_date?: string;
  expected_amount: number;
  actual_amount?: number;
  payment_start_date?: string;
  notes?: string;
}

/**
 * Parameters for updating a payment period
 */
export interface UpdateInstallmentPaymentPeriodParams {
  payment_start_date?: string;
  payment_end_date?: string;
  actual_amount?: number;
  notes?: string;
}

/**
 * Filter parameters for querying payment periods
 */
export interface InstallmentPaymentPeriodFilters {
  installment_id?: string;
  from_date?: string;
  to_date?: string;
} 