import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
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
          .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST'])
          .eq('store_id', currentStore.id);

        if (installmentsError) {
          throw installmentsError;
        }

        // Lấy danh sách hợp đồng đã đóng
        const { data: closedInstallments, error: closedInstallmentsError } = await supabase
          .from('installments_by_store')
          .select('id')
          .eq('status_code', 'CLOSED')
          .eq('store_id', currentStore.id);

        if (closedInstallmentsError) {
          throw closedInstallmentsError;
        }

        const closedIds = closedInstallments
          ?.map(it => it.id)
          .filter((id): id is string => id !== null) || [];   // → string[]

        // Initialize summary data with store financial data
        let summaryData: StoreFinancialData = {
          totalFund: storeFinancialData.availableFund || 0,
          availableFund: storeFinancialData.availableFund || 0,
          totalLoan: 0,
          oldDebt: 0,
          profit: 0,
          collectedInterest: 0
        };

        // Always calculate profit from closed installments, even if there are no active ones
        if (closedIds.length > 0) {
          const { data: closedProfitRows } = await supabase.rpc(
            'installment_get_collected_profit', { p_installment_ids: closedIds }
          );

          if (closedProfitRows) {
            const closedProfitMap = new Map(closedProfitRows.map(r => [r.installment_id, Number(r.profit_collected)]));
            let collectedProfitFromClosed = 0;
            closedIds.forEach(id => {
              const profitVal = closedProfitMap.get(id ?? '') ?? 0;
              collectedProfitFromClosed += profitVal;
            });
            // Only set this if there are no active installments to avoid double counting
            if (!activeInstallments || activeInstallments.length === 0) {
              summaryData.collectedInterest = collectedProfitFromClosed;
            }
          }
        }

        // Check if there are any active installments to process
        if (!activeInstallments || activeInstallments.length === 0) {
          return summaryData;
        }

        const ids = activeInstallments
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

        // Add profit from closed installments (already calculated above if no active installments)
        if (closedIds.length > 0) {
          closedIds.forEach(id => {
            const profitVal = profitMap.get(id ?? '') ?? 0;
            collectedProfit += profitVal;
          });
        }

        summaryData = {
          // Use the cash_fund from the store financial data
          totalFund: storeFinancialData.availableFund || 0,
          availableFund: storeFinancialData.availableFund || 0,
          totalLoan: totalLoan,
          oldDebt: totalOldDebt,
          profit: expectedProfit,
          collectedInterest: collectedProfit
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