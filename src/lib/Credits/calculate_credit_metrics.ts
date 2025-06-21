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

// Tùy chọn nhận thêm các map đã tính sẵn để tránh query lặp
interface MetricHelperOptions {
  interestMap?: Map<string, number>;
  principalMap?: Map<string, number>;
  debtMap?: Map<string, number>;
}

/**
 * Tính toán các chỉ số tài chính cho một hợp đồng tín dụng
 * @param credit - Dữ liệu hợp đồng tín dụng
 * @param options - Tùy chọn nhận thêm các map đã tính sẵn để tránh query lặp
 * @returns Promise<CreditMetrics | null> - Các chỉ số tài chính hoặc null nếu có lỗi
 */
export async function calculateCreditMetrics(
  credit: CreditData,
  options?: MetricHelperOptions
): Promise<CreditMetrics | null> {
  try {
    // 1. actual loan amount – ưu tiên map
    const loanAmountPromise = ((): Promise<number> => {
      const cached = options?.principalMap?.get(credit.id);
      if (typeof cached === 'number') return Promise.resolve(cached);
      return calculateActualLoanAmount(credit.id);
    })();

    const [loanAmount, oldDebt, dailyAmounts, paidInterest] = await Promise.all([
      /* loanAmount */ (
        options?.principalMap?.get(credit.id) ??
        calculateActualLoanAmount(credit.id)
      ),
      /* oldDebt */ (
        options?.debtMap?.get(credit.id) ??
        calculateDebtToLatestPaidPeriod(credit.id)
      ),
      getExpectedMoney(credit.id),
      // 2. paid interest – ưu tiên map
      (async () => {
        const cached = options?.interestMap?.get(credit.id);
        if (typeof cached === 'number') return cached;
        return calculateCollectedInterest(credit.id);
      })()
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
      // Lãi phí đã thu
      paidInterest,
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