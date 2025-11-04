import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getCustomers, createCustomer, updateCustomer } from '@/lib/customer';
import { queryKeys } from '@/lib/query-keys';
import { useStore } from '@/contexts/StoreContext';
import { Customer } from '@/models/customer';
import { CreateCustomerParams, UpdateCustomerParams } from '@/models/customer';

// Define the return type for getCustomers function
type CustomersQueryResult = {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  error: null | unknown;
} | {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  error: string;
} | {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  error: Error;
};

/**
 * Hook for fetching customers with React Query caching
 * Replaces manual state management with intelligent caching
 */
export function useCustomers(page = 1, limit = 1000, search = '', storeId?: string, status = '') {
  const { currentStore } = useStore();
  const effectiveStoreId = storeId || currentStore?.id || '';

  // React Query for customers data
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.customers.list(search, effectiveStoreId),
    queryFn: async () => {
      if (!effectiveStoreId) {
        return { data: [], error: 'Store ID is required', total: 0, page, limit: 1 };
      }

      try {
        const result = await getCustomers(page, limit, search, effectiveStoreId, status);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 [CUSTOMERS] Fetched ${result.data.length} customers for store ${effectiveStoreId}`);
        }
        return result;
      } catch (error) {
        console.error('Error fetching customers:', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache for customer data
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
    enabled: !!effectiveStoreId,
  });

  return {
    customers: data?.data || [],
    isLoading,
    error,
    refetch,
    count: data ? ('total' in data ? data.total : 0) : 0
  };
}

/**
 * Hook for caching customer search results
 * Useful for autocomplete functionality
 */
export function useCustomerSearch(search: string, enabled = true) {
  const { currentStore } = useStore();

  return useQuery({
    queryKey: queryKeys.customers.list(search, currentStore?.id || ''),
    queryFn: async () => {
      if (!currentStore?.id || !enabled) {
        return { data: [], count: 0 };
      }

      try {
        const result = await getCustomers(1, 50, search, currentStore.id, '');
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 [CUSTOMERS] Searched for "${search}" - Found ${result.data.length} results`);
        }
        return result;
      } catch (error) {
        console.error('Error searching customers:', error);
        throw error;
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes cache for search results
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    enabled: enabled && !!currentStore?.id && search.length > 0,
  });
}

/**
 * Hook for prefetching customer data
 * Useful for preloading data before user interactions
 */
export function usePrefetchCustomers() {
  const queryClient = useQueryClient();

  const prefetchCustomers = useCallback((search?: string, storeId?: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.customers.list(search || '', storeId || ''),
      queryFn: async () => {
        try {
          const result = await getCustomers(1, 50, search || '', storeId || '', '');
          return result;
        } catch (error) {
          // Prefetch errors are not critical, ignore them
          if (process.env.NODE_ENV === 'development') {
            console.warn('Failed to prefetch customers:', error);
          }
        }
      },
      staleTime: 2 * 60 * 1000,
    });
  }, [queryClient]);

  return { prefetchCustomers };
}

/**
 * Hook for creating customers with cache invalidation
 */
export function useCreateCustomerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateCustomerParams) => createCustomer(params),
    onSuccess: () => {
      // Invalidate all customer queries to refresh cache
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
    onError: (error) => {
      console.error('Error creating customer:', error);
    },
  });
}

/**
 * Hook for updating customers with cache invalidation
 */
export function useUpdateCustomerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomerParams }) =>
      updateCustomer(id, data),
    onSuccess: () => {
      // Invalidate all customer queries to refresh cache
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
    onError: (error) => {
      console.error('Error updating customer:', error);
    },
  });
}