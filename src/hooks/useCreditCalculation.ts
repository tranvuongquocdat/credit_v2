// src/hooks/useCreditCalculations.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { calculateCreditMetrics } from '@/lib/Credits/calculate_credit_metrics';
import { startPerfTimer } from '@/lib/perf-debug';

// Interface cho dữ liệu tài chính tổng hợp
export interface StoreFinancialData {
  totalFund: number;
  availableFund: number;
  totalLoan: number;
  oldDebt: number;
  profit: number;
  collectedInterest: number;
}

// Interface cho chi tiết từng credit (cho CreditsTable)
export interface CreditFinancialDetail {
  creditId: string;
  actualLoanAmount: number;
  oldDebt: number;
  expectedProfit: number;
  paidInterest: number;
  interestToday: number;
  nextPayment: string | null;
  isCompleted: boolean;
  hasPaid: boolean;
  loading: boolean;
  latestPaidDate: string | null;
}

/** Payload từ RPC get_credit_financial_summary (Option A — Bottleneck 1) */
interface CreditFinancialSummaryBundle {
  paid_interest_range: { credit_id: string; paid_interest: number }[];
  paid_interest_total: { credit_id: string; paid_interest: number }[];
  current_principal: { credit_id: string; current_principal: number }[];
  old_debt: { credit_id: string; old_debt: number }[];
  expected_interest: { credit_id: string; expected_profit: number; interest_today: number }[];
  latest_payment_paid_dates: { credit_id: string; latest_paid_date: string | null }[];
  next_payment_info: {
    credit_id: string;
    next_date: string | null;
    is_completed: boolean;
    has_paid: boolean;
  }[];
}

