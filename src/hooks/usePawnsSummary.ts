import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetch-all';
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

export function usePawnsSummary() {
  const { currentStore } = useStore();
  const [summary, setSummary] = useState<PawnStoreSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSummary = async () => {
    if (!currentStore?.id) return;
    setLoading(true);
    try {
      const storeId = currentStore.id;

      // 1. investment tĩnh từ stores; cash fund event-sourced qua RPC.
      const [{ data: storeData }, { data: cashFundData }] = await Promise.all([
        supabase.from('stores').select('investment').eq('id', storeId).single(),
        (supabase as any).rpc('calc_cash_fund_as_of', { p_store_id: storeId }),
      ]);

      // 2. List pawn ids (ON_TIME & CLOSED) - phân trang tránh cắt 1000 dòng khi store lớn
      const [activePawns, closedPawns] = await Promise.all([
        fetchAllRows(
          supabase
            .from('pawns_by_store')
            .select('id')
            .eq('store_id', storeId)
            .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST'])
            .order('id')
        ),
        fetchAllRows(
          supabase
            .from('pawns_by_store')
            .select('id')
            .eq('store_id', storeId)
            .eq('status_code', 'CLOSED')
            .order('id')
        )
      ]);

      const activeIds = activePawns?.map((p: any) => p.id).filter((id: any) => id !== null) ?? [];
      const closedIds = closedPawns?.map((p: any) => p.id).filter((id: any) => id !== null) ?? [];
      const allIds = [...activeIds, ...closedIds];

      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      let totalCollectedInterest = 0;

      // 3. Principal, old debt, expected profit for active contracts
      //    (fetchAllRows phân trang response RPC — PostgREST cũng cắt 1000 dòng với RPC)
      if (activeIds.length) {
        const principalRows = await fetchAllRows(supabase.rpc('get_pawn_current_principal', {
          p_pawn_ids: activeIds,
        }));
        totalLoan = principalRows?.reduce((s: number, r: any) => s + Number(r.current_principal || 0), 0) ?? 0;

        const debtRows = await fetchAllRows(supabase.rpc('get_pawn_old_debt', {
          p_pawn_ids: activeIds,
        }));
        totalOldDebt = debtRows?.reduce((s: number, r: any) => s + Number(r.old_debt || 0), 0) ?? 0;

        const expRows = await fetchAllRows((supabase.rpc as any)('get_pawn_expected_interest', {
          p_pawn_ids: activeIds,
        }));
        totalProfit = expRows?.reduce((s: number, r: any) => s + Number(r.expected_profit || 0), 0) ?? 0;
      }

      // 4. Collected interest (current month)
      if (allIds.length) {
        // Use current month range like credit summary
        // end phải là CUỐI ngày cuối tháng (23:59:59.999). Nếu để 00:00 (mặc định của
        // new Date(y, m+1, 0)) thì RPC lọc created_at <= end sẽ cắt mất trọn ngày cuối
        // tháng → đóng lãi vào ngày cuối tháng không được cộng vào "Lãi phí đã thu".
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);
        const paidRows = await fetchAllRows(supabase.rpc('get_pawn_paid_interest', {
          p_pawn_ids: allIds,
          p_start_date: start.toISOString(),
          p_end_date  : end.toISOString(),
        }));
        totalCollectedInterest = paidRows?.reduce((s: number, r: any) => s + Number(r.paid_interest || 0), 0) ?? 0;
      }

      setSummary({
        totalFund: storeData?.investment || 0,
        availableFund: Number(cashFundData) || 0,
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
  };

  useEffect(() => {
    fetchSummary();
  }, [currentStore?.id]);

  return { summary, loading, refresh: fetchSummary };
} 