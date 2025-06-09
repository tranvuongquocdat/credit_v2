'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PawnStatus, PawnWithCustomer, PawnFilters } from '@/models/pawn';
import { toast } from '@/components/ui/use-toast';
import { getPawns } from '@/lib/pawn';
import { useStore } from '@/contexts/StoreContext';

// Default values for pagination
const DEFAULT_PAGE = 1;
const DEFAULT_ITEMS_PER_PAGE = 10;

interface SearchFilters {
  contractCode?: string;
  customerName?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export function usePawns() {
  // State for pawns data
  const [pawns, setPawns] = useState<PawnWithCustomer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for pagination
  const [totalItems, setTotalItems] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(DEFAULT_PAGE);
  const [itemsPerPage] = useState<number>(DEFAULT_ITEMS_PER_PAGE);
  
  // State for search filters
  const [filters, setFilters] = useState<SearchFilters>({});
  // Get current store from store context
  const { currentStore } = useStore();
  
  // AbortController for request cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Fetch pawns data from the API
  const fetchPawns = useCallback(async () => {
    const fetchId = Math.random().toString(36).substr(2, 9); // Unique ID
    const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.sss
    console.log(`📊 [${timestamp}] [${fetchId}] usePawns fetchPawns STARTED with filters:`, filters);
    
    // Kiểm tra currentStore - nếu không có store thì trả về dữ liệu rỗng
    if (!currentStore) {
      console.log(`🚫 [${timestamp}] [${fetchId}] No current store - returning empty data`);
      setPawns([]);
      setTotalItems(0);
      setLoading(false);
      setError(null); // Không hiển thị error, chỉ trả về dữ liệu rỗng
      return;
    }
    
    // Cancel previous request
    if (abortControllerRef.current) {
      console.log(`🚫 [${timestamp}] [${fetchId}] Cancelling previous request`);
      abortControllerRef.current.abort();
    }
    
    // Create new AbortController for this request  
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(null);
    
    try {
      // Convert SearchFilters to PawnFilters
      const pawnFilters: PawnFilters = {
        contract_code: filters.contractCode,
        customer_name: filters.customerName,
        start_date: filters.startDate,
        end_date: filters.endDate,
        status: filters.status as any,
        store_id: currentStore.id // Sử dụng currentStore.id trực tiếp thay vì || ''
      };
      
      // Check if request was cancelled
      if (controller.signal.aborted) {
        throw new Error('Request was cancelled');
      }
      
      const result = await getPawns(
        currentPage,
        itemsPerPage,
        pawnFilters,
        controller.signal
      );
      
      // Check if request was cancelled after query
      if (controller.signal.aborted) {
        throw new Error('Request was cancelled');
      }
      
      const endTimestamp = new Date().toISOString().slice(11, 23);
      console.log(`🎯 [${endTimestamp}] [${fetchId}] Loaded ${result.data.length} pawns successfully`);
      
      setPawns(result.data);
      setTotalItems(result.total);
      setLoading(false);
    } catch (err: any) {
      // Handle abort errors gracefully
      if (err instanceof Error && err.name === 'AbortError') {
        console.log(`🚫 [${timestamp}] [${fetchId}] Request cancelled:`, err.message);
        return;
      }
      
      const errorTimestamp = new Date().toISOString().slice(11, 23);
      console.log(`❌ [${errorTimestamp}] [${fetchId}] fetchPawns ERROR:`, err);
      
      setError('Không thể tải dữ liệu hợp đồng');
      setLoading(false);
      console.error('Error fetching pawns:', err);
    }
  }, [currentPage, itemsPerPage, filters, currentStore?.id]);
  
  // Initial fetch on component mount
  useEffect(() => {
    fetchPawns();
  }, [fetchPawns]);
  
  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // Handle search with filters
  const handleSearch = (searchFilters: SearchFilters) => {
    console.log('🔍 usePawns handleSearch called with searchFilters:', searchFilters);
    setFilters(searchFilters);
    setCurrentPage(DEFAULT_PAGE); // Reset to first page when searching
  };
  
  // Handle reset filters
  const handleReset = () => {
    setFilters({});
    setCurrentPage(DEFAULT_PAGE);
  };
  
  // Handle delete pawn
  const handleDelete = async (pawnId: string) => {
    try {
      // In a real implementation, this would make an API call to delete the pawn
      // For now, we'll simulate the response
      
      // Simulated delete operation
      // await fetch(`/api/pawns/${pawnId}`, { method: 'DELETE' });
      
      // Update local state after successful delete
      setPawns(prevPawns => prevPawns.filter(pawn => pawn.id !== pawnId));
      setTotalItems(prev => prev - 1);
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting pawn:', error);
      return { error: 'Có lỗi xảy ra khi xóa hợp đồng' };
    }
  };
  
  // Handle update pawn status
  const handleUpdateStatus = async (pawnId: string, newStatus: PawnStatus) => {
    try {
      // In a real implementation, this would make an API call to update the pawn status
      // For now, we'll simulate the response
      
      // Simulated update operation
      // await fetch(`/api/pawns/${pawnId}/status`, { 
      //   method: 'PATCH',
      //   body: JSON.stringify({ status: newStatus }),
      //   headers: { 'Content-Type': 'application/json' }
      // });
      
      // Update local state after successful update
      setPawns(prevPawns => prevPawns.map(pawn => 
        pawn.id === pawnId ? { ...pawn, status: newStatus } : pawn
      ));
      
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật trạng thái hợp đồng',
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error updating pawn status:', error);
      
      toast({
        title: 'Lỗi',
        description: 'Có lỗi xảy ra khi cập nhật trạng thái hợp đồng',
        variant: 'destructive',
      });
      
      return { error: 'Có lỗi xảy ra khi cập nhật trạng thái hợp đồng' };
    }
  };
  
  // Manual refetch function
  const refetch = () => {
    fetchPawns();
  };
  
  return {
    pawns,
    loading,
    error,
    totalItems,
    currentPage,
    itemsPerPage,
    handlePageChange,
    handleSearch,
    handleReset,
    handleDelete,
    handleUpdateStatus,
    refetch
  };
} 