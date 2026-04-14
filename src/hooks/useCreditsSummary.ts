import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { startPerfTimer } from '@/lib/perf-debug';

export interface CreditStoreSummary {
  totalFund: number;
  availableFund: number;
  totalLoan: number;
  oldDebt: number;
  profit: number;
  collectedInterest: number;
}

export function useCreditsSummary() {
  const { currentStore } = useStore();
  const [summary, setSummary] = useState<CreditStoreSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSummary = async () => {
    if (!currentStore?.id) return;
    const endFetchSummary = startPerfTimer('useCreditsSummary.fetchSummary', {
      context: { storeId: currentStore.id },
    });
    setLoading(true);
    try {
      const storeId = currentStore.id;

      // store + active + closed queries run in parallel
      const storePromise = supabase
        .from('stores')
        .select('investment, cash_fund')
        .eq('id', storeId)
        .single();

      const activeCreditsPromise = supabase
        .from('credits_by_store')
        .select('id, loan_amount')
        .eq('store_id', storeId)
        .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST']);

      const closedCreditsPromise = supabase
        .from('credits_by_store')
        .select('id')
        .eq('store_id', storeId)
        .eq('status_code', 'CLOSED');

      const [
        { data: storeData },
        { data: activeCredits },
        { data: closedCredits },
      ] = await Promise.all([storePromise, activeCreditsPromise, closedCreditsPromise]);

      const activeIds = activeCredits?.map((c: { id: string | null }) => c.id).filter((id: string | null): id is string => id !== null) ?? [];
      const closedIds = closedCredits?.map((c: { id: string | null }) => c.id).filter((id: string | null): id is string => id !== null) ?? [];
      const allIds = [...activeIds, ...closedIds];

      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      let totalCollectedInterest = 0;

      if (activeIds.length) {
        const principalPromise = supabase.rpc('get_current_principal', {
          p_credit_ids: activeIds,
        });
        const oldDebtPromise = supabase.rpc('get_old_debt', {
          p_credit_ids: activeIds,
        });
        const expectedInterestPromise = (supabase.rpc as any)('get_expected_interest', {
          p_credit_ids: activeIds,
        });

        const [
          { data: prinRows },
          { data: debtRows },
          { data: expRows },
        ] = await Promise.all([principalPromise, oldDebtPromise, expectedInterestPromise]);

        totalLoan = prinRows?.reduce((sum: number, r: any) => sum + Number(r.current_principal || 0), 0) ?? 0;
        totalOldDebt = debtRows?.reduce((s: number, r: any) => s + Number(r.old_debt || 0), 0) ?? 0;
        totalProfit = expRows?.reduce((s: number, r: any) => s + Number(r.expected_profit || 0), 0) ?? 0;
      }

      if (allIds.length) {
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        const endPaidInterestRangeQuery = startPerfTimer('useCreditsSummary.fetchSummary.rpcPaidInterestRange', {
          context: { credits: allIds.length },
        });
        const { data: paidRows } = await supabase.rpc('get_paid_interest', {
          p_credit_ids: allIds,
          p_start_date: start.toISOString(),
          p_end_date  : end.toISOString(),
        });
        endPaidInterestRangeQuery();
        totalCollectedInterest = paidRows?.reduce((s: number, r: any) => s + Number(r.paid_interest || 0), 0) ?? 0;
      }

      setSummary({
        totalFund: storeData?.investment || 0,
        availableFund: storeData?.cash_fund || 0,
        totalLoan: Math.round(totalLoan),
        oldDebt: Math.round(totalOldDebt),
        profit: Math.round(totalProfit),
        collectedInterest: Math.round(totalCollectedInterest),
      });
    } catch (err) {
      console.error('useCreditsSummary error', err);
    } finally {
      setLoading(false);
      endFetchSummary();
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [currentStore?.id]);

  return { summary, loading, refresh: fetchSummary };
} 