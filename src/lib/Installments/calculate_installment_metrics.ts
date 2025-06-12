import { getinstallmentPaymentHistory, getinstallmentPaymentHistoryByDateRange } from './payment_history';
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
    
    // Log for debugging
    console.debug(`Installment ${installment.id} - Interest start date: ${interestStartDate}`);
    
    // 2. Calculate profit collected based on the new formula
    const profitCollected = await calculateProfitCollectedInCurrentMonth(
      installment.id,
      interestStartDate
    );
    
    // Log profit collected for debugging
    console.debug(`Installment ${installment.id} - Profit collected: ${profitCollected}`);
    
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
    console.log('interestStartDateObj', interestStartDateObj);
    return interestStartDateObj.toISOString();
  } catch (error) {
    console.error('Error calculating interest start date:', error);
    return loanDate; // Return original loan date in case of error
  }
}

/**
 * Tính lãi phí đã thu trong tháng hiện tại và sau ngày bắt đầu lãi
 * @param installmentId - ID của hợp đồng installment
 * @param interestStartDate - Ngày bắt đầu tính lãi
 * @returns Promise<number> - Lãi phí đã thu
 */
async function calculateProfitCollectedInCurrentMonth(
  installmentId: string,
  interestStartDate: string
): Promise<number> {
  try {
    // Lấy mùng 1 của tháng hiện tại
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Lấy ngày cuối cùng của tháng hiện tại
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    // Format dates as YYYY-MM-DD
    const firstDayStr = firstDayOfMonth.toISOString().split('T')[0];
    const lastDayStr = lastDayOfMonth.toISOString().split('T')[0];
    
    // Chuyển interestStartDate thành Date object để so sánh
    const interestStartDateObj = new Date(interestStartDate);
    const interestStartDateStr = interestStartDateObj.toISOString().split('T')[0];
    
    // Lấy lịch sử giao dịch trong tháng hiện tại
    const monthlyHistory = await getinstallmentPaymentHistoryByDateRange(
      installmentId,
      firstDayStr,
      lastDayStr
    );
    
    // Lọc các giao dịch có effective_date >= ngày bắt đầu lãi
    const profitRecords = monthlyHistory.filter(record => {
      if (!record.effective_date) return false;
      
      // Extract date part and create Date object for comparison
      const recordDateStr = record.effective_date.split('T')[0];
      const recordDate = new Date(recordDateStr);
      
      // Compare dates
      return recordDate >= interestStartDateObj;
    });
    
    // Tổng lãi phí đã thu = tổng các giao dịch thỏa điều kiện
    const profitCollected = profitRecords.reduce((sum, record) => {
      return sum + (record.credit_amount || 0);
    }, 0);
    
    return profitCollected;
  } catch (error) {
    console.error('Error calculating profit collected in current month:', error);
    return 0; // Return 0 in case of error
  }
} 