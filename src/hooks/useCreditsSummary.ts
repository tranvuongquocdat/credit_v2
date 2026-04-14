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

      // store cash fund / investment
      const endStoreQuery = startPerfTimer('useCreditsSummary.fetchSummary.queryStore');
      const { data: storeData } = await supabase
        .from('stores')
        .select('investment, cash_fund')
        .eq('id', storeId)
        .single();
      endStoreQuery();

      // active + closed ids using credits_by_store view
      const endActiveCreditsQuery = startPerfTimer('useCreditsSummary.fetchSummary.queryActiveCredits');
      const { data: activeCredits } = await supabase
        .from('credits_by_store')
        .select('id, loan_amount')
        .eq('store_id', storeId)
        .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST']);
      endActiveCreditsQuery();

      const endClosedCreditsQuery = startPerfTimer('useCreditsSummary.fetchSummary.queryClosedCredits');
      const { data: closedCredits } = await supabase
        .from('credits_by_store')
        .select('id')
        .eq('store_id', storeId)
        .eq('status_code', 'CLOSED');
      endClosedCreditsQuery();

      const activeIds = activeCredits?.map(c => c.id).filter((id): id is string => id !== null) ?? [];
      const closedIds = closedCredits?.map(c => c.id).filter((id): id is string => id !== null) ?? [];
      const allIds = [...activeIds, ...closedIds];

      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      let totalCollectedInterest = 0;

      if (activeIds.length) {
        // principal
        const endPrincipalQuery = startPerfTimer('useCreditsSummary.fetchSummary.rpcCurrentPrincipal', {
          context: { credits: activeIds.length },
        });
        const { data: prinRows } = await supabase.rpc('get_current_principal', {
          p_credit_ids: activeIds,
        });
        endPrincipalQuery();
        totalLoan = prinRows?.reduce((sum: number, r: any) => sum + Number(r.current_principal || 0), 0) ?? 0;

        // old debt
        const endOldDebtQuery = startPerfTimer('useCreditsSummary.fetchSummary.rpcOldDebt', {
          context: { credits: activeIds.length },
        });
        const { data: debtRows } = await supabase.rpc('get_old_debt', {
          p_credit_ids: activeIds,
        });
        endOldDebtQuery();
        totalOldDebt = debtRows?.reduce((s: number, r: any) => s + Number(r.old_debt || 0), 0) ?? 0;

        // expected profit whole period
        const endExpectedInterestQuery = startPerfTimer('useCreditsSummary.fetchSummary.rpcExpectedInterest', {
          context: { credits: activeIds.length },
        });
        const { data: expRows } = await (supabase.rpc as any)('get_expected_interest', {
          p_credit_ids: activeIds,
        });
        endExpectedInterestQuery();
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