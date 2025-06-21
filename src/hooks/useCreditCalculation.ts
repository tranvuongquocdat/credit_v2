// src/hooks/useCreditCalculations.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditStatus } from '@/models/credit';
import { useStore } from '@/contexts/StoreContext';
import { calculateCreditMetrics } from '@/lib/Credits/calculate_credit_metrics';

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
  loading: boolean;
}

export function useCreditCalculations() {
  const [summary, setSummary] = useState<StoreFinancialData | null>(null);
  const [details, setDetails] = useState<Record<string, CreditFinancialDetail>>({});
  const [loading, setLoading] = useState(true);
  const { currentStore } = useStore();
  
  const fetchAllData = async () => {
    try {
      setLoading(true);
      
      const storeId = currentStore?.id || '1';
      
      // 1. Lấy thông tin store
      const { data: storeData } = await supabase
        .from('stores')
        .select('investment, cash_fund')
        .eq('id', storeId)
        .single();
      
      // 2. Lấy danh sách credits ON_TIME
      const { data: activeCreditsData } = await supabase
        .from('credits')
        .select('id, loan_amount, loan_date, loan_period')
        .eq('store_id', storeId)
        .eq('status', CreditStatus.ON_TIME);
      
      // 3. Lấy danh sách credits đã đóng
      const { data: closedCreditsData } = await supabase
        .from('credits')
        .select('id')
        .eq('store_id', storeId)
        .eq('status', CreditStatus.CLOSED);
      
      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      let totalCollectedInterest = 0;
      const newDetails: Record<string, CreditFinancialDetail> = {};
      
      /* ---------- 4. RPC duy nhất lấy paidInterest cho active + closed ---------- */
      const interestMap = new Map<string, number>();
      const activeIds  = activeCreditsData?.map(c => c.id) || [];
      const closedIds  = closedCreditsData?.map(c => c.id) || [];
      const allIds     = [...activeIds, ...closedIds];
      
      if (allIds.length) {
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        const { data: interestRows, error } = await supabase.rpc('get_paid_interest', {
          p_credit_ids: allIds,
          p_start_date: start.toISOString(),
          p_end_date  : end.toISOString(),
        });
        if (!error && Array.isArray(interestRows)) {
          interestRows.forEach((r: any) =>
            interestMap.set(r.credit_id, Number(r.paid_interest || 0)));
        }
      }

      const { data: principalRows } = await supabase.rpc('get_current_principal', {
        p_credit_ids: allIds,
      });
      const principalMap = new Map<string, number>();
      principalRows?.forEach((r: { credit_id: string; current_principal: number }) => {
        principalMap.set(r.credit_id, Number(r.current_principal));
      });

      // 5. RPC lấy old debt
      const { data: debtRows } = await supabase.rpc('get_old_debt', {
        p_credit_ids: activeIds,
      });
      const debtMap = new Map<string, number>();
      debtRows?.forEach((r: { credit_id: string; old_debt: number }) =>
        debtMap.set(r.credit_id, Number(r.old_debt || 0))
      );

      /* ---------- 6. RPC lấy expectedProfit & interestToday ---------- */
      const expectedMap = new Map<string, number>();
      const todayMap = new Map<string, number>();

      if (allIds.length) {
        const { data: expRows, error: expErr } = await (supabase.rpc as any)('get_expected_interest', {
          p_credit_ids: allIds,
        });
        if (!expErr && Array.isArray(expRows)) {
          expRows.forEach((r: any) => {
            expectedMap.set(r.credit_id, Number(r.expected_profit || 0));
            todayMap.set(r.credit_id, Number(r.interest_today || 0));
          });
        }
      }

      const results = await Promise.all(
        activeCreditsData!.map(c =>
          calculateCreditMetrics(c, {
            principalMap,
            interestMap,
            debtMap,
            expectedMap,
            todayMap,
          })
        )
      );
      
      // Aggregate results
      results.forEach(result => {
        if (result) {
          newDetails[result.creditId] = {
            creditId: result.creditId,
            actualLoanAmount: result.actualLoanAmount,
            oldDebt: result.oldDebt,
            expectedProfit: result.expectedProfit,
            paidInterest: result.paidInterest,
            interestToday: result.interestToday,
            loading: false
          };
          
          totalLoan += result.summaryLoan;
          totalOldDebt += result.summaryDebt;
          totalProfit += result.summaryProfit;
          totalCollectedInterest += result.paidInterest;
        }
      });
      
      // Cộng thêm lãi phí của các credit đã đóng
      closedIds.forEach(id => {
        totalCollectedInterest += interestMap.get(id) ?? 0;
      });
      
      // 7. Set results
      setSummary({
        totalFund: storeData?.investment || 0,
        availableFund: storeData?.cash_fund || 0,
        totalLoan: Math.round(totalLoan),
        oldDebt: Math.round(totalOldDebt),
        profit: Math.round(totalProfit),
        collectedInterest: Math.round(totalCollectedInterest)
      });
      
      setDetails(newDetails);
      
    } catch (error) {
      console.error('Error in useCreditCalculations:', error);
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