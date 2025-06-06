'use client';

import { useState, useEffect, useCallback } from 'react';
import { PawnStatus, PawnWithCustomer } from '@/models/pawn';
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
  // Fetch pawns data from the API
  const fetchPawns = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      let searchQuery = '';
      if (filters.contractCode) searchQuery = filters.contractCode;
      if (filters.customerName) searchQuery = filters.customerName;
      
      const result = await getPawns(
        currentPage,
        itemsPerPage,
        searchQuery,
        currentStore?.id || '',
        filters.status
      );
      setPawns(result.data);
      setTotalItems(result.total);
      setLoading(false);
    } catch (err) {
      setError('Không thể tải dữ liệu hợp đồng');
      setLoading(false);
      console.error('Error fetching pawns:', err);
    }
  }, [currentPage, itemsPerPage, filters]);
  
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