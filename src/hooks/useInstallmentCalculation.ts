import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { InstallmentWithCustomer } from '@/models/installment';
import { calculateRemainingToPay } from '@/lib/installmentCalculations';
import { queryKeys } from '@/lib/query-keys';
import { getInstallmentStatusInfo, getInstallmentStatusCode } from '@/lib/installment-status-utils';

export interface ProcessedInstallment extends InstallmentWithCustomer {
  /** Tổng tiền đã đóng */
  totalPaid: number;
  /** Số tiền còn phải đóng */
  remainingToPay: number;
  /** Nhãn ngày phải đóng tiếp theo – Hôm nay, Ngày mai, dd/MM */
  nextPaymentDate: string;
  /** Thông tin trạng thái đã được tính toán */
  statusInfo: {
    label: string;
    color: string;
  };
}

export function useInstallmentCalculation(
  installments: InstallmentWithCustomer[]
) {
  const installmentIds = installments.map((i) => i.id);

  // React Query for caching paid amounts - expensive RPC call
  const { data: paidData, isLoading: paidLoading, error: paidError } = useQuery({
    queryKey: queryKeys.installments.paidAmounts(installmentIds),
    queryFn: async () => {
      if (installmentIds.length === 0) return [];

      const { data, error } = await supabase.rpc('installment_get_paid_amount', {
        p_installment_ids: installmentIds,
      });

      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: installmentIds.length > 0,
    staleTime: 1 * 60 * 1000, // 1 minute cache - payments can happen frequently
  });

  const compute = useCallback(() => {
    if (installments.length === 0) {
      return [];
    }

    try {
      /** 1. Tổng tiền đã đóng - use cached data */
      const paidMap = new Map<string, number>(
        (paidData ?? []).map((r: { installment_id: string; total_paid?: number; paid_amount?: number }) =>
          [r.installment_id, Number(r.total_paid ?? r.paid_amount ?? 0)]
        )
      );
      /** 2. Get status codes directly from database view */
      // No need for complex status calculation - just use status_code from view

      /** 3. Build enriched list */
      const enriched: ProcessedInstallment[] = installments.map((it) => {
        const totalPaid = paidMap.get(it.id) ?? 0;
        const remaining = calculateRemainingToPay(it, totalPaid);

        // Tính nhãn ngày phải đóng tiếp theo
        let nextPaymentDateLabel: string;
        if (!it.payment_due_date) {
          nextPaymentDateLabel = 'Hoàn thành';
        } else {
          const due = new Date(it.payment_due_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
          if (diff === 0) nextPaymentDateLabel = 'Hôm nay';
          else if (diff === 1) nextPaymentDateLabel = 'Ngày mai';
          else {
            const day = due.getDate().toString().padStart(2, '0');
            const month = (due.getMonth() + 1).toString().padStart(2, '0');
            nextPaymentDateLabel = `${day}/${month}`;
          }
        }

        // Get status info using simplified utility
        const statusCode = getInstallmentStatusCode(it);
        const statusInfo = getInstallmentStatusInfo(statusCode);

        return {
          ...it,
          totalPaid,
          remainingToPay: remaining,
          nextPaymentDate: nextPaymentDateLabel,
          statusInfo,
        } as ProcessedInstallment;
      });

      return enriched;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error computing installment aggregates:', err);
      }
      return [];
    }
  }, [installments, paidData]);

  // Compute processed installments whenever data changes
  const processedInstallments = compute();

  return {
    processedInstallments,
    loading: paidLoading,
    refresh: () => {
      // This will trigger a refetch of the paid amounts query
    },
  };
} 