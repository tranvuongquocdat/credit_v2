import { add, format, differenceInDays, addDays, isBefore, parseISO } from 'date-fns';
import { Credit, InterestType } from '@/models/credit';
import { CreditPaymentPeriod, PaymentPeriodStatus, CreditPaymentSummary } from '@/models/credit-payment';

/**
 * Tính toán danh sách các kỳ đóng lãi dựa trên thông tin hợp đồng
 */
export function calculatePaymentPeriods(credit: Credit): CreditPaymentPeriod[] {
  // Lấy thông tin từ credit
  const {
    id: credit_id,
    loan_date,
    loan_period, // Số ngày vay
    interest_period, // Kỳ lãi phí (VD: 10 ngày đóng lãi 1 lần)
    interest_type,
    interest_value,
    loan_amount
  } = credit;
  
  // Tính số kỳ thanh toán
  const totalPeriods = Math.ceil(loan_period / interest_period);
  
  // Tính tổng số tiền lãi phải trả
  let totalInterestAmount: number;
  
  if (interest_type === InterestType.PERCENTAGE) {
    // Nếu là lãi suất phần trăm
    // Công thức mới: loan_amount * (interest_value / 100) * loan_period
    totalInterestAmount = loan_amount * (interest_value / 100) * loan_period;
  } else {
    // Nếu là số tiền cố định
    totalInterestAmount = interest_value;
  }
  
  // Tính số tiền lãi mỗi kỳ
  const amountPerPeriod = Math.floor(totalInterestAmount / totalPeriods);
  // Số tiền còn dư sẽ được cộng vào kỳ cuối cùng
  const remainingAmount = totalInterestAmount - (amountPerPeriod * (totalPeriods - 1));
  
  // Ngày kết thúc hợp đồng
  const startDate = parseISO(loan_date);
  const endDate = addDays(startDate, loan_period);
  
  const periods: CreditPaymentPeriod[] = [];
  
  // Khởi tạo mảng để lưu trữ các kỳ thanh toán
  let currentStartDate = startDate;

  for (let i = 0; i < totalPeriods; i++) {
    // Mỗi kỳ bắt đầu ngay khi kỳ trước kết thúc 
    // (hoặc từ startDate nếu là kỳ đầu tiên)
    const periodStartDate = currentStartDate;
      
    // Ngày kết thúc kỳ = ngày bắt đầu + kỳ lãi phí
    const periodEndDate = addDays(periodStartDate, interest_period);
    
    // Đảm bảo kỳ cuối cùng không vượt quá ngày kết thúc hợp đồng
    const actualEndDate = isBefore(endDate, periodEndDate) ? endDate : periodEndDate;
    
    // Cập nhật ngày bắt đầu cho kỳ tiếp theo
    // Kỳ tiếp theo sẽ bắt đầu từ ngày kết thúc của kỳ này (actualEndDate) + 1 ngày
    // Sử dụng addDays(actualEndDate, 1) để tránh trùng lắp ngày giữa các kỳ
    currentStartDate = addDays(actualEndDate, 1);
    
    periods.push({
      id: '', // ID sẽ được DB tạo khi insert
      credit_id,
      period_number: i + 1,
      start_date: format(periodStartDate, 'yyyy-MM-dd'),
      end_date: format(actualEndDate, 'yyyy-MM-dd'),
      expected_amount: i === totalPeriods - 1 ? remainingAmount : amountPerPeriod,
      actual_amount: 0,
      payment_date: null,
      status: PaymentPeriodStatus.PENDING,
      notes: null
    });
  }
  
  return periods;
}

/**
 * Tính toán thông tin tổng hợp về các kỳ đóng lãi
 */
