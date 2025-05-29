import { InstallmentWithCustomer } from "@/models/installment";
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";
import { InstallmentAmountHistory } from "@/lib/installmentAmountHistory";

/**
 * Tính tổng số tiền đã đóng dựa trên lịch sử giao dịch
 */
export const calculateTotalPaidFromHistory = (amountHistory: InstallmentAmountHistory[]): number => {
  if (!amountHistory || amountHistory.length === 0) return 0;

  return amountHistory.reduce((total: number, history: InstallmentAmountHistory) => {
    if (history.transactionType === 'payment' || 
        history.transactionType === 'payment_cancel' ||
        history.transactionType === 'debt_payment') {
      return total + (history.creditAmount || 0) - (history.debitAmount || 0);
    }
    return total;
  }, 0);
};

/**
 * Tính số tiền còn lại phải đóng (chung cho cả ứng dụng)
 */
export const calculateRemainingToPay = (
  installment: InstallmentWithCustomer, 
  totalPaid: number
): number => {
  // Tổng tiền phải trả 
  const totalAmount = installment?.installment_amount || 0;
  
  // Số tiền còn lại = tổng tiền phải trả - đã đóng
  return totalAmount - totalPaid;
};

/**
 * Tính số kỳ còn lại
 */
export const calculateRemainingPeriods = (
  installment: InstallmentWithCustomer,
  paymentPeriods: InstallmentPaymentPeriod[]
): number => {
  if (!installment?.duration || !installment?.payment_period) return 0;
  
  // Tính tổng số kỳ của hợp đồng
  const totalPeriods = Math.ceil(installment.duration / installment.payment_period);
  
  // Tính số kỳ đã thanh toán
  const paidPeriods = paymentPeriods.filter(p => p.actualAmount && p.actualAmount > 0).length;
  
  // Trả về số kỳ còn lại
  return Math.max(0, totalPeriods - paidPeriods);
};

/**
 * Tính số tiền một ngày (daily amount)
 */
export const calculateDailyAmount = (installment: InstallmentWithCustomer): number => {
  // Get installment_amount, either directly or calculate it
  const installmentAmount = installment.installment_amount || 
    (installment.daily_amount * installment.payment_period);
  
  // Calculate daily amount based on duration (loan_period)
  return installment.duration > 0 ? 
    installmentAmount / installment.duration : 
    installment.daily_amount;
};

/**
 * Tính tỷ lệ "10 ăn X"
 */
export const calculateRatio = (installment: InstallmentWithCustomer): string => {
  try {
    // Get the values
    const installmentAmount = 
      installment.installment_amount ? 
      installment.installment_amount : 
      (installment.daily_amount * installment.payment_period);
    
    const downAmount = installment.amount_given;
    
    // Calculate ratio: if installment is 10, what is the down payment value
    const ratio = 10 / installmentAmount * downAmount;
    
    // Format to remove decimal if it's a whole number
    const formatValue = (value: number) => 
      Math.abs(value % 1) < 0.05 ? Math.round(value).toString() : value.toFixed(1);
    
    return `10 ăn ${formatValue(ratio)}`;
  } catch (error) {
    // Fallback to showing percentage
    return `-`;
  }
}; 