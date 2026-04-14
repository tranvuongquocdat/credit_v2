import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  getInstallments,
  updateInstallmentStatus,
  deleteInstallment
} from '@/lib/installment';
import { InstallmentFilters, InstallmentStatus, InstallmentWithCustomer } from '@/models/installment';
import { useToast } from '@/components/ui/use-toast';
import { useStore } from '@/contexts/StoreContext';
import { queryKeys } from '@/lib/query-keys';
import { prefetchNextPage, prefetchAfterMutation, prefetchInstallmentsPage } from '@/lib/react-query-prefetching';

export function useInstallments() {
  // Pagination and filter state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  // Get current store from context
  const { currentStore } = useStore();

  const [filters, setFiltersOriginal] = useState<InstallmentFilters>({
    status: InstallmentStatus.ON_TIME, // Mặc định hiển thị các hợp đồng đang vay
    store_id: currentStore?.id // Set default store_id from context
  });

  // Wrapper để log mọi filter changes (simplified logging for production)
  const setFilters = (newFilters: InstallmentFilters | ((prev: InstallmentFilters) => InstallmentFilters)) => {
    setFiltersOriginal(newFilters);
  };

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Prepare query key for caching using centralized query keys
  const queryKey = queryKeys.installments.list(filters, currentPage, itemsPerPage, currentStore?.id);

  // Query function with AbortController support
  const fetchInstallments = useCallback(async () => {
    // Kiểm tra currentStore - nếu không có store thì trả về dữ liệu rỗng
    if (!currentStore) {
      return { data: [], count: 0, error: null };
    }

    // Always ensure store_id is set from context if available
    const currentFilters = {
      ...filters,
      store_id: currentStore.id
    };

    try {
      const { data, error, count } = await getInstallments(currentPage, itemsPerPage, currentFilters);

      if (error) throw new Error(error.message);

      return { data, count: count || 0, error: null };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Có lỗi xảy ra khi tải dữ liệu';
      return { data: [], count: 0, error: errorMessage };
    }
  }, [currentPage, itemsPerPage, filters, currentStore]);

  // React Query for installments data
  const { data: queryData, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: fetchInstallments,
    enabled: !!currentStore?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes cache
  });

  // Extract data from query result
  const installments = queryData?.data || [];
  const totalItems = queryData?.count || 0;

  // Prefetch next page when current page is loaded successfully
  useEffect(() => {
    if (queryData?.data && queryData.data.length === itemsPerPage && currentPage > 0) {
      // Only prefetch if we have a full page (indicating there might be more)
      prefetchNextPage(queryClient, currentPage, filters, itemsPerPage, currentStore?.id);
    }
  }, [currentPage, filters, itemsPerPage, currentStore?.id, queryData?.data, queryClient]);

  // Handle search filters
  const handleSearch = (newFilters: InstallmentFilters) => {
    // Development logging only
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 useInstallments handleSearch called with newFilters:', newFilters);
    }
    // Preserve the store_id from context
    const updatedFilters = {
      ...newFilters,
      store_id: currentStore?.id || newFilters.store_id
    };
    setFilters(updatedFilters);
    setCurrentPage(1); // Reset về trang 1 khi search
  };

  // Handle reset filters
  const handleReset = () => {
    setFilters({
      status: InstallmentStatus.ON_TIME, // Khi reset vẫn giữ lại trạng thái mặc định là đang vay
      store_id: currentStore?.id // Keep current store
    });
    setCurrentPage(1);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handle page size change
  const handlePageSizeChange = (newPageSize: number) => {
    setItemsPerPage(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // React Query mutation for updating status
  const updateStatusMutation = useMutation({
    mutationFn: ({ installmentId, status }: { installmentId: string; status: InstallmentStatus }) =>
      updateInstallmentStatus(installmentId, status),
    onMutate: async ({ installmentId, status }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(queryKey);

      // Optimistically update to the new value
      queryClient.setQueryData(queryKey, (oldData: { data?: InstallmentWithCustomer[], count?: number } | undefined) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((item: InstallmentWithCustomer) =>
            item.id === installmentId ? { ...item, status } : item
          )
        };
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }

      const errorMessage = err instanceof Error ? err.message : 'Không thể cập nhật trạng thái.';

      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive"
      });
    },
    onSuccess: async () => {
      // Invalidate related queries to ensure consistency using centralized query keys
      queryClient.invalidateQueries({ queryKey: queryKeys.installments.summary(currentStore?.id) });

      toast({
        title: "Thành công",
        description: "Đã cập nhật trạng thái hợp đồng"
      });

      // Prefetch current page data for faster UI response
      try {
        await prefetchInstallmentsPage(queryClient, filters, currentPage, itemsPerPage, currentStore?.id);
      } catch (error) {
        // Prefetching errors are not critical, ignore them
      }
    },
  });

  // React Query mutation for deleting installment
  const deleteMutation = useMutation({
    mutationFn: deleteInstallment,
    onMutate: async (installmentId: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(queryKey);

      // Optimistically remove the item from the cache
      queryClient.setQueryData(queryKey, (oldData: { data?: InstallmentWithCustomer[] }) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.filter((item: InstallmentWithCustomer) => item.id !== installmentId)
        };
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, roll back
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }

      const errorMessage = err instanceof Error ? err.message : 'Không thể xóa hợp đồng.';

      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive"
      });
    },
    onSuccess: async () => {
      // Invalidate related queries to ensure consistency using centralized query keys
      queryClient.invalidateQueries({ queryKey: queryKeys.installments.summary(currentStore?.id) });

      toast({
        title: "Thành công",
        description: "Đã xóa hợp đồng"
      });

      // Prefetch current page data for faster UI response
      try {
        await prefetchInstallmentsPage(queryClient, filters, currentPage, itemsPerPage, currentStore?.id);
      } catch (error) {
        // Prefetching errors are not critical, ignore them
      }
    },
  });

  // Handle updating status (wrapper for the mutation)
  const handleUpdateStatus = async (installmentId: string, status: InstallmentStatus): Promise<{ success: boolean; error: string | null }> => {
    try {
      await updateStatusMutation.mutateAsync({ installmentId, status });
      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Có lỗi xảy ra' };
    }
  };

  // Handle delete (wrapper for the mutation)
  const handleDelete = async (installment: InstallmentWithCustomer): Promise<{ success: boolean; error: string | null }> => {
    try {
      await deleteMutation.mutateAsync(installment.id);
      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Có lỗi xảy ra' };
    }
  };

  return {
    installments,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    totalItems,
    currentPage,
    itemsPerPage,
    handleSearch,
    handleReset,
    handlePageChange,
    handlePageSizeChange,
    handleUpdateStatus,
    handleDelete,
    refetch,
    filters              // expose current filters for external usage
  };
}
