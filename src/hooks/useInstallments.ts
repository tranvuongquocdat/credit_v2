import { useState, useEffect } from 'react';
import { 
  getInstallments, 
  updateInstallmentStatus, 
  deleteInstallment 
} from '@/lib/installment';
import { InstallmentFilters, InstallmentStatus, InstallmentWithCustomer } from '@/models/installment';

// Mock data
const MOCK_INSTALLMENTS: InstallmentWithCustomer[] = [
  {
    id: '1',
    contract_code: 'HD001',
    customer_id: '1',
    amount_given: 5000000,
    interest_rate: 10,
    duration: 30,
    amount_paid: 1500000,
    old_debt: 0,
    daily_amount: 16667,
    remaining_amount: 3500000,
    status: InstallmentStatus.ON_TIME,
    due_date: '2025-06-15',
    start_date: '2025-05-15',
    created_at: '2025-05-15',
    updated_at: '2025-05-15',
    customer: {
      id: '1',
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      address: 'Hà Nội',
      email: 'a@example.com',
      store_id: null
    }
  },
  {
    id: '2',
    contract_code: 'HD002',
    customer_id: '2',
    amount_given: 10000000,
    interest_rate: 8,
    duration: 60,
    amount_paid: 2000000,
    old_debt: 500000,
    daily_amount: 13333,
    remaining_amount: 8000000,
    status: InstallmentStatus.OVERDUE,
    due_date: '2025-06-01',
    start_date: '2025-04-01',
    created_at: '2025-04-01',
    updated_at: '2025-05-10',
    customer: {
      id: '2',
      name: 'Trần Thị B',
      phone: '0907654321',
      address: 'Hồ Chí Minh',
      email: 'b@example.com',
      store_id: null
    }
  },
  {
    id: '3',
    contract_code: 'HD003',
    customer_id: '3',
    amount_given: 15000000,
    interest_rate: 12,
    duration: 90,
    amount_paid: 5000000,
    old_debt: 0,
    daily_amount: 20000,
    remaining_amount: 10000000,
    status: InstallmentStatus.LATE_INTEREST,
    due_date: '2025-07-15',
    start_date: '2025-04-15',
    created_at: '2025-04-15',
    updated_at: '2025-05-12',
    customer: {
      id: '3',
      name: 'Lê Văn C',
      phone: '0909876543',
      address: 'Đà Nẵng',
      email: 'c@example.com',
      store_id: null
    }
  },
];

export function useInstallments() {
  const [installments, setInstallments] = useState<InstallmentWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [filters, setFilters] = useState<InstallmentFilters>({});

  // Giữ lại hàm API thực (không được gọi) để dễ dàng chuyển đổi sau này
  const fetchInstallmentsFromAPI = async () => {
    try {
      const { data, error, count } = await getInstallments(currentPage, itemsPerPage, filters);
      
      if (error) throw new Error(error.message);
      
      return { data, count };
    } catch (err: any) {
      console.error('Error loading installments:', err);
      throw new Error(err.message || 'Có lỗi xảy ra khi tải dữ liệu.');
    }
  };
  
  // Mock function thay thế để lấy dữ liệu
  const fetchInstallments = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Mô phỏng độ trễ mạng
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Lọc dữ liệu theo các bộ lọc
      let filteredData = [...MOCK_INSTALLMENTS];
      
      if (filters.contract_code) {
        filteredData = filteredData.filter(item => 
          item.contract_code.toLowerCase().includes(filters.contract_code!.toLowerCase())
        );
      }
      
      if (filters.customer_name) {
        filteredData = filteredData.filter(item => 
          item.customer?.name.toLowerCase().includes(filters.customer_name!.toLowerCase())
        );
      }
      
      if (filters.start_date) {
        filteredData = filteredData.filter(item => 
          new Date(item.start_date) >= new Date(filters.start_date!)
        );
      }
      
      if (filters.end_date) {
        filteredData = filteredData.filter(item => 
          new Date(item.start_date) <= new Date(filters.end_date!)
        );
      }
      
      if (filters.duration) {
        filteredData = filteredData.filter(item => item.duration === filters.duration);
      }
      
      if (filters.status && filters.status !== 'all') {
        filteredData = filteredData.filter(item => item.status === filters.status);
      }
      
      // Phân trang
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedData = filteredData.slice(startIndex, endIndex);
      
      setInstallments(paginatedData);
      setTotalItems(filteredData.length);
    } catch (err: any) {
      console.error('Error loading mock installments:', err);
      setError(err.message || 'Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when filters or pagination changes
  useEffect(() => {
    fetchInstallments();
  }, [currentPage, itemsPerPage, filters]);

  // Handle search filters
  const handleSearch = (newFilters: InstallmentFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  // Handle reset filters
  const handleReset = () => {
    setFilters({});
    setCurrentPage(1);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handle updating status - mock version
  const handleUpdateStatus = async (installmentId: string, status: InstallmentStatus) => {
    try {
      // Mô phỏng trễ mạng
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Kiểm tra ID có tồn tại trong mock data không
      const installmentExists = MOCK_INSTALLMENTS.some(item => item.id === installmentId);
      if (!installmentExists) {
        throw new Error('Không tìm thấy hợp đồng');
      }
      
      // Cập nhật trạng thái trong state
      setInstallments(prevInstallments =>
        prevInstallments.map(item =>
          item.id === installmentId ? { ...item, status } : item
        )
      );
      
      // Keep the real API call for reference
      // const { data, error } = await updateInstallmentStatus(installmentId, status);
      // if (error) throw new Error(error.message);
      
      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error updating installment status:', err);
      return { success: false, error: err.message || 'Không thể cập nhật trạng thái.' };
    }
  };

  // Handle delete - mock version
  const handleDelete = async (installment: InstallmentWithCustomer) => {
    try {
      // Mô phỏng trễ mạng
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Kiểm tra ID có tồn tại trong mock data không
      const installmentExists = MOCK_INSTALLMENTS.some(item => item.id === installment.id);
      if (!installmentExists) {
        throw new Error('Không tìm thấy hợp đồng');
      }
      
      // Xóa khỏi state
      setInstallments(prevInstallments =>
        prevInstallments.filter(item => item.id !== installment.id)
      );
      
      // Keep the real API call for reference
      // const { error } = await deleteInstallment(installment.id);
      // if (error) throw new Error(error.message);
      
      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error deleting installment:', err);
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
