import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditStatus } from '@/models/credit';
import { useStore } from '@/contexts/StoreContext';
import { getExpectedMoney } from '@/lib/Credits/create_principal_payment_history';

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
  const { currentStore } = useStore();
  
  const fetchFinancialData = async () => {
    try {
      setLoading(true);
      
      // 1. Lấy thông tin cơ bản từ store
      const storeId = currentStore?.id || '1';
      const { data: storeData } = await supabase
        .from('stores')
        .select('investment, cash_fund')
        .eq('id', storeId)
        .single();
      
      // 2. Lấy tổng tiền cho vay (tổng loan_amount của các hợp đồng đang vay)
      const { data: activeCreditsData, error: activeCreditsError } = await supabase
        .from('credits')
        .select('id, loan_amount')
        .in('status', [CreditStatus.ON_TIME, CreditStatus.OVERDUE, CreditStatus.LATE_INTEREST, CreditStatus.BAD_DEBT]);
      
      if (activeCreditsError) {
        console.error('Lỗi khi lấy dữ liệu hợp đồng đang hoạt động:', activeCreditsError);
      }
      
      // Tính tổng tiền cho vay
      const totalLoan = activeCreditsData?.reduce((sum, credit) => sum + (credit.loan_amount || 0), 0) || 0;
      
      // 3. Lấy tổng tiền nợ cũ
      const { data: oldDebtData, error: oldDebtError } = await supabase
        .from('credits')
        .select('debt_amount')
        .in('status', [CreditStatus.ON_TIME, CreditStatus.OVERDUE, CreditStatus.LATE_INTEREST, CreditStatus.BAD_DEBT]);
      
      if (oldDebtError) {
        console.error('Lỗi khi lấy dữ liệu nợ cũ:', oldDebtError);
      }
      
      // Tính tổng tiền nợ cũ sử dụng trường debt_amount
      const oldDebt = oldDebtData?.reduce((sum, credit) => sum + (credit.debt_amount || 0), 0) || 0;
      
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
      
      // 5. Tính lãi phí dự kiến = tổng getExpectedMoney của các hợp đồng ON_TIME
      let profit = 0;
      
      // Lấy danh sách hợp đồng ON_TIME
      const { data: onTimeCredits, error: onTimeCreditsError } = await supabase
        .from('credits')
        .select('id')
        .eq('status', CreditStatus.ON_TIME);
      
      if (onTimeCreditsError) {
        console.error('Lỗi khi lấy dữ liệu hợp đồng ON_TIME:', onTimeCreditsError);
      } else if (onTimeCredits && onTimeCredits.length > 0) {
        console.log(`Calculating expected profit for ${onTimeCredits.length} ON_TIME credits`);
        
        // Tính tổng getExpectedMoney cho tất cả hợp đồng ON_TIME
        for (const credit of onTimeCredits) {
          try {
            const dailyAmounts = await getExpectedMoney(credit.id);
            const totalExpected = dailyAmounts.reduce((sum, amount) => sum + amount, 0);
            profit += totalExpected;
            
            console.log(`Credit ${credit.id}: ${Math.round(totalExpected)} VNĐ expected`);
          } catch (error) {
            console.error(`Error calculating expected money for credit ${credit.id}:`, error);
          }
        }
        
        console.log(`Total expected profit: ${Math.round(profit)} VNĐ`);
      }
      
      // 6. Tổng hợp dữ liệu
      const financialSummary: StoreFinancialData = {
        totalFund: storeData?.investment || 0,
        availableFund: storeData?.cash_fund || 0,
        totalLoan: totalLoan,
        oldDebt: oldDebt,
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