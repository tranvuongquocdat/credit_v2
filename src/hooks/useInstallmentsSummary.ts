import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { InstallmentStatus } from '@/models/installment';
import { StoreFinancialData, getStoreFinancialData } from '@/lib/store';
import { useStore } from '@/contexts/StoreContext';
import { getinstallmentPaymentHistory } from '@/lib/Installments/payment_history';
import { calculateDebtToLatestPaidPeriod } from '@/lib/Installments/calculate_remaining_debt';

export function useInstallmentsSummary() {
  const [data, setData] = useState<StoreFinancialData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Get current store from context
  const { currentStore, loading: storeLoading } = useStore();

  const fetchData = async () => {
    // Don't fetch if store is still loading or no store is selected
    if (storeLoading || !currentStore?.id) {
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      // First, get the store financial data for cash_fund
      const storeFinancialData = await getStoreFinancialData(currentStore.id);
      
      // Lấy tất cả hợp đồng chưa bị xóa, chưa đóng và thuộc cửa hàng hiện tại
      const { data: activeInstallments, error: installmentsError } = await supabase
        .from('installments_by_store')
        .select(`
          id,
          contract_code,
          down_payment,
          installment_amount,
          status,
          store_id,
          debt_amount
        `)
        .eq('status', InstallmentStatus.ON_TIME)
        .eq('store_id', currentStore.id);
      
      if (installmentsError) {
        throw installmentsError;
      }
      
      // Check if there are any installments to process
      if (!activeInstallments || activeInstallments.length === 0) {
        setData(storeFinancialData);
        return;
      }

      // Tính toán các giá trị theo yêu cầu
      let totalLoan = 0; // Tổng tiền giao khách
      let totalOldDebt = 0; // Tổng nợ cũ
      let expectedProfit = 0; // Lãi phí dự kiến
      let collectedProfit = 0; // Lãi phí đã thu
      
      console.time('Calculate all installments');
      
      // Xử lý song song tất cả installments
      const results = await Promise.all(
        activeInstallments.map(async (installment) => {
          try {
            // Skip if installment.id is null
            if (!installment.id) return null;
            
            const paymentHistory = await getinstallmentPaymentHistory(installment.id);
            const totalPaidFromHistory = paymentHistory.reduce((sum, record) => sum + (record.credit_amount || 0), 0);
            
            // Tính nợ cũ
            const oldDebt = await calculateDebtToLatestPaidPeriod(installment.id);
            
            // Tính lãi phí đã thu: totalPaidFromHistory - down_payment (nếu dương)
            const profitCollected = Math.max(0, totalPaidFromHistory - (installment.down_payment || 0));
            
            // Tính tổng tiền cho vay (tiền giao khách): down_payment - totalPaidFromHistory (nếu dương)
            const loanAmount = Math.max(0, (installment.down_payment || 0) - totalPaidFromHistory);
            
            // Lãi phí dự kiến = installment_amount - down_payment
            const expectedProfitAmount = installment.status === InstallmentStatus.ON_TIME 
              ? (installment.installment_amount || 0) - (installment.down_payment || 0)
              : 0;
            
            return {
              oldDebt,
              profitCollected,
              loanAmount,
              expectedProfitAmount
            };
          } catch (error) {
            console.error(`Error calculating for installment ${installment.id}:`, error);
            return null;
          }
        })
      );
      
      console.timeEnd('Calculate all installments');
      
      // Aggregate results
      results.forEach(result => {
        if (result) {
          totalOldDebt += 0 - result.oldDebt;
          collectedProfit += result.profitCollected;
          totalLoan += result.loanAmount;
          expectedProfit += result.expectedProfitAmount;
        }
      });
      
      console.log("Collected Profit", collectedProfit);
      
      const summaryData: StoreFinancialData = {
        // Use the cash_fund from the store financial data
        totalFund: storeFinancialData.availableFund || 0,
        availableFund: storeFinancialData.availableFund || 0,
        totalLoan: totalLoan,
        oldDebt: totalOldDebt,
        profit: expectedProfit,
        collectedInterest: collectedProfit
      };

      setData(summaryData);
    } catch (err) {
      console.error('Error fetching installment summary:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when component mounts or when store changes
  useEffect(() => {
    fetchData();
  }, [currentStore?.id, storeLoading]);

  return { data, loading: loading || storeLoading, error, refresh: fetchData };
} 