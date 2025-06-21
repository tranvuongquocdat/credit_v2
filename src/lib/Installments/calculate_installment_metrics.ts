import { getinstallmentPaymentHistory, getinstallmentPaymentHistoryByDateRange, getAllValidPaymentHistory, getAllValidPaymentHistoryByDateRange } from './payment_history';
import { calculateDebtToLatestPaidPeriod } from './calculate_remaining_debt';

export interface InstallmentMetrics {
  oldDebt: number;
  profitCollected: number;
  loanAmount: number;
  expectedProfitAmount: number;
  interestStartDate: string;
}

export interface InstallmentData {
  id: string | null;
  down_payment: number | null;
  installment_amount: number | null;
  loan_period: number | null;
  loan_date: string | null;
  status: "on_time" | "overdue" | "late_interest" | "bad_debt" | "closed" | "deleted" | "finished" | null;
}

/**
 * Tính toán các chỉ số tài chính cho một hợp đồng trả góp
 * @param installment - Dữ liệu hợp đồng trả góp
 * @returns Promise<InstallmentMetrics | null> - Các chỉ số tài chính hoặc null nếu có lỗi
 */
export async function calculateInstallmentMetrics(
  installment: InstallmentData
): Promise<InstallmentMetrics | null> {
  try {
    // Skip if installment.id is null
    if (!installment.id) return null;
    
    // Get payment history and calculate total paid
    const paymentHistory = await getinstallmentPaymentHistory(installment.id);
    const totalPaidFromHistory = paymentHistory.reduce((sum, record) => sum + (record.credit_amount || 0), 0);
    
    // Calculate old debt
    const oldDebt = await calculateDebtToLatestPaidPeriod(installment.id);
    // 1. Calculate interest start date
    const interestStartDate = calculateInterestStartDate(
      installment.down_payment || 0,
      installment.installment_amount || 0,
      installment.loan_period || 0,
      installment.loan_date || new Date().toISOString()
    );
    
    // 2. Calculate profit collected based on the new formula
    const profitCollected = await calculateProfitCollectedInCurrentMonth(
      installment.id,
      installment.down_payment || 0
    );
    
    // Calculate loan amount (amount given to customer)
    const loanAmount = Math.max(0, (installment.down_payment || 0) - totalPaidFromHistory);
    
    // Calculate expected profit
    const expectedProfitAmount = installment.status === "on_time" 
      ? (installment.installment_amount || 0) - (installment.down_payment || 0)
      : 0;
    
    // Return the metrics
    return {
      oldDebt,
      profitCollected,
      loanAmount,
      expectedProfitAmount,
      interestStartDate
    };
  } catch (error) {
    console.error(`Error calculating metrics for installment ${installment.id}:`, error);
    // Return default values in case of error to prevent UI crashes
    return {
      oldDebt: 0,
      profitCollected: 0,
      loanAmount: 0,
      expectedProfitAmount: 0,
      interestStartDate: new Date().toISOString()
    };
  }
}

/**
 * Tính ngày bắt đầu ghi nhận lãi
 * @param downPayment - Số tiền đặt cọc
 * @param installmentAmount - Tổng số tiền trả góp
 * @param loanPeriod - Thời gian vay (số ngày)
 * @param loanDate - Ngày bắt đầu vay
 * @returns string - Ngày bắt đầu tính lãi (ISO string)
 */
function calculateInterestStartDate(
  downPayment: number,
  installmentAmount: number,
  loanPeriod: number,
  loanDate: string
): string {
  try {
    // Validate input
    if (!loanDate) {
      return new Date().toISOString(); // Default to current date if loan_date is missing
    }
    
    if (!loanPeriod || loanPeriod <= 0 || 
        !installmentAmount || installmentAmount <= 0 ||
        !downPayment || downPayment <= 0) {
      return loanDate; // Return loan_date if any required value is invalid
    }
    
    // Tính tỉ lệ tiền đặt cọc so với tổng số tiền
    const ratio = Math.min(downPayment / installmentAmount, 1); // Ensure ratio doesn't exceed 1
    
    // Tính số ngày hoàn vốn (số ngày để tiền trả đủ tiền đặt cọc)
    const daysToBreakEven = Math.ceil(ratio * loanPeriod);
    
    // Tính ngày bắt đầu lãi = ngày vay + số ngày hoàn vốn
    const loanDateObj = new Date(loanDate);
    const interestStartDateObj = new Date(loanDateObj);
    interestStartDateObj.setDate(loanDateObj.getDate() + daysToBreakEven);
    return interestStartDateObj.toISOString();
  } catch (error) {
    console.error('Error calculating interest start date:', error);
    return loanDate; // Return original loan date in case of error
  }
}

/**
 * Tính lãi phí đã thu theo công thức mới
 * A = Tổng credit_amount từ đầu đến cuối tháng trước - down_payment (nếu âm thì = 0)
 * B = Tổng credit_amount từ đầu đến cuối tháng này - down_payment (nếu âm thì = 0)
 * Kết quả = B - A
 * @param installmentId - ID của hợp đồng installment
 * @param downPayment - Số tiền đặt cọc của hợp đồng
 * @returns Promise<number> - Lãi phí đã thu
 */
async function calculateProfitCollectedInCurrentMonth(
  installmentId: string,
  downPayment: number
): Promise<number> {
  try {
    const today = new Date();
    
    // Tính ngày cuối cùng của tháng trước
    const lastDayOfPreviousMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const lastDayOfPreviousMonthStr = lastDayOfPreviousMonth.toISOString().split('T')[0];
    
    // Tính ngày cuối cùng của tháng hiện tại
    const lastDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const lastDayOfCurrentMonthStr = lastDayOfCurrentMonth.toISOString().split('T')[0];
    
    // Lấy toàn bộ lịch sử thanh toán với is_deleted=false từ đầu đến cuối tháng trước
    const historyToLastMonth = await getAllValidPaymentHistory(
      installmentId,
      lastDayOfPreviousMonthStr
    );
    
    // Lấy toàn bộ lịch sử thanh toán với is_deleted=false từ đầu đến cuối tháng hiện tại
    const historyToCurrentMonth = await getAllValidPaymentHistory(
      installmentId,
      lastDayOfCurrentMonthStr
    );
    
    // Tính A: Tổng credit_amount đến cuối tháng trước - down_payment
    const totalCreditToLastMonth = historyToLastMonth.reduce((sum, record) => {
      return sum + (record.credit_amount || 0);
    }, 0);
    const a = Math.max(0, totalCreditToLastMonth - downPayment);
    
    // Tính B: Tổng credit_amount đến cuối tháng hiện tại - down_payment
    const totalCreditToCurrentMonth = historyToCurrentMonth.reduce((sum, record) => {
      return sum + (record.credit_amount || 0);
    }, 0);
    const b = Math.max(0, totalCreditToCurrentMonth - downPayment);
    
    // Kết quả = B - A
    const profitCollected = b - a;
    
    
    return profitCollected;
  } catch (error) {
    console.error('Error calculating profit collected with new formula:', error);
    return 0; // Return 0 in case of error
  }
} 