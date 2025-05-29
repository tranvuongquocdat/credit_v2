import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { InstallmentStatus } from '@/models/installment';
import { StoreFinancialData, getStoreFinancialData } from '@/lib/store';
import { useStore } from '@/contexts/StoreContext';
import { getInstallmentAmountHistory } from '@/lib/installmentAmountHistory';
import { calculateTotalPaidFromHistory } from '@/lib/installmentCalculations';

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
      let query = supabase
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
      
      const { data: activeInstallments, error: installmentsError } = await query;
      
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
      
      
      if (activeInstallments) {
        // Tính tiền nợ cũ và lãi phí đã thu
        for (const installment of activeInstallments) {
          // Skip if installment.id is null
          if (!installment.id) continue;
          
          // Lấy lịch sử giao dịch của hợp đồng này
          const { data: amountHistory, error: historyError } = await getInstallmentAmountHistory(installment.id);
          
          if (historyError) {
            console.error(`Error loading history for installment ${installment.id}:`, historyError);
            continue;
          }
          
          // Tính tổng tiền đã đóng từ lịch sử (payment, cancel_payment, debt_payment)
          const totalPaidFromHistory = calculateTotalPaidFromHistory(amountHistory || []);
          
          // Tính nợ cũ
          totalOldDebt += 0 - (installment.debt_amount || 0);
          
          // Tính lãi phí đã thu: totalPaidFromHistory - down_payment (nếu dương)
          const profitCollected = Math.max(0, totalPaidFromHistory - (installment.down_payment || 0));
          collectedProfit += profitCollected;
          
          // Tính tổng tiền cho vay (tiền giao khách): down_payment - totalPaidFromHistory (nếu dương)
          const loanAmount = Math.max(0, (installment.down_payment || 0) - totalPaidFromHistory);
          totalLoan += loanAmount;
          
          // Lãi phí dự kiến = installment_amount - down_payment
          if(installment.status === InstallmentStatus.ON_TIME){
            expectedProfit += (installment.installment_amount || 0) - (installment.down_payment || 0);
          }
        }
      }
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