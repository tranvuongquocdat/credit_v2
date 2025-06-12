import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { InstallmentStatus } from '@/models/installment';
import { StoreFinancialData, getStoreFinancialData } from '@/lib/store';
import { useStore } from '@/contexts/StoreContext';
import { calculateInstallmentMetrics } from '@/lib/Installments/calculate_installment_metrics';

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
          loan_period,
          loan_date,
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
      
      
      // Xử lý song song tất cả installments
      const results = await Promise.all(
        activeInstallments.map(installment => calculateInstallmentMetrics(installment))
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