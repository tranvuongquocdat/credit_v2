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

      // Lấy danh sách hợp đồng đã đóng
      const { data: closedInstallments, error: closedInstallmentsError } = await supabase
        .from('installments_by_store')
        .select('id')
        .eq('status', InstallmentStatus.CLOSED)
        .eq('store_id', currentStore.id);
      
      if (closedInstallmentsError) {
        throw closedInstallmentsError;
      }

      // Check if there are any installments to process
      if (!activeInstallments || activeInstallments.length === 0) {
        setData(storeFinancialData);
        return;
      }

      const ids = activeInstallments
        .map(it => it.id)
        .filter((id): id is string => id !== null);   // → string[]

      const closedIds = closedInstallments
        .map(it => it.id)
        .filter((id): id is string => id !== null);   // → string[]

      /* 3.1 oldDebt (đã có) */
      const { data: debtRows } = await supabase.rpc(
        'get_installment_old_debt', { p_installment_ids: ids }
      );

      /* 3.2 tổng paid (cho loanAmount) */
      const { data: paidRows } = await supabase.rpc(
        'installment_get_paid_amount', { p_installment_ids: ids }
      );

      /* 3.3 profitCollected ( tính cả hợp đồng đã đóng )  */
      const { data: profitRows } = await supabase.rpc(
        'installment_get_collected_profit', { p_installment_ids: [...ids, ...closedIds] }
      );

      /* xây 3 map rồi truyền xuống calculateInstallmentMetrics */
      const debtMap   = new Map(debtRows?.map(r => [r.installment_id, Number(r.old_debt)]));
      const paidMap   = new Map(paidRows?.map(r => [r.installment_id, Number(r.paid_amount)]));
      const profitMap = new Map(profitRows?.map(r => [r.installment_id, Number(r.profit_collected)]));

      const results = await Promise.all(
        activeInstallments.map(inst =>
          calculateInstallmentMetrics(inst, { debtMap, paidMap, profitMap })
        )
      );

      /* gộp kết quả */
      let totalLoan = 0;
      let totalOldDebt = 0;
      let expectedProfit = 0;
      let collectedProfit = 0;
      
      results.forEach((result, idx) => {
        const id = activeInstallments[idx].id;
        const oldDebtVal = debtMap.get(id ?? '') ?? 0;       // dùng nợ cũ lấy từ RPC
        totalOldDebt   += oldDebtVal;

        if (result) {
          collectedProfit += result.profitCollected;
          totalLoan       += result.loanAmount;
          expectedProfit  += result.expectedProfitAmount;
        }
      });
      closedIds.forEach(id => {
        const profitVal = profitMap.get(id ?? '') ?? 0;       // dùng nợ cũ lấy từ RPC
        collectedProfit   += profitVal;
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