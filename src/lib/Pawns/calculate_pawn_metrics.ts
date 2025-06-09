import { supabase } from '@/lib/supabase';
import { calculateActualLoanAmount } from './calculate_actual_loan_amount';
import { calculateDebtToLatestPaidPeriod } from './calculate_remaining_debt';
import { getExpectedMoney } from './get_expected_money';

export interface PawnMetrics {
  pawnId: string;
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

export interface PawnData {
  id: string;
  loan_amount: number;
  loan_date: string;
  interest_value: number;
  interest_type: string;
  loan_period: number;
  interest_period: number;
}

/**
 * Tính toán các chỉ số tài chính cho một hợp đồng cầm đồ
 * @param pawn - Dữ liệu hợp đồng cầm đồ
 * @returns Promise<PawnMetrics | null> - Các chỉ số tài chính hoặc null nếu có lỗi
 */
export async function calculatePawnMetrics(
  pawn: PawnData
): Promise<PawnMetrics | null> {
  try {
    // Calculate actual loan amount including additional loans and principal repayments
    const actualLoanAmount = await calculateActualLoanAmount(pawn.id);
    
    // Calculate old debt from payment history
    const { data: paymentHistory } = await supabase
      .from('pawn_history')
      .select('credit_amount, debit_amount, transaction_type, is_deleted')
      .eq('pawn_id', pawn.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
    
    // Calculate paid interest
    const paidInterest = paymentHistory
      ?.filter(record => record.transaction_type === 'payment')
      .reduce((sum, record) => sum + (record.credit_amount || 0), 0) || 0;
    
    // Calculate old debt (similar to credits logic)
    const oldDebt = await calculateDebtToLatestPaidPeriod(pawn.id);
    
    // Calculate expected profit using getExpectedMoney (sum of all daily interest)
    const expectedMoneyArray = await getExpectedMoney(pawn.id);
    const expectedProfit = expectedMoneyArray.reduce((sum, amount) => sum + amount, 0);
    
    // Calculate interest to today
    const today = new Date();
    const loanStart = new Date(pawn.loan_date);
    const daysSinceLoan = Math.floor((today.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
    const daysToCalculate = Math.min(Math.max(0, daysSinceLoan + 1), expectedMoneyArray.length);
    const interestToday = expectedMoneyArray.slice(0, daysToCalculate).reduce((sum, amount) => sum + amount, 0);
    
    return {
      pawnId: pawn.id,
      oldDebt: Math.round(oldDebt),
      expectedProfit: Math.round(expectedProfit),
      interestToday: Math.round(interestToday),
      actualLoanAmount: Math.round(actualLoanAmount),
      loading: false,
      // Lãi phí đã thu
      paidInterest: Math.round(paidInterest),
      // For summary
      // Tiền cho vay
      summaryLoan: actualLoanAmount,
      // Nợ cũ
      summaryDebt: oldDebt,
      // Lãi phí dự kiến
      summaryProfit: expectedProfit
    };
  } catch (error) {
    console.error(`Error calculating metrics for pawn ${pawn.id}:`, error);
    return null;
  }
} 