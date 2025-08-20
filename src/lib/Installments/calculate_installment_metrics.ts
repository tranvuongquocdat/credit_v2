import {
  getinstallmentPaymentHistory,
  getAllValidPaymentHistory,
  getTotalPaidAmount,
} from './payment_history';
import { calculateDebtToLatestPaidPeriod } from './calculate_remaining_debt';

export interface InstallmentMetrics {
  oldDebt: number;
  profitCollected: number;
  loanAmount: number;
  expectedProfitAmount: number;
}

export interface InstallmentData {
  id: string | null;
  down_payment: number | null;
  installment_amount: number | null;
  loan_period: number | null;
  loan_date: string | null;
  status: "on_time" | "overdue" | "late_interest" | "bad_debt" | "closed" | "deleted" | "finished" | null;
}

interface MetricHelperOptions {
  debtMap?: Map<string, number>;
  paidMap?: Map<string, number>;
  profitMap?: Map<string, number>;
}

/**
 * Tính toán các chỉ số tài chính cho một hợp đồng trả góp
 * @param installment - Dữ liệu hợp đồng trả góp
 * @param options - Các tùy chọn để reuse các kết quả đã tính
 * @returns Promise<InstallmentMetrics | null> - Các chỉ số tài chính hoặc null nếu có lỗi
 */
export async function calculateInstallmentMetrics(
  installment: InstallmentData,
  options?: MetricHelperOptions
): Promise<InstallmentMetrics | null> {
  try {
    if (!installment.id) return null;
    
    /* ---------- 1. Tổng tiền đã đóng ---------- */
    const totalPaid =
      options?.paidMap?.get(installment.id) ??
      (await getTotalPaidAmount(installment.id));
    
    /* ---------- 2. Nợ cũ ---------- */
    const oldDebt =
      options?.debtMap?.get(installment.id) ??
      (await calculateDebtToLatestPaidPeriod(installment.id));
    
    
    /* ---------- 3. Lãi phí đã thu ---------- */
    const profitCollected =
      options?.profitMap?.get(installment.id) ??
      (await calculateProfitCollectedInCurrentMonth(
        installment.id,
        installment.down_payment || 0,
      ));
    
    // Calculate loan amount (amount given to customer)
    const loanAmount = (installment.installment_amount || 0) - totalPaid;
    
    // Calculate expected profit
    const expectedProfitAmount = installment.status === "on_time" 
      ? (installment.installment_amount || 0) - (installment.down_payment || 0)
      : 0;
    
    // Return the metrics
    return {
      oldDebt,
      profitCollected,
      loanAmount,
      expectedProfitAmount
    };
  } catch (error) {
    console.error(`Error calculating metrics for installment ${installment.id}:`, error);
    // Return default values in case of error to prevent UI crashes
    return {
      oldDebt: 0,
      profitCollected: 0,
      loanAmount: 0,
      expectedProfitAmount: 0,
    };
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