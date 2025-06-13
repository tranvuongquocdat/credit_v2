'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PawnStatus } from '@/models/pawn';
import { useStore } from '@/contexts/StoreContext';
import { calculatePawnMetrics } from '@/lib/Pawns/calculate_pawn_metrics';
import { calculateTotalCollectedInterest } from '@/lib/Pawns/calculate_collected_interest';

// Interface cho dữ liệu tài chính tổng hợp
export interface StoreFinancialData {
  totalFund: number;
  availableFund: number;
  totalLoan: number;
  oldDebt: number;
  profit: number;
  collectedInterest: number;
}

// Interface cho chi tiết từng pawn (cho PawnTable)
export interface PawnFinancialDetail {
  pawnId: string;
  actualLoanAmount: number;
  oldDebt: number;
  expectedProfit: number;
  paidInterest: number;
  interestToday: number;
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
      if (!currentStore) return;
      const storeId = currentStore?.id;
      
      // 1. Lấy thông tin store
      const { data: storeData } = await supabase
        .from('stores')
        .select('investment, cash_fund')
        .eq('id', storeId)
        .single();
      
      // 2. Lấy danh sách pawns ON_TIME
      const { data: activePawnsData } = await supabase
        .from('pawns')
        .select('id, loan_amount, loan_date, interest_value, interest_type, loan_period, interest_period')
        .eq('store_id', storeId)
        .eq('status', PawnStatus.ON_TIME);
      
      // 2b. Lấy danh sách pawns CLOSED cho việc tính lãi phí đã thu
      const { data: closedPawnsData } = await supabase
        .from('pawns')
        .select('id, loan_amount, loan_date, interest_value, interest_type, loan_period, interest_period')
        .eq('store_id', storeId)
        .eq('status', PawnStatus.CLOSED);
      
      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      let totalCollectedInterest = 0;
      const newDetails: Record<string, PawnFinancialDetail> = {};
      
      if (activePawnsData?.length) {
        console.time('Calculate all active pawns');
        
        // 3. Xử lý song song tất cả pawns đang hoạt động
        const results = await Promise.all(
          activePawnsData.map(pawn => calculatePawnMetrics(pawn))
        );
        
        console.timeEnd('Calculate all active pawns');
        
        // 4. Aggregate results từ pawns đang hoạt động
        results.forEach(result => {
          if (result) {
            newDetails[result.pawnId] = {
              pawnId: result.pawnId,
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
      
      // 5. Xử lý lãi phí đã thu từ pawns đã đóng
      if (closedPawnsData?.length) {
        console.time('Calculate closed pawns interest');
        
        // Sử dụng hàm mới để tính toán lãi phí đã thu từ tất cả pawns đã đóng trong một truy vấn
        const closedPawnIds = closedPawnsData.map(pawn => pawn.id);
        totalCollectedInterest += await calculateTotalCollectedInterest(closedPawnIds);
        
        console.timeEnd('Calculate closed pawns interest');
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