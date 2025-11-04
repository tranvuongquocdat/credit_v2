import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { CreditWithCustomer, CreditStatus } from '@/models/credit';
import { getCredits, deleteCredit, updateCredit, CreditFilters } from '@/lib/credit';
import { SearchFilters } from '@/components/Credits/SearchFilters';
import { useStore } from '@/contexts/StoreContext';
import { queryKeys } from '@/lib/query-keys';
import { useToast } from '@/components/ui/use-toast';

// Define the search filters type from the existing component
interface CreditSearchFilters {
  contract_code?: string;
  customer_name?: string;
  start_date?: string;
  end_date?: string;
  duration?: number;
  status?: string;
}

// Define the return type for getCredits function
type CreditsQueryResult = {
  data: CreditWithCustomer[];
  total: number;
  page: number;
  limit: number;
  error: null | unknown;
};

export function useCredits(initialFilters?: Partial<CreditSearchFilters>) {
  // Pagination and filter state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);
  const [filters, setFilters] = useState<CreditSearchFilters>({
    contract_code: initialFilters?.contract_code || '',
    customer_name: initialFilters?.customer_name || '',
    start_date: initialFilters?.start_date || '',
    end_date: initialFilters?.end_date || '',
    duration: initialFilters?.duration || undefined,
    status: initialFilters?.status || 'on_time'
  });

  // Get current store and toast
  const { currentStore } = useStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Convert SearchFilters to CreditFilters
  const convertToApiFilters = useCallback((searchFilters: CreditSearchFilters): CreditFilters => {
    return {
      contract_code: searchFilters.contract_code || undefined,
      customer_name: searchFilters.customer_name || undefined,
      start_date: searchFilters.start_date || undefined,
      end_date: searchFilters.end_date || undefined,
      status: searchFilters.status || undefined,
      duration: searchFilters.duration || undefined,
      store_id: currentStore?.id
    };
  }, [currentStore]);

  // Prepare query key for caching using centralized query keys
  const queryKey = queryKeys.credits.list(filters, currentPage, itemsPerPage, currentStore?.id);

  // Query function with AbortController support
  const fetchCredits = useCallback(async () => {
    // Kiểm tra currentStore - nếu không có store thì trả về dữ liệu rỗng
    if (!currentStore) {
      return { data: [], count: 0, error: null };
    }

    try {
      const apiFilters = convertToApiFilters(filters);
      const result = await getCredits(currentPage, itemsPerPage, apiFilters);
      return result;
    } catch (error) {
      console.error('Error fetching credits:', error);
      throw error;
    }
  }, [currentPage, itemsPerPage, filters, convertToApiFilters, currentStore]);

  // React Query for credits data
  const { data: queryData, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: fetchCredits,
    enabled: !!currentStore?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes cache
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
  });

  // Extract data from query result
  const credits = queryData?.data || [];
  const totalItems = queryData ? ('total' in queryData ? queryData.total : queryData.count) : 0;

  // React Query mutation for updating credit status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CreditStatus }) => {
      const { error } = await updateCredit(id, { status });
      if (error) throw error;
      return { id, status };
    },
    onSuccess: () => {
      // Invalidate related queries to ensure consistency using centralized query keys
      queryClient.invalidateQueries({ queryKey: queryKeys.credits.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits.summary(currentStore?.id) });

      toast({
        title: "Thành công",
        description: "Đã cập nhật trạng thái hợp đồng tín dụng"
      });
    },
    onError: (error: Error) => {
      console.error("Error updating credit status:", error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật trạng thái hợp đồng",
        variant: "destructive"
      });
    },
  });

  // React Query mutation for deleting credit
  const deleteMutation = useMutation({
    mutationFn: async (creditId: string) => {
      const { error } = await deleteCredit(creditId);
      if (error) throw error;
      return creditId;
    },
    onMutate: async (creditId) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(queryKey);

      // Optimistically remove the credit from the cache
      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!old) return old;
        const typedOld = old as CreditsQueryResult;
        return {
          ...typedOld,
          data: typedOld.data.filter((credit: CreditWithCustomer) => credit.id !== creditId),
          total: typedOld.total - 1
        };
      });

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onError: (err, creditId, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }

      toast({
        title: "Lỗi",
        description: "Không thể xóa hợp đồng tín dụng",
        variant: "destructive"
      });
    },
    onSuccess: async (creditId) => {
      // Invalidate related queries to ensure consistency using centralized query keys
      queryClient.invalidateQueries({ queryKey: queryKeys.credits.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits.summary(currentStore?.id) });

      toast({
        title: "Thành công",
        description: "Đã xóa hợp đồng tín dụng"
      });

      // Refetch if we might have deleted the last item on a page
      if (credits.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1);
      }
    },
  });

  // Handle search filters
  const handleSearch = useCallback((newFilters: CreditSearchFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when searching

    // Development logging only
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 useCreditsQuery handleSearch called with newFilters:', newFilters);
    }
  }, []);

  // Handle reset
  const handleReset = useCallback(() => {
    const resetFilters = {
      contract_code: '',
      customer_name: '',
      start_date: '',
      end_date: '',
      status: 'on_time'
    };
    setFilters(resetFilters);
    setCurrentPage(1);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Handle page size change
  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setItemsPerPage(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  }, []);

  // Handle delete (wrapper for the mutation)
  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Có lỗi xảy ra' };
    }
  }, [deleteMutation]);

  // Handle updating status (wrapper for the mutation)
  const handleUpdateStatus = useCallback(async (id: string, status: CreditStatus) => {
    try {
      await updateStatusMutation.mutateAsync({ id, status });
      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Có lỗi xảy ra' };
    }
  }, [updateStatusMutation]);

  return {
    credits,
    loading: isLoading,
    error,
    totalItems,
    currentPage,
    itemsPerPage,
    filters,
    handleSearch,
    handleReset,
    handlePageChange,
    handlePageSizeChange,
    handleDelete,
    handleUpdateStatus,
    refetch
  };
}