import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { CreditStatus } from '@/models/credit';

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
    setLoading(true);
    try {
      const storeId = currentStore.id;

      // store cash fund / investment
      const { data: storeData } = await supabase
        .from('stores')
        .select('investment, cash_fund')
        .eq('id', storeId)
        .single();

      // active + closed ids
      const { data: activeCredits } = await supabase
        .from('credits')
        .select('id, loan_amount')
        .eq('store_id', storeId)
        .eq('status', CreditStatus.ON_TIME);

      const { data: closedCredits } = await supabase
        .from('credits')
        .select('id')
        .eq('store_id', storeId)
        .eq('status', CreditStatus.CLOSED);

      const activeIds = activeCredits?.map(c => c.id) ?? [];
      const closedIds = closedCredits?.map(c => c.id) ?? [];
      const allIds = [...activeIds, ...closedIds];

      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      let totalCollectedInterest = 0;

      if (activeIds.length) {
        // principal
        const { data: prinRows } = await supabase.rpc('get_current_principal', {
          p_credit_ids: activeIds,
        });
        totalLoan = prinRows?.reduce((sum: number, r: any) => sum + Number(r.current_principal || 0), 0) ?? 0;

        // old debt
        const { data: debtRows } = await supabase.rpc('get_old_debt', {
          p_credit_ids: activeIds,
        });
        totalOldDebt = debtRows?.reduce((s: number, r: any) => s + Number(r.old_debt || 0), 0) ?? 0;

        // expected profit whole period
        const { data: expRows } = await (supabase.rpc as any)('get_expected_interest', {
          p_credit_ids: activeIds,
        });
        totalProfit = expRows?.reduce((s: number, r: any) => s + Number(r.expected_profit || 0), 0) ?? 0;
      }

      if (allIds.length) {
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        const { data: paidRows } = await supabase.rpc('get_paid_interest', {
          p_credit_ids: allIds,
          p_start_date: start.toISOString(),
          p_end_date  : end.toISOString(),
        });
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
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [currentStore?.id]);

  return { summary, loading, refresh: fetchSummary };
} 