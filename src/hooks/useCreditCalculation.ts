// src/hooks/useCreditCalculations.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditStatus } from '@/models/credit';
import { useStore } from '@/contexts/StoreContext';
import { calculateCreditMetrics } from '@/lib/Credits/calculate_credit_metrics';
import { calculateTotalCollectedInterest } from '@/lib/Credits/calculate_collected_interest';

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
      
      if (activeCreditsData?.length) {
        console.time('Calculate all active credits');
        
        const results = await Promise.all(
          activeCreditsData.map(credit => calculateCreditMetrics(credit))
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
      
      // Xử lý lãi phí đã thu từ credits đã đóng
      if (closedCreditsData?.length) {
        console.time('Calculate closed credits interest');
        
        // Sử dụng hàm mới để tính toán lãi phí đã thu từ tất cả credits đã đóng trong một truy vấn
        const closedCreditIds = closedCreditsData.map(credit => credit.id);
        totalCollectedInterest += await calculateTotalCollectedInterest(closedCreditIds);
        
        console.timeEnd('Calculate closed credits interest');
      }
      
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