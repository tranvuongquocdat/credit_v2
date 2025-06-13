import { getExpectedMoney } from './get_expected_money';
import { calculateDebtToLatestPaidPeriod } from './calculate_remaining_debt';
import { calculateActualLoanAmount } from './calculate_actual_loan_amount';
import { calculateCollectedInterest } from './calculate_collected_interest';
import { supabase } from '../supabase';

export interface CreditMetrics {
  creditId: string;
  actualLoanAmount: number;
  oldDebt: number;
  expectedProfit: number;
  paidInterest: number;
  interestToday: number;
  loading: boolean;
  // For summary aggregation
  summaryLoan: number;
  summaryDebt: number;
  summaryProfit: number;
}

export interface CreditData {
  id: string;
  loan_amount: number;
  loan_date: string;
}

/**
 * Tính toán các chỉ số tài chính cho một hợp đồng tín dụng
 * @param credit - Dữ liệu hợp đồng tín dụng
 * @returns Promise<CreditMetrics | null> - Các chỉ số tài chính hoặc null nếu có lỗi
 */
export async function calculateCreditMetrics(
  credit: CreditData
): Promise<CreditMetrics | null> {
  try {
    // Tính toán song song các chỉ số cần thiết
    const [loanAmount, oldDebt, dailyAmounts, paidInterest] = await Promise.all([
      calculateActualLoanAmount(credit.id),
      calculateDebtToLatestPaidPeriod(credit.id),
      getExpectedMoney(credit.id),
      calculateCollectedInterest(credit.id) // Sử dụng hàm mới với xử lý phân trang
    ]);
    
    const expectedProfit = dailyAmounts.reduce((sum, amount) => sum + amount, 0);
    
    // Tính interest to today
    const today = new Date();
    const loanStart = new Date(credit.loan_date);
    const daysSinceLoan = Math.floor((today.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
    const interestToday = dailyAmounts.slice(0, daysSinceLoan + 1).reduce((sum, amount) => sum + amount, 0);
    
    return {
      creditId: credit.id,
      oldDebt: Math.round(oldDebt),
      expectedProfit: Math.round(expectedProfit),
      interestToday: Math.round(interestToday),
      actualLoanAmount: Math.round(loanAmount),
      loading: false,
      // Lãi phí đã thu - đã được tính bằng hàm mới
      paidInterest: paidInterest,
      // Tiền cho vay
      summaryLoan: loanAmount,
      // Nợ cũ
      summaryDebt: oldDebt,
      // Lãi phí dự kiến
      summaryProfit: expectedProfit
    };
  } catch (error) {
    console.error(`Error calculating metrics for credit ${credit.id}:`, error);
    return null;
  }
} 