import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditStatus } from '@/models/credit';
import { useStore } from '@/contexts/StoreContext';
import { getExpectedMoney } from '@/lib/Credits/get_expected_money';
import { calculateDebtToLatestPaidPeriod } from '@/lib/Credits/calculate_remaining_debt';
import { calculateActualLoanAmount } from '@/lib/Credits/calculate_actual_loan_amount';

// Định nghĩa interface cho dữ liệu tài chính của cửa hàng
export interface StoreFinancialData {
  totalFund: number;       // Tổng vốn đầu tư
  availableFund: number;   // Quỹ tiền mặt khả dụng
  totalLoan: number;       // Tổng tiền cho vay
  oldDebt: number;         // Tổng nợ cũ
  profit: number;          // Lợi nhuận dự kiến trong tháng
  collectedInterest: number; // Lãi phí đã thu
}

export function useCreditsSummary() {
  const [financialData, setFinancialData] = useState<StoreFinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentStore, loading: storeLoading } = useStore();

  
  const fetchFinancialData = async () => {
    try {
      // Don't fetch if store is still loading or no store is selected
      if (storeLoading || !currentStore?.id) {
        return;
      }
      setLoading(true);
      
      // 1. Lấy thông tin cơ bản từ store
      const storeId = currentStore?.id;
      const { data: storeData } = await supabase
        .from('stores')
        .select('investment, cash_fund')
        .eq('id', storeId)
        .single();
      
      // Lấy danh sách hợp đồng ON_TIME
      const { data: activeCreditsData, error: activeCreditsError } = await supabase
        .from('credits')
        .select('id, loan_amount')
        .eq('store_id', storeId)
        .eq('status', CreditStatus.ON_TIME);
      
      if (activeCreditsError) {
        console.error('Lỗi khi lấy dữ liệu hợp đồng đang hoạt động:', activeCreditsError);
      }
      
      // Tính toán các thông số tài chính trong cùng một vòng lặp
      let totalLoan = 0;
      let oldDebt = 0;
      let profit = 0;
      
      if (activeCreditsData && activeCreditsData.length > 0) {
        console.log(`Calculating financials for ${activeCreditsData.length} active credits`);
        
        for (const credit of activeCreditsData) {
          try {
            // Tính loan amount
            const loanAmount = await calculateActualLoanAmount(credit.id);
            totalLoan += loanAmount;
            
            // Tính old debt
            const creditDebt = await calculateDebtToLatestPaidPeriod(credit.id);
            oldDebt += creditDebt;
            
            // Tính expected profit
            const dailyAmounts = await getExpectedMoney(credit.id);
            const totalExpected = dailyAmounts.reduce((sum, amount) => sum + amount, 0);
            profit += totalExpected;
            
            console.log(`Credit ${credit.id}: Loan=${Math.round(loanAmount)}, Debt=${Math.round(creditDebt)}, Expected=${Math.round(totalExpected)} VNĐ`);
          } catch (error) {
            console.error(`Error calculating financials for credit ${credit.id}:`, error);
          }
        }
        
        console.log(`Total loan: ${Math.round(totalLoan)} VNĐ`);
        console.log(`Total old debt: ${Math.round(oldDebt)} VNĐ`);
        console.log(`Total expected profit: ${Math.round(profit)} VNĐ`);
      }
      
      // 4. Tính lãi phí đã thu = tổng credit_amount của các bản ghi payment có is_deleted = false
      let collectedInterest = 0;
      
      const { data: paymentHistory, error: paymentError } = await supabase
        .from('credit_history')
        .select('credit_amount')
        .eq('transaction_type', 'payment')
        .eq('is_deleted', false);
      
      if (paymentError) {
        console.error('Lỗi khi lấy lịch sử thanh toán:', paymentError);
      } else if (paymentHistory) {
        collectedInterest = paymentHistory.reduce((sum, record) => sum + (record.credit_amount || 0), 0);
        console.log(`Collected interest from ${paymentHistory.length} payment records: ${Math.round(collectedInterest)} VNĐ`);
      }
      
      // 6. Tổng hợp dữ liệu
      const financialSummary: StoreFinancialData = {
        totalFund: storeData?.investment || 0,
        availableFund: storeData?.cash_fund || 0,
        totalLoan: totalLoan,
        oldDebt: Math.round(oldDebt),
        profit: Math.round(profit),
        collectedInterest: Math.round(collectedInterest)
      };
      
      setFinancialData(financialSummary);
    } catch (error) {
      console.error('Lỗi khi lấy dữ liệu tài chính:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchFinancialData();
  }, [currentStore?.id]);
  
  return { data: financialData, loading, refresh: fetchFinancialData };
} 