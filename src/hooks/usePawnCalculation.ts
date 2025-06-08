'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PawnStatus } from '@/models/pawn';
import { useStore } from '@/contexts/StoreContext';
import { calculateActualLoanAmount } from '@/lib/Pawns/calculate_actual_loan_amount';
import { calculateDebtToLatestPaidPeriod } from '@/lib/Pawns/calculate_remaining_debt';
import { getExpectedMoney } from '@/lib/Pawns/get_expected_money';

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
      
      const storeId = currentStore?.id || '1';
      
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
      
      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      const newDetails: Record<string, PawnFinancialDetail> = {};
      
      if (activePawnsData?.length) {
        console.time('Calculate all pawns');
        
        // 3. Xử lý song song tất cả pawns
        const results = await Promise.all(
          activePawnsData.map(async (pawn) => {
            try {
              // Calculate actual loan amount including additional loans and principal repayments
              const actualLoanAmount = await calculateActualLoanAmount(pawn.id);
              
              // Calculate old debt from payment history
              const { data: paymentHistory } = await supabase
                .from('pawn_history')
                .select('credit_amount, debit_amount, transaction_type, is_deleted')
                .eq('pawn_id', pawn.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: true });
              
              // Calculate paid interest
              const paidInterest = paymentHistory
                ?.filter(record => record.transaction_type === 'payment')
                .reduce((sum, record) => sum + (record.credit_amount || 0), 0) || 0;
              
              // Calculate old debt (similar to credits logic)
              const oldDebt = await calculateDebtToLatestPaidPeriod(pawn.id);
              
              // Calculate expected profit using getExpectedMoney (sum of all daily interest)
              const expectedMoneyArray = await getExpectedMoney(pawn.id);
              const expectedProfit = expectedMoneyArray.reduce((sum, amount) => sum + amount, 0);
              
              // Calculate interest to today
              const today = new Date();
              const loanStart = new Date(pawn.loan_date);
              const daysSinceLoan = Math.floor((today.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
              const daysToCalculate = Math.min(Math.max(0, daysSinceLoan + 1), expectedMoneyArray.length);
              const interestToday = expectedMoneyArray.slice(0, daysToCalculate).reduce((sum, amount) => sum + amount, 0);
              
              return {
                pawnId: pawn.id,
                actualLoanAmount: Math.round(actualLoanAmount),
                oldDebt: Math.round(oldDebt),
                expectedProfit: Math.round(expectedProfit),
                paidInterest: Math.round(paidInterest),
                interestToday: Math.round(interestToday),
                loading: false,
                // For summary
                summaryLoan: actualLoanAmount,
                summaryDebt: oldDebt,
                summaryProfit: expectedProfit
              };
            } catch (error) {
              console.error(`Error calculating for pawn ${pawn.id}:`, error);
              return null;
            }
          })
        );
        
        console.timeEnd('Calculate all pawns');
        
        // 4. Aggregate results
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
          }
        });
      }
      
      // 5. Tính collected interest
      const { data: paymentHistory } = await supabase
        .from('pawn_history')
        .select('credit_amount')
        .eq('transaction_type', 'payment')
        .eq('is_deleted', false);
      
      const collectedInterest = paymentHistory?.reduce((sum, record) => sum + (record.credit_amount || 0), 0) || 0;
      
      // 6. Set results
      setSummary({
        totalFund: storeData?.investment || 0,
        availableFund: storeData?.cash_fund || 0,
        totalLoan: Math.round(totalLoan),
        oldDebt: Math.round(totalOldDebt),
        profit: Math.round(totalProfit),
        collectedInterest: Math.round(collectedInterest)
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