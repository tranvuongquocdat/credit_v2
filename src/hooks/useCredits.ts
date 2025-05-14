import { useState, useEffect, useCallback } from 'react';
import { CreditWithCustomer, CreditStatus } from '@/models/credit';
import { getCredits, deleteCredit, updateCredit } from '@/lib/credit';
import { SearchFilters } from '@/components/credits/SearchFilters';

export function useCredits() {
  const [credits, setCredits] = useState<CreditWithCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [filters, setFilters] = useState<SearchFilters>({
    contractCode: '',
    customerName: '',
    startDate: '',
    endDate: '',
    status: ''
  });

  // Fetch credits with filters
  const fetchCredits = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Combine filters into a search query
      let searchQuery = '';
      if (filters.contractCode) searchQuery = filters.contractCode;
      if (filters.customerName) searchQuery = filters.customerName;
      
      const result = await getCredits(
        currentPage,
        itemsPerPage,
        searchQuery,
        '', // storeId (not used in this UI)
        filters.status
      );
      
      if (result.error) {
        throw result.error;
      }
      
      setCredits(result.data);
      setTotalItems(result.total);
    } catch (err) {
      console.error('Error fetching credits:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, filters]);

  // Initial load
  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  // Handle search
  const handleSearch = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when searching
  };

  // Handle reset
  const handleReset = () => {
    setFilters({
      contractCode: '',
      customerName: '',
      startDate: '',
      endDate: '',
      status: ''
    });
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
        throw result.error;
      }
      
      // Remove from local state
      setCredits(prev => prev.filter(credit => credit.id !== id));
      
      // Refetch if we might have deleted the last item on a page
      if (credits.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1);
      } else {
        fetchCredits();
      }
    } catch (err) {
      console.error('Error deleting credit:', err);
      setError(err);
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
