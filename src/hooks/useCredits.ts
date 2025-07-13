import { useState, useEffect, useCallback, useRef } from 'react';
import { CreditWithCustomer, CreditStatus } from '@/models/credit';
import { getCredits, deleteCredit, updateCredit, CreditFilters } from '@/lib/credit';
import { SearchFilters } from '@/components/Credits/SearchFilters';
import { useStore } from '@/contexts/StoreContext';

export function useCredits(initialFilters?: Partial<SearchFilters>) {
  const [credits, setCredits] = useState<CreditWithCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(30);
  const [filters, setFilters] = useState<SearchFilters>({
    contract_code: initialFilters?.contract_code || '',
    customer_name: initialFilters?.customer_name || '',
    start_date: initialFilters?.start_date || '',
    end_date: initialFilters?.end_date || '',
    duration: initialFilters?.duration || undefined,
    status: initialFilters?.status || 'on_time'
  });
  
  // Get current store from store context
  const { currentStore } = useStore();
  
  // AbortController ref to cancel previous requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Convert SearchFilters to CreditFilters
  const convertToApiFilters = useCallback((searchFilters: SearchFilters): CreditFilters => {
    return {
      contract_code: searchFilters.contract_code || undefined,
      customer_name: searchFilters.customer_name || undefined,
      start_date: searchFilters.start_date || undefined,
      end_date: searchFilters.end_date || undefined,
      // Send all status values to server for filtering via enhanced credits_by_store view
      // All status filtering including due_tomorrow is now handled server-side
      status: searchFilters.status || undefined,
      duration: searchFilters.duration || undefined,
      store_id: currentStore?.id // Sử dụng currentStore?.id để tránh lỗi null
    };
  }, [currentStore]);

  // Fetch credits with filters
  const fetchCredits = useCallback(async () => {
    // Kiểm tra currentStore - nếu không có store thì trả về dữ liệu rỗng
    if (!currentStore) {
      setCredits([]);
      setTotalItems(0);
      setLoading(false);
      setError(null);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setLoading(true);
    setError(null);
    
    try {
      const apiFilters = convertToApiFilters(filters);
      
      const result = await getCredits(
        currentPage,
        itemsPerPage,
        apiFilters,
        controller.signal
      );
      
      // Check if request was cancelled
      if (controller.signal.aborted) {
        return;
      }
      
      if (result.error) {
        throw result.error;
      }
      
      setCredits(result.data);
      setTotalItems(result.total);
    } catch (err) {
      // Don't set error for cancelled requests
      if (controller.signal.aborted) {
        return;
      }
      
      console.error('Error fetching credits:', err);
      setError(err);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [currentPage, itemsPerPage, filters, convertToApiFilters]);

  // Initial load
  useEffect(() => {
    fetchCredits();
    
    // Cleanup function to cancel request
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchCredits]);

  // Handle search
  const handleSearch = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when searching
  };

  // Handle reset
  const handleReset = () => {
    const resetFilters = {
      contract_code: '',
      customer_name: '',
      start_date: '',
      end_date: '',
      status: 'on_time'
    };
    setFilters(resetFilters);
    setCurrentPage(1);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    setLoading(true);
    
    try {
      const result = await deleteCredit(id);
      
      if (result.error) {
        setLoading(false);
        return result;
      }
      
      // Remove from local state
      setCredits(prev => prev.filter(credit => credit.id !== id));
      
      // Refetch if we might have deleted the last item on a page
      if (credits.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1);
      } else {
        fetchCredits();
      }
      
      return result;
    } catch (err) {
      console.error('Error deleting credit:', err);
      setError(err);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  // Handle status update
  const handleUpdateStatus = async (id: string, status: CreditStatus) => {
    setLoading(true);
    
    try {
      const result = await updateCredit(id, { status });
      
      if (result.error) {
        throw result.error;
      }
      
      // Update in local state
      setCredits(prev => 
        prev.map(credit => 
          credit.id === id ? { ...credit, status } : credit
        )
      );
    } catch (err) {
      console.error('Error updating credit status:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return {
    credits,
    loading,
    error,
    totalItems,
    currentPage,
    itemsPerPage,
    filters,
    handleSearch,
    handleReset,
    handlePageChange,
    handleDelete,
    handleUpdateStatus,
    refetch: fetchCredits
  };
}
