import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { InstallmentWithCustomer } from '@/models/installment';
import { queryKeys } from '@/lib/query-keys';

interface PaymentPeriodInfo {
  [installmentId: string]: boolean;
}

/**
 * Hook to cache and check if installments have paid payment periods
 * Replaces individual API calls with a single batched query
 */
export function useInstallmentHasPaidPeriods(installments: InstallmentWithCustomer[]) {
  const installmentIds = installments.map(i => i.id);
  const queryClient = useQueryClient();

  // React Query for caching payment period information
  const { data, isLoading, error, refetch, isFetching, isInitialLoading } = useQuery({
    queryKey: queryKeys.installments.hasPaidPeriods(installmentIds),
    queryFn: async (): Promise<PaymentPeriodInfo> => {
      if (installmentIds.length === 0) return {};

      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 [CACHE] Fetching payment periods for ${installmentIds.length} installments`);
      }

      try {
        // Single query to get all payment period info at once
        const { data, error } = await supabase
          .from('installment_history')
          .select('installment_id')
          .eq('transaction_type', 'payment')
          .eq('is_deleted', false)
          .in('installment_id', installmentIds);

        if (error) {
          console.error('Error fetching payment period info:', error);
          throw error;
        }

        // Transform data into a lookup object
        const paymentPeriodInfo: PaymentPeriodInfo = {};

        // Initialize all installments as false
        installmentIds.forEach(id => {
          paymentPeriodInfo[id] = false;
        });

        // Mark installments that have payments as true
        if (data) {
          const paidInstallmentIds = [...new Set(data.map(item => item.installment_id))];
          paidInstallmentIds.forEach(id => {
            paymentPeriodInfo[id] = true;
          });
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ [CACHE] Payment periods loaded:`, Object.keys(paymentPeriodInfo).filter(id => paymentPeriodInfo[id]));
        }

        return paymentPeriodInfo;
      } catch (error) {
        console.error('Error in useInstallmentHasPaidPeriods:', error);
        throw error;
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - same as installment lists
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    enabled: installmentIds.length > 0,
  });

  // Add debugging for cache hits
  if (process.env.NODE_ENV === 'development') {
    // biome-ignore lint/correctness/useHookAtTopLevel: Debugging purposes only
    React.useEffect(() => {
      if (!isInitialLoading && !isFetching && data) {
        console.log(`📦 [CACHE] Payment periods loaded from cache (${installmentIds.length} installments)`);
      }
    }, [isInitialLoading, isFetching, data, installmentIds.length]);
  }

  return {
    hasPaidPaymentPeriods: data || {},
    isLoading,
    error,
    refetch,
  };
}