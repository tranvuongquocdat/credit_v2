import { supabase } from '@/lib/supabase';
import { PawnStatus } from '@/models/pawn';
import { CreditStatus } from '@/models/credit';
import { InstallmentStatus } from '@/models/installment';
import { calculatePawnMetrics } from '@/lib/Pawns/calculate_pawn_metrics';
import { calculateCreditMetrics } from '@/lib/Credits/calculate_credit_metrics';
import { calculateInstallmentMetrics } from '@/lib/Installments/calculate_installment_metrics';

export interface FinancialSummary {
  totalLoan: number;
  oldDebt: number;
  profit: number;
  collectedInterest: number;
}

export async function getPawnFinancialsForStore(storeId: string): Promise<FinancialSummary> {
  const { data: activePawnsData } = await supabase
    .from('pawns')
    .select('id, loan_amount, loan_date, interest_value, interest_type, loan_period, interest_period')
    .eq('store_id', storeId)
    .eq('status', PawnStatus.ON_TIME);

  let totalLoan = 0;
  let totalOldDebt = 0;
  let totalProfit = 0;
  let totalCollectedInterest = 0;

  if (activePawnsData?.length) {
    const results = await Promise.all(
      activePawnsData.map(pawn => calculatePawnMetrics(pawn))
    );

    results.forEach(result => {
      if (result) {
        totalLoan += result.summaryLoan;
        totalOldDebt += result.summaryDebt;
        totalProfit += result.summaryProfit;
        totalCollectedInterest += result.paidInterest;
      }
    });
  }

  return {
    totalLoan: Math.round(totalLoan),
    oldDebt: Math.round(totalOldDebt),
    profit: Math.round(totalProfit),
    collectedInterest: Math.round(totalCollectedInterest)
  };
}

export async function getCreditFinancialsForStore(storeId: string): Promise<FinancialSummary> {
    const { data: activeCreditsData } = await supabase
    .from('credits')
    .select('id, loan_amount, loan_date')
    .eq('store_id', storeId)
    .eq('status', CreditStatus.ON_TIME);

  let totalLoan = 0;
  let totalOldDebt = 0;
  let totalProfit = 0;
  let totalPaidInterest = 0;

  if (activeCreditsData?.length) {
    const results = await Promise.all(
      activeCreditsData.map(credit => calculateCreditMetrics(credit))
    );

    results.forEach(result => {
      if (result) {
        totalLoan += result.summaryLoan;
        totalOldDebt += result.summaryDebt;
        totalProfit += result.summaryProfit;
        totalPaidInterest += result.paidInterest;
      }
    });
  }

  return {
    totalLoan: Math.round(totalLoan),
    oldDebt: Math.round(totalOldDebt),
    profit: Math.round(totalProfit),
    collectedInterest: Math.round(totalPaidInterest)
  };
}

export async function getInstallmentFinancialsForStore(storeId: string): Promise<FinancialSummary> {
  const { data: activeInstallments, error: installmentsError } = await supabase
    .from('installments_by_store')
    .select(`
      id,
      contract_code,
      down_payment,
      installment_amount,
      loan_date,
      loan_period,
      status,
      store_id,
      debt_amount
    `)
    .eq('status', InstallmentStatus.ON_TIME)
    .eq('store_id', storeId);

  if (installmentsError) {
    throw installmentsError;
  }
  
  if (!activeInstallments || activeInstallments.length === 0) {
    return {
        totalLoan: 0,
        oldDebt: 0,
        profit: 0,
        collectedInterest: 0,
    };
  }

  let totalLoan = 0;
  let totalOldDebt = 0;
  let expectedProfit = 0;
  let collectedProfit = 0;
  
  const results = await Promise.all(
    activeInstallments.map(installment => calculateInstallmentMetrics(installment))
  );
  
  results.forEach(result => {
    if (result) {
      totalOldDebt += 0 - result.oldDebt;
      collectedProfit += result.profitCollected;
      totalLoan += result.loanAmount;
      expectedProfit += result.expectedProfitAmount;
    }
  });

  return {
    totalLoan: totalLoan,
    oldDebt: totalOldDebt,
    profit: expectedProfit,
    collectedInterest: collectedProfit
  };
} 