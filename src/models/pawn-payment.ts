export interface PawnPaymentPeriod {
  id: string;
  pawn_id: string;
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

export interface CreatePawnPaymentPeriodData {
  pawn_id: string;
  period_number: number;
  start_date: string;
  end_date: string;
  expected_amount: number;
  notes?: string;
}

export interface BulkCreatePawnPaymentPeriodsData {
  pawn_id: string;
  periods: Omit<CreatePawnPaymentPeriodData, 'pawn_id'>[];
}

export interface UpdatePawnPaymentPeriodData {
  actual_amount?: number;
  payment_date?: string | null;
  notes?: string;
  other_amount?: number;
}

// Interface để tạo kỳ đóng lãi tùy chỉnh
export interface CustomPawnPaymentPeriodData {
  pawn_id: string;
  start_date: string;
  end_date: string;
  expected_amount: number;
  notes?: string;
} 