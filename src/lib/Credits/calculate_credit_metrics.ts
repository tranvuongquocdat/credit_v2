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
  loan_period: number;
}

// Tùy chọn nhận thêm các map đã tính sẵn để tránh query lặp
interface MetricHelperOptions {
  interestMap?: Map<string, number>;
  principalMap?: Map<string, number>;
  debtMap?: Map<string, number>;
  expectedMap?: Map<string, number>;
  todayMap?: Map<string, number>;
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
    const [loanAmount, oldDebt, expectedProfit, interestToday, paidInterest] = await Promise.all([
      /* loanAmount */ (
        options?.principalMap?.get(credit.id) ??
        calculateActualLoanAmount(credit.id)
      ),
      /* oldDebt */ (
        options?.debtMap?.get(credit.id) ??
        calculateDebtToLatestPaidPeriod(credit.id)
      ),
      /* expected profit */ (async () => {
        const cached = options?.expectedMap?.get(credit.id);
        if (typeof cached === 'number') return cached;
        // Fallback: call calc_expected_until to loan end
        const loanStart = new Date(credit.loan_date);
        const loanEnd = new Date(loanStart.getTime() + (credit.loan_period - 1) * 86400000);
        const { data } = await (supabase.rpc as any)('calc_expected_until', {
          p_credit_id: credit.id,
          p_end_date: loanEnd.toISOString().slice(0, 10),
        });
        return Number(data ?? 0);
      })(),
      /* interest today */ (async () => {
        const cached = options?.todayMap?.get(credit.id);
        if (typeof cached === 'number') return cached;
        const { data } = await (supabase.rpc as any)('calc_expected_until', {
          p_credit_id: credit.id,
          p_end_date: new Date().toISOString().slice(0, 10),
        });
        return Number(data ?? 0);
      })(),
      /* paid interest */ (async () => {
        const cached = options?.interestMap?.get(credit.id);
        if (typeof cached === 'number') return cached;
        return calculateCollectedInterest(credit.id);
      })(),
    ]);
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