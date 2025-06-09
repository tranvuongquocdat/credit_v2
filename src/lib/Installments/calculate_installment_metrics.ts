import { getinstallmentPaymentHistory } from './payment_history';
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
    
    const paymentHistory = await getinstallmentPaymentHistory(installment.id);
    const totalPaidFromHistory = paymentHistory.reduce((sum, record) => sum + (record.credit_amount || 0), 0);
    
    // Tính nợ cũ
    const oldDebt = await calculateDebtToLatestPaidPeriod(installment.id);
    
    // Tính lãi phí đã thu: totalPaidFromHistory - down_payment (nếu dương)
    const profitCollected = Math.max(0, totalPaidFromHistory - (installment.down_payment || 0));
    
    // Tính tổng tiền cho vay (tiền giao khách): down_payment - totalPaidFromHistory (nếu dương)
    const loanAmount = Math.max(0, (installment.down_payment || 0) - totalPaidFromHistory);
    
    // Lãi phí dự kiến = installment_amount - down_payment
    const expectedProfitAmount = installment.status === "on_time" 
      ? (installment.installment_amount || 0) - (installment.down_payment || 0)
      : 0;
    
    return {
      oldDebt,
      profitCollected,
      loanAmount,
      expectedProfitAmount
    };
  } catch (error) {
    console.error(`Error calculating metrics for installment ${installment.id}:`, error);
    return null;
  }
} 