export function useCreditCalculations() {
  const [summary, setSummary] = useState<StoreFinancialData | null>(null);
  const [details, setDetails] = useState<Record<string, CreditFinancialDetail>>({});
  const [loading, setLoading] = useState(true);
  const { currentStore } = useStore();

  const fetchAllData = async () => {
    const endFetchAllData = startPerfTimer('useCreditCalculations.fetchAllData', {
      context: { storeId: currentStore?.id || null },
    });
    try {
      setLoading(true);

      const storeId = currentStore?.id || '1';

      const [storeResult, activeResult, closedResult] = await Promise.all([
        supabase.from('stores').select('investment, cash_fund').eq('id', storeId).single(),
        supabase
          .from('credits_by_store')
          .select('id, loan_amount, loan_date, loan_period')
          .eq('store_id', storeId)
          .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST']),
        supabase
          .from('credits_by_store')
          .select('id, loan_amount, loan_date, loan_period')
          .eq('store_id', storeId)
          .eq('status_code', 'CLOSED'),
      ]);

      if (storeResult.error) throw storeResult.error;

      const storeData = storeResult.data;
      const activeCreditsData = activeResult.data;
      const closedCreditsData = closedResult.data;

      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      let totalCollectedInterest = 0;
      const newDetails: Record<string, CreditFinancialDetail> = {};

      const interestRangeMap = new Map<string, number>();
      const interestTotalMap = new Map<string, number>();
      const principalMap = new Map<string, number>();
      const debtMap = new Map<string, number>();
      const expectedMap = new Map<string, number>();
      const todayMap = new Map<string, number>();
      const latestPaidMap = new Map<string, string | null>();
      const nextMap = new Map<
        string,
        { nextDate: string | null; isCompleted: boolean; hasPaid: boolean }
      >();

      const activeIds =
        activeCreditsData?.map((c) => c.id).filter((id): id is string => id !== null) || [];
      const closedIds =
        closedCreditsData?.map((c) => c.id).filter((id): id is string => id !== null) || [];
      const allIds = [...activeIds, ...closedIds];

      if (allIds.length > 0 || activeIds.length > 0) {
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

        const { data: bundleRaw, error: bundleErr } = await (supabase.rpc as any)(
          'get_credit_financial_summary',
          {
            p_all_credit_ids: allIds,
            p_active_credit_ids: activeIds,
            p_start_date: start.toISOString(),
            p_end_date: end.toISOString(),
          }
        );

        console.log("Bundlelll", bundleRaw)

        if (bundleErr) throw bundleErr;

        const bundle = bundleRaw as CreditFinancialSummaryBundle | null;

        bundle?.paid_interest_range?.forEach((r) =>
          interestRangeMap.set(r.credit_id, Number(r.paid_interest || 0))
        );
        bundle?.paid_interest_total?.forEach((r) =>
          interestTotalMap.set(r.credit_id, Number(r.paid_interest || 0))
        );
        bundle?.current_principal?.forEach((r) =>
          principalMap.set(r.credit_id, Number(r.current_principal))
        );
        bundle?.old_debt?.forEach((r) => debtMap.set(r.credit_id, Number(r.old_debt || 0)));
        bundle?.expected_interest?.forEach((r) => {
          expectedMap.set(r.credit_id, Number(r.expected_profit || 0));
          todayMap.set(r.credit_id, Number(r.interest_today || 0));
        });
        bundle?.latest_payment_paid_dates?.forEach((r) =>
          latestPaidMap.set(r.credit_id, r.latest_paid_date || null)
        );
        bundle?.next_payment_info?.forEach((r) => {
          nextMap.set(r.credit_id, {
            nextDate: r.next_date,
            isCompleted: r.is_completed,
            hasPaid: r.has_paid,
          });
        });
      }

      const endCalculateMetrics = startPerfTimer('useCreditCalculations.fetchAllData.calculateCreditMetrics', {
        context: { credits: (activeCreditsData?.length || 0) + (closedCreditsData?.length || 0) },
      });
      const results = await Promise.all(
        [...(activeCreditsData || []), ...(closedCreditsData || [])]
          .filter(
            (c): c is { id: string; loan_amount: number; loan_date: string; loan_period: number } =>
              c?.id !== null &&
              c?.loan_amount !== null &&
              c?.loan_date !== null &&
              c?.loan_period !== null
          )
          .map((c) =>
            calculateCreditMetrics(c, {
              principalMap,
              interestMap: interestTotalMap,
              debtMap,
              expectedMap,
              todayMap,
            })
          )
      );
      endCalculateMetrics();

      results.forEach((result) => {
        if (result) {
          newDetails[result.creditId] = {
            creditId: result.creditId,
            actualLoanAmount: result.actualLoanAmount,
            oldDebt: result.oldDebt,
            expectedProfit: result.expectedProfit,
            paidInterest: result.paidInterest,
            interestToday: result.interestToday,
            nextPayment: nextMap.get(result.creditId)?.nextDate || null,
            isCompleted: nextMap.get(result.creditId)?.isCompleted || false,
            hasPaid: nextMap.get(result.creditId)?.hasPaid || false,
            loading: false,
            latestPaidDate: latestPaidMap.get(result.creditId) || null,
          };

          totalLoan += result.summaryLoan;
          totalOldDebt += result.summaryDebt;
          totalProfit += result.summaryProfit;
          totalCollectedInterest += interestRangeMap.get(result.creditId) ?? 0;
        }
      });

      closedIds.forEach((id) => {
        totalCollectedInterest += interestRangeMap.get(id) ?? 0;
      });

      setSummary({
        totalFund: storeData?.investment || 0,
        availableFund: storeData?.cash_fund || 0,
        totalLoan: Math.round(totalLoan),
        oldDebt: Math.round(totalOldDebt),
        profit: Math.round(totalProfit),
        collectedInterest: Math.round(totalCollectedInterest),
      });

      setDetails(newDetails);
    } catch (error) {
      console.error('Error in useCreditCalculations:', error);
    } finally {
      setLoading(false);
      endFetchAllData();
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [currentStore?.id]);

  return {
    summary,
    details,
    loading,
    refresh: fetchAllData,
  };
}
