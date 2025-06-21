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
        .select('id, loan_amount, loan_date')
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
        const { data: rows, error } = await supabase.rpc('get_paid_interest', {
          p_credit_ids: allIds,
          p_start_date: start.toISOString(),
          p_end_date  : end.toISOString(),
        });
        if (!error && Array.isArray(rows)) {
          rows.forEach((r: any) =>
            interestMap.set(r.credit_id, Number(r.paid_interest || 0)));
        }
      }

      // trước khi tính metrics cho từng credit
      const { data: principalRows } = await supabase.rpc('get_principal_and_debt', {
        p_credit_ids: activeIds,
      });

      // map cho nhanh
      const principalMap = new Map<string, number>();
      principalRows?.forEach(r => principalMap.set(r.credit_id, Number(r.current_principal || 0)));

      if (activeCreditsData?.length) {
        console.time('Calculate all active credits');
        
        const results = await Promise.all(
          activeCreditsData.map(credit =>
            calculateCreditMetrics(credit, {
              interestMap,
              principalMap   // truyền kèm để bỏ nốt query loan_amount / credit_history
            }))
        );
        
        console.timeEnd('Calculate all active credits');
        
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
      }
      
      // Cộng thêm lãi phí của các credit đã đóng
      closedIds.forEach(id => {
        totalCollectedInterest += interestMap.get(id) ?? 0;
      });
      
      // 6. Set results
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