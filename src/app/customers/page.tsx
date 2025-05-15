'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

// Import custom components
import {
  CustomersTable,
  CustomersPagination,
  SearchFilters,
  CustomerCreateModal,
  CustomerEditModal,
  CustomerDeleteDialog
} from '@/components/Customers';

// Import functions and types
import { getCustomers } from '@/lib/customer';
import { getAllActiveStores } from '@/lib/store';
import { Customer } from '@/models/customer';
import { Store } from '@/models/store';

// Define customer status badges
const customerStatusMap: Record<string, { label: string, color: string }> = {
  active: { label: 'Hoạt động', color: 'bg-green-100 text-green-800 border-green-200' },
  inactive: { label: 'Không hoạt động', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  blacklisted: { label: 'Đen', color: 'bg-red-50 text-red-700 border-red-200' }
};

export default function CustomersPage() {
  const router = useRouter();
  
  // State cho phân trang và tìm kiếm
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [searchFilters, setSearchFilters] = useState({
    query: '',
    store: 'all',
    status: 'all'
  });
  
  // State cho dữ liệu và loading
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State cho dialog
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // State cho danh sách cửa hàng
  const [stores, setStores] = useState<Store[]>([]);
  
  // Tính toán tổng số trang
  const totalPages = Math.ceil(totalCustomers / pageSize);
  
  // Load customers data
  const loadCustomers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, total, error } = await getCustomers(
        currentPage,
        pageSize,
        searchFilters.query,
        searchFilters.store !== 'all' ? searchFilters.store : undefined
      );
      
      if (error) throw error;
      
      setCustomers(data);
      setTotalCustomers(total);
    } catch (err: any) {
      console.error('Error loading customers:', err);
      setError(err.message || 'Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  }

  // Effect to load customers on mount and when filters change
  useEffect(() => {
    loadCustomers();
  }, [currentPage, pageSize, searchFilters]);

  // Load store data
  useEffect(() => {
    async function fetchStores() {
      try {
        const { data, error } = await getAllActiveStores();
        if (error) throw error;
        setStores(data || []);
      } catch (err) {
        console.error('Error fetching stores:', err);
      }
    }
    
    fetchStores();
  }, []);

  // Handle search filters
  const handleSearchFilters = (filters: any) => {
    setSearchFilters(filters);
    setCurrentPage(1);
  };

  // Handle reset filters
  const handleResetFilters = () => {
    setSearchFilters({
      query: '',
      store: 'all',
      status: 'all'
    });
    setCurrentPage(1);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handle create new customer
  const handleCreateCustomer = () => {
    setIsCreateModalOpen(true);
  };

  // Handle create success
  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    loadCustomers();
  };

  // Handle edit customer
  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsEditModalOpen(true);
  };

  // Handle edit success
  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    loadCustomers();
  };

  // Handle delete customer
  const handleDeleteCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDeleteDialogOpen(true);
  };

  // Handle delete success
  const handleDeleteSuccess = () => {
    setIsDeleteDialogOpen(false);
    loadCustomers();
  };

  // View customer credits
  const handleViewCredits = (customerId: string) => {
    router.push(`/credits?customer_id=${customerId}`);
  };

  return (
    <Layout>
      <div className="max-w-full">
        {/* Title và nút trở về */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý khách hàng</h1>
          </div>
        </div>
        
        {/* Search and filters */}
        <SearchFilters
          statusMap={customerStatusMap}
          stores={stores}
          onSearch={handleSearchFilters}
          onReset={handleResetFilters}
          onCreateNew={handleCreateCustomer}
        />
        
        {/* Error message */}
        {error && (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        )}
        
        <div className="rounded-md border mt-4 mb-1">
          {/* Customers table */}
          <CustomersTable
            customers={customers}
            stores={stores}
            statusMap={customerStatusMap}
            currentPage={currentPage}
            pageSize={pageSize}
            isLoading={isLoading}
            onEdit={handleEditCustomer}
            onDelete={handleDeleteCustomer}
            onViewCredits={handleViewCredits}
          />
        </div>
        
        {/* Pagination */}
        <CustomersPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalCustomers}
          itemsPerPage={pageSize}
          onPageChange={handlePageChange}
        />
        
        {/* Create Customer Modal */}
        <CustomerCreateModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={handleCreateSuccess}
          stores={stores}
        />
        
        {/* Edit Customer Modal */}
        <CustomerEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={handleEditSuccess}
          customer={selectedCustomer}
          stores={stores}
        />
        
        {/* Delete Confirmation Dialog */}
        <CustomerDeleteDialog
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onSuccess={handleDeleteSuccess}
          customer={selectedCustomer}
        />
      </div>
    </Layout>
  );
}
