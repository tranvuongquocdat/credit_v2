// src/hooks/usePawnCalculation.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PawnStatus } from '@/models/pawn';
import { useStore } from '@/contexts/StoreContext';
import { calculatePawnMetrics } from '@/lib/Pawns/calculate_pawn_metrics';

// Interface cho dữ liệu tài chính tổng hợp
export interface StoreFinancialData {
  totalFund: number;
  availableFund: number;
  totalLoan: number;
  oldDebt: number;
  profit: number;
  collectedInterest: number;
}

// Interface cho chi tiết từng pawn (cho PawnsTable)
export interface PawnFinancialDetail {
  pawnId: string;
  actualLoanAmount: number;
  oldDebt: number;
  expectedProfit: number;
  paidInterest: number;
  interestToday: number;
  nextPayment: string | null;
  isCompleted: boolean;
  hasPaid: boolean;
  loading: boolean;
}

export function usePawnCalculations() {
  const [summary, setSummary] = useState<StoreFinancialData | null>(null);
  const [details, setDetails] = useState<Record<string, PawnFinancialDetail>>({});
  const [loading, setLoading] = useState(true);
  const { currentStore } = useStore();
  
  const fetchAllData = async () => {
    try {
      setLoading(true);
      
      const storeId = currentStore?.id || '1';
      
      // 1. investment tĩnh từ stores; cash fund event-sourced qua RPC.
      const [{ data: storeData }, { data: cashFundData }] = await Promise.all([
        supabase.from('stores').select('investment').eq('id', storeId).single(),
        (supabase as any).rpc('calc_cash_fund_as_of', { p_store_id: storeId }),
      ]);
      
      // 2. Lấy danh sách pawns ON_TIME - using optimized view
      const { data: activeCreditsData } = await supabase
        .from('pawns_by_store')
        .select('id, loan_amount, loan_date, loan_period')
        .eq('store_id', storeId)
        .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST']);
      
      // 3. Lấy danh sách pawns đã đóng - using optimized view
      const { data: closedCreditsData } = await supabase
        .from('pawns_by_store')
        .select('id, loan_amount, loan_date, loan_period')
        .eq('store_id', storeId)
        .eq('status_code', 'CLOSED');
      
      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      let totalCollectedInterest = 0;
      const newDetails: Record<string, PawnFinancialDetail> = {};
      
      /* ---------- 4. RPC lấy paidInterest (2 phiên bản) ---------- */
      const interestRangeMap = new Map<string, number>();  // giới hạn theo start_date & end_date
      const interestTotalMap = new Map<string, number>();  // toàn thời gian
      const activeIds  = activeCreditsData?.map(c => c.id).filter(id => id !== null) || [];
      const closedIds  = closedCreditsData?.map(c => c.id).filter(id => id !== null) || [];
      const allIds     = [...activeIds, ...closedIds];
      
      if (allIds.length) {
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

        /* (a) range-limited */
        const { data: interestRowsR } = await supabase.rpc('get_pawn_paid_interest', {
          p_pawn_ids: allIds
        });
        interestRowsR?.forEach((r: any) =>
          interestRangeMap.set(r.pawn_id, Number(r.paid_interest || 0)));

        /* (b) total */
        const { data: interestRowsT } = await supabase.rpc('get_pawn_paid_interest', {
          p_pawn_ids: allIds,
        });
        interestRowsT?.forEach((r: any) =>
          interestTotalMap.set(r.pawn_id, Number(r.paid_interest || 0)));
      }

      const { data: principalRows } = await supabase.rpc('get_pawn_current_principal', {
        p_pawn_ids: allIds,
      });
      const principalMap = new Map<string, number>();
      principalRows?.forEach((r: { pawn_id: string; current_principal: number }) => {
        principalMap.set(r.pawn_id, Number(r.current_principal));
      });

      // 5. RPC lấy old debt
      const { data: debtRows } = await supabase.rpc('get_pawn_old_debt', {
        p_pawn_ids: allIds,
      });
      const debtMap = new Map<string, number>();
      debtRows?.forEach((r: { pawn_id: string; old_debt: number }) =>
        debtMap.set(r.pawn_id, Number(r.old_debt || 0))
      );

      /* ---------- 6. RPC lấy expectedProfit & interestToday ---------- */
      const expectedMap = new Map<string, number>();
      const todayMap = new Map<string, number>();

      if (allIds.length) {
        const { data: expRows, error: expErr } = await (supabase.rpc as any)('get_pawn_expected_interest', {
          p_pawn_ids: allIds,
        });
        if (!expErr && Array.isArray(expRows)) {
          expRows.forEach((r: any) => {
            expectedMap.set(r.pawn_id, Number(r.expected_profit || 0));
            todayMap.set(r.pawn_id, Number(r.interest_today || 0));
          });
        }
      }

      /* ---------- 7. RPC lấy thông tin kỳ thanh toán tiếp theo ---------- */
      const nextMap = new Map<string, { nextDate: string | null; isCompleted: boolean; hasPaid: boolean }>();
      if (activeIds.length) {
        const { data: npRows, error: npErr } = await (supabase.rpc as any)('get_pawn_next_payment_info', {
          p_pawn_ids: activeIds,
        });
        if (!npErr && Array.isArray(npRows)) {
          npRows.forEach((r: any) => {
            nextMap.set(r.pawn_id, {
              nextDate: r.next_date,
              isCompleted: r.is_completed,
              hasPaid: r.has_paid,
            });
          });
        }
      }
      
      const validPawnData = [...(activeCreditsData || []), ...(closedCreditsData || [])]
        .filter((c): c is { id: string; loan_amount: number; loan_date: string; loan_period: number } => 
          c?.id !== null && c?.loan_amount !== null && c?.loan_date !== null && c?.loan_period !== null
        );
      
      const results = await Promise.all(
        validPawnData.map(c =>
          calculatePawnMetrics(c, {
            principalMap,
            interestMap: interestTotalMap,
            debtMap,
            expectedMap,
            todayMap,
          })
        )
      );
        
      // Aggregate results
      results.forEach(result => {
        if (result) {
          newDetails[result.pawnId] = {
            pawnId: result.pawnId,
            actualLoanAmount: result.actualLoanAmount,
            oldDebt: result.oldDebt,
            expectedProfit: result.expectedProfit,
            paidInterest: result.paidInterest,
            interestToday: result.interestToday,
            nextPayment: nextMap.get(result.pawnId)?.nextDate || null,
            isCompleted: nextMap.get(result.pawnId)?.isCompleted || false,
            hasPaid: nextMap.get(result.pawnId)?.hasPaid || false,
            loading: false
          };
          
          totalLoan += result.summaryLoan;
          totalOldDebt += result.summaryDebt;
          totalProfit += result.summaryProfit;
          totalCollectedInterest += interestRangeMap.get(result.pawnId) ?? 0;
        }
      });
      
      // Cộng thêm lãi phí của các credit đã đóng
      closedIds.forEach(id => {
        totalCollectedInterest += interestRangeMap.get(id) ?? 0;
      });
      
      /* ---------- 8. Bỏ tính trạng thái tại đây - đã chuyển sang RPC per page */
      
      // 7. Set results
      setSummary({
        totalFund: storeData?.investment || 0,
        availableFund: Number(cashFundData) || 0,
        totalLoan: Math.round(totalLoan),
        oldDebt: Math.round(totalOldDebt),
        profit: Math.round(totalProfit),
        collectedInterest: Math.round(totalCollectedInterest)
      });
      
      setDetails(newDetails);
      
    } catch (error) {
      console.error('Error in usePawnCalculations:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchAllData();
  }, [currentStore?.id]);
  
  return {
    summary,
    details,
    loading,
    refresh: fetchAllData
  };
}