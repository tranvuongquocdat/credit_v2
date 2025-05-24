export interface CreditPaymentPeriod {
  id: string;
  credit_id: string;
  period_number: number; // Kỳ thứ mấy (1, 2, 3...)
  start_date: string; // Ngày bắt đầu kỳ
  end_date: string; // Ngày kết thúc kỳ
  expected_amount: number; // Số tiền dự kiến
  actual_amount: number; // Số tiền thực tế đã đóng
  payment_date: string | null; // Ngày đóng lãi
  notes: string | null; // Ghi chú
  other_amount?: number | null; // Tiền khác
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CreatePaymentPeriodData {
  credit_id: string;
  period_number: number;
  start_date: string;
  end_date: string;
  expected_amount: number;
  notes?: string;
}

export interface UpdatePaymentPeriodData {
  actual_amount?: number;
  payment_date?: string | null;
  expected_amount?: number;
  start_date?: string;
  end_date?: string;
  notes?: string;
}

export interface CreditPaymentSummary {
  total_expected: number; // Tổng số tiền lãi phí dự kiến
  total_paid: number; // Tổng số tiền lãi phí đã đóng
  next_payment_date: string | null; // Ngày đóng lãi gần nhất tiếp theo
  remaining_periods: number; // Số kỳ còn lại
  completed_periods: number; // Số kỳ đã hoàn thành
}

// Interface để tạo kỳ đóng lãi tùy chỉnh
export interface CustomPaymentPeriodData {
  credit_id: string;
  start_date: string;
  end_date: string;
  expected_amount: number;
  notes?: string;
}
