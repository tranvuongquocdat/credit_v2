// src/hooks/useCreditCalculations.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditStatus } from '@/models/credit';
import { useStore } from '@/contexts/StoreContext';
import { getExpectedMoney } from '@/lib/Credits/get_expected_money';
import { calculateDebtToLatestPaidPeriod } from '@/lib/Credits/calculate_remaining_debt';
import { calculateActualLoanAmount } from '@/lib/Credits/calculate_actual_loan_amount';
import { getCreditPaymentHistory } from '@/lib/Credits/payment_history';

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
      
      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      const newDetails: Record<string, CreditFinancialDetail> = {};
      
      if (activeCreditsData?.length) {
        console.time('Calculate all credits');
        
        // 3. Xử lý song song tất cả credits
        const results = await Promise.all(
          activeCreditsData.map(async (credit) => {
            try {
              const [loanAmount, oldDebt, dailyAmounts, paymentHistory] = await Promise.all([
                calculateActualLoanAmount(credit.id),
                calculateDebtToLatestPaidPeriod(credit.id),
                getExpectedMoney(credit.id),
                getCreditPaymentHistory(credit.id)
              ]);
              
              const expectedProfit = dailyAmounts.reduce((sum, amount) => sum + amount, 0);
              const paidInterest = paymentHistory
                .filter(record => record.transaction_type === 'payment' && !record.is_deleted)
                .reduce((sum, record) => sum + (record.credit_amount || 0), 0);
              
              // Tính interest to today
              const today = new Date();
              const loanStart = new Date(credit.loan_date);
              const daysSinceLoan = Math.floor((today.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
              const interestToday = dailyAmounts.slice(0, daysSinceLoan + 1).reduce((sum, amount) => sum + amount, 0);
              
              return {
                creditId: credit.id,
                actualLoanAmount: Math.round(loanAmount),
                oldDebt: Math.round(oldDebt),
                expectedProfit: Math.round(expectedProfit),
                paidInterest: Math.round(paidInterest),
                interestToday: Math.round(interestToday),
                loading: false,
                // For summary
                summaryLoan: loanAmount,
                summaryDebt: oldDebt,
                summaryProfit: expectedProfit
              };
            } catch (error) {
              console.error(`Error calculating for credit ${credit.id}:`, error);
              return null;
            }
          })
        );
        
        console.timeEnd('Calculate all credits');
        
        // 4. Aggregate results
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
          }
        });
      }
      
      // 5. Tính collected interest
      const { data: paymentHistory } = await supabase
        .from('credit_history')
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