export function calculatePaymentSummary(periods: CreditPaymentPeriod[]): CreditPaymentSummary {
  if (!periods || periods.length === 0) {
    return {
      total_expected: 0,
      total_paid: 0,
      next_payment_date: null,
      remaining_periods: 0,
      completed_periods: 0
    };
  }
  
  // Tổng số tiền dự kiến
  const total_expected = periods.reduce((sum, period) => sum + period.expected_amount, 0);
  
  // Tổng số tiền đã đóng
  const total_paid = periods.reduce((sum, period) => sum + period.actual_amount, 0);
  
  // Số kỳ đã hoàn thành
  const completed_periods = periods.filter(p => p.status === PaymentPeriodStatus.PAID).length;
  
  // Số kỳ còn lại
  const remaining_periods = periods.length - completed_periods;
  
  // Tìm kỳ thanh toán tiếp theo (kỳ gần nhất chưa hoàn thành)
  const pendingPeriods = periods
    .filter(p => p.status === PaymentPeriodStatus.PENDING || p.status === PaymentPeriodStatus.PARTIALLY_PAID)
    .sort((a, b) => {
      const dateA = parseISO(a.end_date);
      const dateB = parseISO(b.end_date);
      return dateA.getTime() - dateB.getTime();
    });
  
  const next_payment_date = pendingPeriods.length > 0 ? pendingPeriods[0].end_date : null;
  
  return {
    total_expected,
    total_paid,
    next_payment_date,
    remaining_periods,
    completed_periods
  };
}

/**
 * Tạo một kỳ đóng lãi tùy chỉnh
 */
export function createCustomPaymentPeriod(
  credit: Credit, 
  startDate: string, 
  endDate: string, 
  amount: number
): CreditPaymentPeriod {
  return {
    id: '',
    credit_id: credit.id,
    period_number: 0, // Sẽ được cập nhật sau
    start_date: startDate,
    end_date: endDate,
    expected_amount: amount,
    actual_amount: 0,
    payment_date: null,
    status: PaymentPeriodStatus.PENDING,
    notes: 'Kỳ thanh toán tùy chỉnh'
  };
}

/**
 * Tính toán lại số thứ tự của các kỳ thanh toán
 */
export function recalculatePeriodNumbers(periods: CreditPaymentPeriod[]): CreditPaymentPeriod[] {
  // Sắp xếp theo ngày bắt đầu
  const sortedPeriods = [...periods].sort((a, b) => {
    const dateA = parseISO(a.start_date);
    const dateB = parseISO(b.start_date);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Cập nhật số thứ tự
  return sortedPeriods.map((period, index) => ({
    ...period,
    period_number: index + 1
  }));
}

/**
 * Tính toán số tiền dự kiến dựa trên khoảng thời gian
 */
export function calculateExpectedAmountForDateRange(
  credit: Credit,
  startDate: Date,
  endDate: Date
): number {
  const { 
    loan_amount, 
    interest_type, 
    interest_value,
    interest_period
  } = credit;
  
  // Normalize dates to calculate exact calendar days (not 24-hour periods)
  const normalizedStartDate = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );
  const normalizedEndDate = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );
  
  // Tính số ngày trong khoảng thời gian (bao gồm cả 2 ngày đầu và cuối)
  const days = differenceInDays(normalizedEndDate, normalizedStartDate) + 1;
  
  // Tính số tiền lãi dựa trên số ngày
  let amount = 0;
  
  if (interest_type === InterestType.PERCENTAGE) {
    // Nếu là lãi suất phần trăm
    // Số tiền lãi chuẩn cho 1 ngày
    const dailyInterestRate = interest_value / 100 / 30; // Lãi suất hàng ngày
    
    // Công thức: Số tiền vay * lãi suất hàng ngày * số ngày * interest_period (30 ngày)
    amount = loan_amount * dailyInterestRate * days * 30;
  } else {
    // Nếu là số tiền cố định, tính tỷ lệ theo ngày
    const dailyAmount = interest_value / interest_period;
    amount = dailyAmount * days * interest_period;
  }
  
  return Math.round(amount);
}
