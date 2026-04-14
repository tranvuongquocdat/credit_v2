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
        const _tTotal = performance.now();

        // First, get the store financial data for cash_fund
        const _t1 = performance.now();
        const storeFinancialData = await getStoreFinancialData(currentStore.id);
        console.log(`[PERF] summary - getStoreFinancialData: ${Math.round(performance.now() - _t1)}ms`);

        // Lấy active và closed installments song song — 2 queries độc lập nhau
        const _t2 = performance.now();
        const [
          { data: activeInstallments, error: installmentsError },
          { data: closedInstallments, error: closedInstallmentsError },
        ] = await Promise.all([
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
            .eq('store_id', currentStore.id),
          supabase
            .from('installments_by_store')
            .select('id')
            .eq('status_code', 'CLOSED')
            .eq('store_id', currentStore.id),
        ]);

        console.log(`[PERF] summary - fetch active+closed (parallel): ${Math.round(performance.now() - _t2)}ms — active: ${activeInstallments?.length ?? 0}, closed: ${closedInstallments?.length ?? 0}`);

        if (installmentsError) {
          throw installmentsError;
        }
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

        /* 3.1 + 3.2 + 3.3 — chạy song song, logic xử lý kết quả giữ nguyên */
        const _t3 = performance.now();
        const [
          { data: debtRows },
          { data: paidRows },
          { data: profitRows },
        ] = await Promise.all([
          supabase.rpc('get_installment_old_debt', { p_installment_ids: ids }),
          supabase.rpc('installment_get_paid_amount', { p_installment_ids: ids }),
          supabase.rpc('installment_get_collected_profit', { p_installment_ids: [...ids, ...closedIds] }),
        ]);
        console.log(`[PERF] summary - 3 RPCs (parallel): ${Math.round(performance.now() - _t3)}ms — ${ids.length} active ids`);

        /* xây 3 map rồi truyền xuống calculateInstallmentMetrics */
        const debtMap   = new Map(debtRows?.map(r => [r.installment_id, Number(r.old_debt)]));
        const paidMap   = new Map(paidRows?.map(r => [r.installment_id, Number(r.paid_amount)]));
        const profitMap = new Map(profitRows?.map(r => [r.installment_id, Number(r.profit_collected)]));

        const _t4 = performance.now();
        const results = await Promise.all(
          activeInstallments.map(inst =>
            calculateInstallmentMetrics(inst, { debtMap, paidMap, profitMap })
          )
        );
        console.log(`[PERF] summary - calculateInstallmentMetrics x${activeInstallments.length}: ${Math.round(performance.now() - _t4)}ms`);

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

        console.log(`[PERF] summary - TOTAL: ${Math.round(performance.now() - _tTotal)}ms`);
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