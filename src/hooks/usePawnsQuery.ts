'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { PawnStatus, PawnWithCustomer, PawnFilters } from '@/models/pawn';
import { toast } from '@/components/ui/use-toast';
import { deletePawn, getPawns } from '@/lib/pawn';
import { useStore } from '@/contexts/StoreContext';
import { queryKeys } from '@/lib/query-keys';

// Default values for pagination
const DEFAULT_PAGE = 1;
const DEFAULT_ITEMS_PER_PAGE = 30;

// Define the search filters type from the existing component
interface PawnSearchFilters {
  contractCode?: string;
  customerName?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  duration?: number;
}

// Define the return type for getPawns function
type PawnsQueryResult = {
  data: PawnWithCustomer[];
  total: number;
  page: number;
  limit: number;
  error: null | unknown;
};

export function usePawns() {
  // State for pagination
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);

  // State for search filters
  const [filters, setFilters] = useState<PawnSearchFilters>({
    status: 'on_time'
  });

  // Get current store and toast
  const { currentStore } = useStore();
  const queryClient = useQueryClient();

  // Prepare query key for caching using centralized query keys
  const queryKey = queryKeys.pawns.list(filters, currentPage, itemsPerPage, currentStore?.id);

  // Query function with optimized structure
  const fetchPawns = useCallback(async () => {
    // Kiểm tra currentStore - nếu không có store thì trả về dữ liệu rỗng
    if (!currentStore) {
      return { data: [], total: 0, error: null };
    }

    try {
      // Convert SearchFilters to PawnFilters
      const pawnFilters: PawnFilters = {
        contract_code: filters.contractCode,
        customer_name: filters.customerName,
        start_date: filters.startDate,
        end_date: filters.endDate,
        status: filters.status as PawnFilters['status'] || undefined,
        loan_period: filters.duration || undefined,
        store_id: currentStore.id
      };

      const result = await getPawns(currentPage, itemsPerPage, pawnFilters);
      return result;
    } catch (error) {
      console.error('Error fetching pawns:', error);
      throw error;
    }
  }, [currentPage, itemsPerPage, filters, currentStore]);

  // React Query for pawns data
  const { data: queryData, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: fetchPawns,
    enabled: !!currentStore?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes cache
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
  });

  // Extract data from query result
  const pawns = queryData?.data || [];
  const totalItems = queryData ? ('total' in queryData ? queryData.total : 0) : 0;

  // React Query mutation for deleting pawn
  const deleteMutation = useMutation({
    mutationFn: async (pawnId: string) => {
      const { error } = await deletePawn(pawnId);
      if (error) throw error;
      return pawnId;
    },
    onMutate: async (pawnId) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(queryKey);

      // Optimistically remove the pawn from the cache
      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!old) return old;
        const typedOld = old as PawnsQueryResult;
        return {
          ...typedOld,
          data: typedOld.data.filter((pawn: PawnWithCustomer) => pawn.id !== pawnId),
          total: typedOld.total - 1
        };
      });

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onError: (err, pawnId, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }

      toast({
        title: "Lỗi",
        description: "Không thể xóa hợp đồng cầm cố",
        variant: "destructive"
      });
    },
    onSuccess: async (pawnId) => {
      // Invalidate related queries to ensure consistency using centralized query keys
      queryClient.invalidateQueries({ queryKey: queryKeys.pawns.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.pawns.summary(currentStore?.id) });

      toast({
        title: "Thành công",
        description: "Đã xóa hợp đồng cầm cố"
      });

      // Refetch if we might have deleted the last item on a page
      if (pawns.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1);
      }
    },
  });

  // React Query mutation for updating pawn status (simulated for now)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ pawnId, status }: { pawnId: string; status: PawnStatus }) => {
      // In a real implementation, this would make an API call to update the pawn status
      // For now, we'll simulate the response with optimistic update
      return { pawnId, status };
    },
    onSuccess: () => {
      // Invalidate related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.pawns.all });

      toast({
        title: "Thành công",
        description: "Đã cập nhật trạng thái hợp đồng cầm cố"
      });
    },
    onError: (error: Error) => {
      console.error("Error updating pawn status:", error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật trạng thái hợp đồng cầm cố",
        variant: "destructive"
      });
    },
  });

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Handle page size change
  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setItemsPerPage(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  }, []);

  // Handle search with filters
  const handleSearch = useCallback((searchFilters: PawnSearchFilters) => {
    setFilters(searchFilters);
    setCurrentPage(DEFAULT_PAGE); // Reset to first page when searching
  }, []);

  // Handle reset filters
  const handleReset = useCallback(() => {
    setFilters({});
    setCurrentPage(DEFAULT_PAGE);
  }, []);

  // Handle delete (wrapper for the mutation)
  const handleDelete = useCallback(async (pawnId: string) => {
    try {
      await deleteMutation.mutateAsync(pawnId);
      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Có lỗi xảy ra' };
    }
  }, [deleteMutation]);

  // Handle update status (wrapper for the mutation)
  const handleUpdateStatus = useCallback(async (pawnId: string, newStatus: PawnStatus) => {
    try {
      await updateStatusMutation.mutateAsync({ pawnId, status: newStatus });
      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Có lỗi xảy ra' };
    }
  }, [updateStatusMutation]);

  return {
    pawns,
    loading: isLoading,
    error,
    totalItems,
    currentPage,
    itemsPerPage,
    filters,
    handlePageChange,
    handlePageSizeChange,
    handleSearch,
    handleReset,
    handleDelete,
    handleUpdateStatus,
    refetch
  };
}