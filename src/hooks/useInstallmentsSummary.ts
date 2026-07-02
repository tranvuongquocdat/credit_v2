import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetch-all';
import { InstallmentStatus } from '@/models/installment';
import { StoreFinancialData, getStoreFinancialData } from '@/lib/store';
import { useStore } from '@/contexts/StoreContext';
import { calculateInstallmentMetrics } from '@/lib/Installments/calculate_installment_metrics';
import { queryKeys } from '@/lib/query-keys';

export function useInstallmentsSummary() {
  // Get current store from context
  const { currentStore, loading: storeLoading } = useStore();

  // React Query for installment summary data
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.installments.summary(currentStore?.id),
    queryFn: async () => {
      if (!currentStore?.id) {
        return null;
      }

      try {
        // First, get the store financial data for cash_fund
        const storeFinancialData = await getStoreFinancialData(currentStore.id);

        // Lấy tất cả hợp đồng chưa bị xóa, chưa đóng và thuộc cửa hàng hiện tại
        // (fetchAllRows phân trang tránh PostgREST cắt 1000 dòng khi store lớn)
        // + tổng "lãi phí đã thu" của TẤT CẢ hợp đồng qua RPC store-level
        // (thay cách cũ truyền mảng id closed — Nam sms 1178 HĐ closed bị cắt còn 1000)
        const [activeInstallments, { data: storeProfitData }] = await Promise.all([
          fetchAllRows(
            supabase
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
              .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST'])
              .eq('store_id', currentStore.id)
              .order('id')
          ),
          (supabase as any).rpc('rpc_store_installment_collected_profit', {
            p_store_id: currentStore.id
          })
        ]);

        const storeCollectedProfit = Number(storeProfitData || 0);

        // Initialize summary data with store financial data
        let summaryData: StoreFinancialData = {
          totalFund: storeFinancialData.availableFund || 0,
          availableFund: storeFinancialData.availableFund || 0,
          totalLoan: 0,
          oldDebt: 0,
          profit: 0,
          collectedInterest: storeCollectedProfit
        };

        // Check if there are any active installments to process
        if (!activeInstallments || activeInstallments.length === 0) {
          return summaryData;
        }

        const ids = activeInstallments
          .map((it: any) => it.id)
          .filter((id: any): id is string => id !== null);   // → string[]

        /* 3.1-3.3: 3 RPC song song, fetchAllRows phân trang response (RPC cũng bị cắt 1000 dòng).
           profitCollected chỉ cần cho HĐ active (làm map cho calculateInstallmentMetrics);
           tổng toàn store đã có storeCollectedProfit từ RPC store-level ở trên. */
        const [debtRows, paidRows, profitRows] = await Promise.all([
          fetchAllRows(supabase.rpc('get_installment_old_debt', { p_installment_ids: ids })),
          fetchAllRows(supabase.rpc('installment_get_paid_amount', { p_installment_ids: ids })),
          fetchAllRows(supabase.rpc('installment_get_collected_profit', { p_installment_ids: ids }))
        ]);

        /* xây 3 map rồi truyền xuống calculateInstallmentMetrics */
        const debtMap   = new Map(debtRows?.map((r: any) => [r.installment_id, Number(r.old_debt)]));
        const paidMap   = new Map(paidRows?.map((r: any) => [r.installment_id, Number(r.paid_amount)]));
        const profitMap = new Map(profitRows?.map((r: any) => [r.installment_id, Number(r.profit_collected)]));

        const results = await Promise.all(
          activeInstallments.map((inst: any) =>
            calculateInstallmentMetrics(inst, { debtMap, paidMap, profitMap })
          )
        );

        /* gộp kết quả */
        let totalLoan = 0;
        let totalOldDebt = 0;
        let expectedProfit = 0;

        results.forEach((result, idx) => {
          const id = activeInstallments[idx].id;
          const oldDebtVal = debtMap.get(id ?? '') ?? 0;       // dùng nợ cũ lấy từ RPC
          totalOldDebt   += oldDebtVal;

          if (result) {
            totalLoan       += result.loanAmount;
            expectedProfit  += result.expectedProfitAmount;
          }
        });

        summaryData = {
          // Use the cash_fund from the store financial data
          totalFund: storeFinancialData.availableFund || 0,
          availableFund: storeFinancialData.availableFund || 0,
          totalLoan: totalLoan,
          oldDebt: totalOldDebt,
          profit: expectedProfit,
          // Tổng toàn store (mọi HĐ trừ deleted) từ RPC store-level — không bị cắt 1000
          collectedInterest: storeCollectedProfit
        };

        return summaryData;
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching installment summary:', err);
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    enabled: !!currentStore?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes cache - financial data changes less frequently
  });

  return {
    data,
    loading: isLoading || storeLoading,
    error: error instanceof Error ? error : null,
    refresh: refetch
  };
} 