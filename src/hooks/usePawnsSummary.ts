import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { PawnStatus } from '@/models/pawn';

export interface PawnStoreSummary {
  totalFund: number;
  availableFund: number;
  totalLoan: number;
  oldDebt: number;
  profit: number;
  collectedInterest: number;
}

interface UsePawnsSummaryOptions {
  autoFetch?: boolean;
}

export function usePawnsSummary({ autoFetch = true }: UsePawnsSummaryOptions = {}) {
  const { currentStore } = useStore();
  const [summary, setSummary] = useState<PawnStoreSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!currentStore?.id) return;
    setLoading(true);
    try {
      const storeId = currentStore.id;

      // 1-3. Fetch store + active/closed pawns in parallel
      const [
        { data: storeData },
        { data: activePawns },
        { data: closedPawns },
      ] = await Promise.all([
        supabase
          .from('stores')
          .select('investment, cash_fund')
          .eq('id', storeId)
          .single(),
        supabase
          .from('pawns_by_store')
          .select('id')
          .eq('store_id', storeId)
          .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST']),
        supabase
          .from('pawns_by_store')
          .select('id')
          .eq('store_id', storeId)
          .eq('status_code', 'CLOSED'),
      ]);

      const activeIds = activePawns?.map(p => p.id).filter(id => id !== null) ?? [];
      const closedIds = closedPawns?.map(p => p.id).filter(id => id !== null) ?? [];
      const allIds = [...activeIds, ...closedIds];

      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      let totalCollectedInterest = 0;

      // 3. Principal, old debt, expected profit for active contracts
      if (activeIds.length) {
        const { data: principalRows } = await supabase.rpc('get_pawn_current_principal', {
          p_pawn_ids: activeIds,
        });
        totalLoan = principalRows?.reduce((s: number, r: any) => s + Number(r.current_principal || 0), 0) ?? 0;

        const { data: debtRows } = await supabase.rpc('get_pawn_old_debt', {
          p_pawn_ids: activeIds,
        });
        totalOldDebt = debtRows?.reduce((s: number, r: any) => s + Number(r.old_debt || 0), 0) ?? 0;

        const { data: expRows } = await (supabase.rpc as any)('get_pawn_expected_interest', {
          p_pawn_ids: activeIds,
        });
        totalProfit = expRows?.reduce((s: number, r: any) => s + Number(r.expected_profit || 0), 0) ?? 0;
      }

      // 4. Collected interest (current month)
      if (allIds.length) {
        // Use current month range like credit summary
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        const { data: paidRows } = await supabase.rpc('get_pawn_paid_interest', {
          p_pawn_ids: allIds,
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
      console.error('usePawnsSummary error', err);
    } finally {
      setLoading(false);
    }
  }, [currentStore?.id]);

  useEffect(() => {
    if (!autoFetch) return;
    fetchSummary();
  }, [autoFetch, fetchSummary]);

  return { summary, loading, refresh: fetchSummary };
} 