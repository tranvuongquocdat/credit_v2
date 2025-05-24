import { add, format, differenceInDays, addDays, isBefore, parseISO } from 'date-fns';
import { Credit, InterestType } from '@/models/credit';
import { CreditPaymentPeriod, CreditPaymentSummary } from '@/models/credit-payment';

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
  console.log(totalPeriods);
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
  
  // Số kỳ đã hoàn thành - đánh dấu kỳ đã hoàn thành nếu actual_amount >= expected_amount
  const completed_periods = periods.filter(p => p.actual_amount >= p.expected_amount).length;
  
  // Số kỳ còn lại
  const remaining_periods = periods.length - completed_periods;
  
  // Tìm kỳ thanh toán tiếp theo (kỳ gần nhất chưa hoàn thành)
  const pendingPeriods = periods
    .filter(p => p.actual_amount < p.expected_amount)
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

/**
 * Tính toán lại các kỳ còn lại sau khi có các kỳ bất thường hoặc có số tiền thêm
 * 
 * @param credit Thông tin khoản vay
 * @param existingPeriods Các kỳ đã tồn tại (bao gồm cả kỳ bất thường)
 * @param nextStartDate Ngày bắt đầu kỳ tiếp theo
 * @param loanEndDate Ngày kết thúc khoản vay
 * @returns Danh sách các kỳ còn lại đã được tính toán lại
 */
export function recalculateRemainingPeriodsAfterIrregular(
  credit: Credit,
  existingPeriods: CreditPaymentPeriod[],
  nextStartDate: Date,
  loanEndDate: Date
): CreditPaymentPeriod[] {
  // Tính tổng số tiền lãi dự kiến cho toàn bộ khoản vay
  const totalExpectedInterest = calculateTotalInterestForLoanDuration(credit, credit.loan_period);
  
  // Tính tổng số tiền đã tính trong các kỳ hiện tại
  const totalExistingAmount = existingPeriods.reduce((sum, period) => {
    return sum + period.expected_amount;
  }, 0);
  
  // Tính số tiền còn lại phải phân bổ cho các kỳ còn lại
  let remainingAmount = totalExpectedInterest - totalExistingAmount;
  
  // Trường hợp lãi đã trả đủ hoặc thậm chí dư, không cần tạo thêm kỳ nào
  if (remainingAmount <= 0) {
    console.log('Lãi đã được thanh toán đủ - không cần thêm kỳ nào');
    return [];
  }
  
  // Tính số ngày còn lại đến ngày kết thúc hợp đồng
  const daysRemaining = differenceInDays(loanEndDate, nextStartDate) + 1;
  
  // Nếu đã qua ngày kết thúc hợp đồng, không tạo thêm kỳ nào nữa
  if (daysRemaining <= 0) {
    return [];
  }
  
  // Chi tiết lãi suất cơ bản
  const defaultPeriodDuration = credit.interest_period;
  
  // Trong trường hợp có số tiền thêm, cũng có nghĩa là ngày kết thúc thực tế có thể sớm hơn
  // Tính toán số ngày cần thiết để trả hết số tiền lãi còn lại
  let daysNeededForRemainingAmount: number;
  
  if (credit.interest_type === InterestType.PERCENTAGE) {
    // Nếu là lãi suất phần trăm, tính số ngày cần có để trả hết số tiền còn lại
    const dailyInterestRate = credit.interest_value / 100 / 30; // Lãi suất hàng ngày
    const dailyAmount = credit.loan_amount * dailyInterestRate * 30;
    daysNeededForRemainingAmount = Math.ceil(remainingAmount / dailyAmount);
  } else {
    // Nếu là lãi suất cố định, tính số ngày cần có
    const dailyAmount = credit.interest_value / credit.interest_period;
    daysNeededForRemainingAmount = Math.ceil(remainingAmount / (dailyAmount * credit.interest_period));
  }
  
  // Đảm bảo số ngày cần thiết không vượt quá số ngày còn lại của hợp đồng
  const actualDaysNeeded = Math.min(daysNeededForRemainingAmount, daysRemaining);
  
  // Cập nhật ngày kết thúc thực tế (có thể sớm hơn ngày kết thúc hợp đồng)
  const actualEndDate = addDays(nextStartDate, actualDaysNeeded - 1);
  
  console.log(`Cần ${actualDaysNeeded} ngày để trả hết ${remainingAmount} tiền còn lại`);
  console.log(`Ngày kết thúc thực tế: ${format(actualEndDate, 'dd/MM/yyyy')} (Ngày kết thúc hợp đồng: ${format(loanEndDate, 'dd/MM/yyyy')})`);

  // Tính số kỳ chuẩn còn lại dựa trên số ngày cần thiết
  const fullPeriodsCount = Math.floor(actualDaysNeeded / defaultPeriodDuration);
  
  // Tính số ngày còn lại cho kỳ cuối
  const remainingDaysForLastPeriod = actualDaysNeeded % defaultPeriodDuration;
  
  // Xác định tổng số kỳ cần tạo
  const periodsRemaining = fullPeriodsCount + (remainingDaysForLastPeriod > 0 ? 1 : 0);
  
  if (periodsRemaining === 0) {
    return []; // Không có kỳ nào cần tạo
  }
  
  // Tính số tiền cho mỗi kỳ chuẩn (chu kỳ đầy đủ)
  const baseAmountPerPeriod = calculateExpectedAmountForDays(credit, defaultPeriodDuration);
  
  // Số tiền còn lại sau khi đã trừ đi các kỳ chuẩn
  let amountForLastPeriod = remainingAmount - (baseAmountPerPeriod * fullPeriodsCount);
  
  // Đảm bảo số tiền kỳ cuối không âm
  if (amountForLastPeriod < 0) {
    amountForLastPeriod = 0;
  }
  
  // Tạo các kỳ còn lại
  const remainingPeriods: CreditPaymentPeriod[] = [];
  let currentStartDate = nextStartDate;
  
  for (let i = 0; i < periodsRemaining; i++) {
    // Tính ngày kết thúc của kỳ này
    let periodEndDate;
    let expectedAmount;
    
    if (i === periodsRemaining - 1 && remainingDaysForLastPeriod > 0) {
      // Kỳ cuối cùng (có thể ngắn hơn kỳ tiêu chuẩn)
      periodEndDate = actualEndDate; // Sử dụng ngày kết thúc thực tế đã tính toán
      expectedAmount = amountForLastPeriod;
    } else {
      // Các kỳ chuẩn đầy đủ
      periodEndDate = addDays(currentStartDate, defaultPeriodDuration - 1);
      expectedAmount = baseAmountPerPeriod;
    }
    
    // Số tiền đã được tính ở trên
    
    // Tạo kỳ mới
    const newPeriod: CreditPaymentPeriod = {
      id: '',
      credit_id: credit.id,
      period_number: existingPeriods.length + i + 1, // Số thứ tự tạm thời, sẽ được tính lại sau
      start_date: format(currentStartDate, 'yyyy-MM-dd'),
      end_date: format(periodEndDate, 'yyyy-MM-dd'),
      expected_amount: Math.round(expectedAmount),
      actual_amount: 0,
      payment_date: null,
      notes: ''
    };
    
    remainingPeriods.push(newPeriod);
    
    // Cập nhật ngày bắt đầu cho kỳ tiếp theo
    currentStartDate = addDays(periodEndDate, 1);
  }
  
  return remainingPeriods;
}

