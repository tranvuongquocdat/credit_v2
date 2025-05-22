import { useState, useEffect } from 'react';
import { 
  getInstallments, 
  updateInstallmentStatus, 
  deleteInstallment 
} from '@/lib/installment';
import { InstallmentFilters, InstallmentStatus, InstallmentWithCustomer } from '@/models/installment';
import { useToast } from '@/components/ui/use-toast';
import { useStore } from '@/contexts/StoreContext';

export function useInstallments() {
  const [installments, setInstallments] = useState<InstallmentWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  // Get current store from context
  const { currentStore } = useStore();
  
  const [filters, setFilters] = useState<InstallmentFilters>({
    status: InstallmentStatus.ON_TIME, // Mặc định hiển thị các hợp đồng đang vay
    store_id: currentStore?.id // Set default store_id from context
  });
  
  const { toast } = useToast();

  // Update filters when store changes
  useEffect(() => {
    if (currentStore?.id) {
      setFilters(prevFilters => ({
        ...prevFilters,
        store_id: currentStore.id
      }));
    }
  }, [currentStore]);

  const fetchInstallments = async () => {
    setLoading(true);
    setError(null);
    
    // Always ensure store_id is set from context if available
    const currentFilters = {
      ...filters,
      store_id: currentStore?.id || filters.store_id
    };
    
    try {
      const { data, error, count } = await getInstallments(currentPage, itemsPerPage, currentFilters);
      
      if (error) throw new Error(error.message);
      
      setInstallments(data);
      setTotalItems(count || 0);
    } catch (err: any) {
      console.error('Error loading installments:', err);
      setError(err.message || 'Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.');
      toast({
        title: "Lỗi",
        description: err.message || "Không thể tải dữ liệu hợp đồng trả góp",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when filters, pagination, or store changes
  useEffect(() => {
    fetchInstallments();
  }, [currentPage, itemsPerPage, filters, currentStore?.id]);

  // Handle search filters
  const handleSearch = (newFilters: InstallmentFilters) => {
    // Preserve the store_id from context
    setFilters({
      ...newFilters,
      store_id: currentStore?.id || newFilters.store_id
    });
    setCurrentPage(1);
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

  // Handle updating status
  const handleUpdateStatus = async (installmentId: string, status: InstallmentStatus) => {
    try {
      const { data, error } = await updateInstallmentStatus(installmentId, status);
      
      if (error) throw new Error(error.message);
      
      // Update the local state with the updated installment
      setInstallments(prevInstallments =>
        prevInstallments.map(item =>
          item.id === installmentId ? { ...item, status } : item
        )
      );
      
      toast({
        title: "Thành công",
        description: "Đã cập nhật trạng thái hợp đồng"
      });
      
      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error updating installment status:', err);
      
      toast({
        title: "Lỗi",
        description: err.message || "Không thể cập nhật trạng thái hợp đồng",
        variant: "destructive"
      });
      
      return { success: false, error: err.message || 'Không thể cập nhật trạng thái.' };
    }
  };

  // Handle delete
  const handleDelete = async (installment: InstallmentWithCustomer) => {
    try {
      const { success, error } = await deleteInstallment(installment.id);
      
      if (error) throw new Error(error.message);
      
      if (success) {
        // Remove from local state
        setInstallments(prevInstallments =>
          prevInstallments.filter(item => item.id !== installment.id)
        );
        
        toast({
          title: "Thành công",
          description: "Đã xóa hợp đồng"
        });
      }
      
      return { success, error: null };
    } catch (err: any) {
      console.error('Error deleting installment:', err);
      
      toast({
        title: "Lỗi",
        description: err.message || "Không thể xóa hợp đồng",
        variant: "destructive"
      });
      
      return { success: false, error: err.message || 'Không thể xóa hợp đồng.' };
    }
  };

  // Refetch data
  const refetch = () => {
    fetchInstallments();
  };

  return {
    installments,
    loading,
    error,
    totalItems,
    currentPage,
    itemsPerPage,
    handleSearch,
    handleReset,
    handlePageChange,
    handleUpdateStatus,
    handleDelete,
    refetch
  };
}
