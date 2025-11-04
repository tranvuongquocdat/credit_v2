import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getInstallments } from '@/lib/installment';
import { InstallmentFilters } from '@/models/installment';

/**
 * Prefetching utilities for React Query to improve user experience
 * by loading related data before it's needed
 */

/**
 * Prefetch installment data for a specific page and filters
 */
export async function prefetchInstallmentsPage(
  queryClient: QueryClient,
  filters: InstallmentFilters,
  page: number,
  itemsPerPage: number,
  storeId?: string
) {
  try {
    // Add store_id to filters if provided
    const filtersWithStore = storeId
      ? { ...filters, store_id: storeId }
      : filters;

    await queryClient.prefetchQuery({
      queryKey: queryKeys.installments.list(filters, page, itemsPerPage, storeId),
      queryFn: () => getInstallments(page, itemsPerPage, filtersWithStore),
      staleTime: 2 * 60 * 1000, // 2 minutes
    });
  } catch (error) {
    console.warn('Failed to prefetch installments page:', error);
  }
}

/**
 * Prefetch installment details for viewing/editing
 */
export async function prefetchInstallmentDetails(
  queryClient: QueryClient,
  installmentId: string
) {
  try {
    // Prefetch installment calculation data
    await queryClient.prefetchQuery({
      queryKey: queryKeys.installments.paidAmounts([installmentId]),
      queryFn: async () => {
        const { supabase } = await import('@/lib/supabase');
        const { data, error } = await supabase.rpc('installment_get_paid_amount', {
          p_installment_ids: [installmentId],
        });
        if (error) throw error;
        return data || [];
      },
      staleTime: 1 * 60 * 1000, // 1 minute
    });

    // Prefetch payment period information
    await queryClient.prefetchQuery({
      queryKey: queryKeys.installments.hasPaidPeriods([installmentId]),
      queryFn: async () => {
        const { supabase } = await import('@/lib/supabase');
        const { data, error } = await supabase
          .from('installment_history')
          .select('installment_id')
          .eq('transaction_type', 'payment')
          .eq('is_deleted', false)
          .eq('installment_id', installmentId);

        if (error) throw error;
        return { [installmentId]: data && data.length > 0 };
      },
      staleTime: 2 * 60 * 1000, // 2 minutes
    });
  } catch (error) {
    console.warn('Failed to prefetch installment details:', error);
  }
}

/**
 * Prefetch data for pagination - load next page in background
 */
export async function prefetchNextPage(
  queryClient: QueryClient,
  currentPage: number,
  filters: InstallmentFilters,
  itemsPerPage: number,
  storeId?: string
) {
  const nextPage = currentPage + 1;
  await prefetchInstallmentsPage(queryClient, filters, nextPage, itemsPerPage, storeId);
}

/**
 * Prefetch data for search results
 */
export async function prefetchSearchResults(
  queryClient: QueryClient,
  searchFilters: InstallmentFilters,
  storeId?: string
) {
  try {
    // Prefetch first page of search results
    await prefetchInstallmentsPage(queryClient, searchFilters, 1, 30, storeId);

    // Note: Summary data prefetching is skipped to avoid hook usage in non-React context
    // This could be added later by extracting the query logic from useInstallmentsSummary
  } catch (error) {
    console.warn('Failed to prefetch search results:', error);
  }
}

/**
 * Prefetch related data after successful mutations
 */
export async function prefetchAfterMutation(
  queryClient: QueryClient,
  installmentIds: string[],
  storeId?: string
) {
  try {
    // Prefetch updated payment calculations
    await queryClient.prefetchQuery({
      queryKey: queryKeys.installments.paidAmounts(installmentIds),
      queryFn: async () => {
        const { supabase } = await import('@/lib/supabase');
        const { data, error } = await supabase.rpc('installment_get_paid_amount', {
          p_installment_ids: installmentIds,
        });
        if (error) throw error;
        return data || [];
      },
      staleTime: 1 * 60 * 1000, // 1 minute
    });

    // Prefetch updated payment period info
    await queryClient.prefetchQuery({
      queryKey: queryKeys.installments.hasPaidPeriods(installmentIds),
      queryFn: async () => {
        const { supabase } = await import('@/lib/supabase');
        const { data, error } = await supabase
          .from('installment_history')
          .select('installment_id')
          .eq('transaction_type', 'payment')
          .eq('is_deleted', false)
          .in('installment_id', installmentIds);

        if (error) throw error;

        const result: Record<string, boolean> = {};
        installmentIds.forEach(id => {
          result[id] = false;
        });

        if (data) {
          const paidIds = [...new Set(data.map(item => item.installment_id))];
          paidIds.forEach(id => {
            result[id] = true;
          });
        }

        return result;
      },
      staleTime: 2 * 60 * 1000, // 2 minutes
    });
  } catch (error) {
    console.warn('Failed to prefetch after mutation:', error);
  }
}