/**
 * Tính toán số tiền kỳ cuối cùng chính xác khi có các kỳ bất thường
 * 
 * @param credit Thông tin khoản vay
 * @param previousPeriods Danh sách các kỳ thanh toán trước đó
 * @param startDate Ngày bắt đầu kỳ cuối cùng
 * @param endDate Ngày kết thúc kỳ cuối cùng (thường là ngày kết thúc hợp đồng)
 * @returns Số tiền dự kiến cho kỳ cuối cùng
 */
export function calculateLastPeriodAmount(
  credit: Credit,
  previousPeriods: CreditPaymentPeriod[],
  startDate: Date,
  endDate: Date
): number {
  // Tính tổng tiền lãi của toàn bộ khoản vay
  const totalExpectedAmount = calculateTotalInterestForLoanDuration(credit, credit.loan_period);
  
  // Tính tổng tiền lãi đã tính cho các kỳ trước đó
  const totalPreviousAmount = previousPeriods.reduce((sum, period) => {
    return sum + period.expected_amount;
  }, 0);
  
  // Số tiền kỳ cuối = Tổng tiền lãi - Tổng tiền các kỳ trước
  let lastPeriodAmount = totalExpectedAmount - totalPreviousAmount;
  
  // Đảm bảo số tiền không âm
  if (lastPeriodAmount < 0) {
    lastPeriodAmount = 0;
  }
  
  return Math.round(lastPeriodAmount);
}

/**
 * Tính tổng tiền lãi cho toàn bộ khoản vay dựa trên số ngày
 */
export function calculateTotalInterestForLoanDuration(
  credit: Credit,
  totalDays: number
): number {
  const { 
    loan_amount, 
    interest_type, 
    interest_value,
    interest_period
  } = credit;
  
  let totalAmount = 0;
  
  if (interest_type === InterestType.PERCENTAGE) {
    // Nếu là lãi suất phần trăm
    const dailyInterestRate = interest_value / 100 / 30; // Lãi suất hàng ngày
    totalAmount = loan_amount * dailyInterestRate * totalDays * 30;
  } else {
    // Nếu là số tiền cố định
    const dailyAmount = interest_value / interest_period;
    totalAmount = dailyAmount * totalDays * interest_period;
  }
  
  return Math.round(totalAmount);
}

/**
 * Tính số tiền lãi cho một số ngày cụ thể
 */
export function calculateExpectedAmountForDays(
  credit: Credit,
  days: number
): number {
  const { 
    loan_amount, 
    interest_type, 
    interest_value,
    interest_period
  } = credit;
  
  let amount = 0;
  
  if (interest_type === InterestType.PERCENTAGE) {
    // Nếu là lãi suất phần trăm
    const dailyInterestRate = interest_value / 100 / 30; // Lãi suất hàng ngày
    amount = loan_amount * dailyInterestRate * days * 30;
  } else {
    // Nếu là số tiền cố định
    const dailyAmount = interest_value / interest_period;
    amount = dailyAmount * days * interest_period;
  }
  
  return Math.round(amount);
}
