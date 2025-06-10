'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';

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
import { getCustomers, getCustomersByStore } from '@/lib/customer';
import { getAllActiveStores } from '@/lib/store';
import { Customer, CustomerStatus } from '@/models/customer';
import { Store } from '@/models/store';

// Define customer status badges
const customerStatusMap: Record<string, { label: string, color: string }> = {
  [CustomerStatus.ACTIVE]: { label: 'Hoạt động', color: 'bg-green-100 text-green-800 border-green-200' },
  [CustomerStatus.INACTIVE]: { label: 'Không hoạt động', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  blacklisted: { label: 'Đen', color: 'bg-red-50 text-red-700 border-red-200' }
};

// Debug helper
const debugLog = (message: string, data?: any) => {
  console.log(`[CustomersPage] ${message}`, data ? data : '');
};

export default function CustomersPage() {
  const router = useRouter();
  const { currentStore, loading: storeLoading } = useStore();
  
  debugLog('Rendering with currentStore:', currentStore?.name);
  debugLog('Store loading state:', storeLoading);
  
  // Basic state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [searchFilters, setSearchFilters] = useState({
    query: '',
    store: 'all',
    status: 'all'
  });
  
  // Data state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // Store list
  const [stores, setStores] = useState<Store[]>([]);
  
  // Pagination
  const totalPages = Math.ceil(totalCustomers / pageSize);
  
  // Effect to update filters when store changes
  useEffect(() => {
    if (currentStore) {
      debugLog(`Store changed: ${currentStore.name} (${currentStore.id})`);
      
      // Update filters with current store
      setSearchFilters(prev => {
        const newFilters = {
          ...prev,
          store: currentStore.id
        };
        debugLog('Updated filters with new store:', newFilters);
        return newFilters;
      });
      
      // Test direct store filtering
      const testDirectStoreFilter = async () => {
        debugLog(`Testing direct store filter for ${currentStore.name} (${currentStore.id})`);
        const result = await getCustomersByStore(currentStore.id);
        debugLog(`Direct filter test results: ${result.count} customers found`);
      };
      
      testDirectStoreFilter();
    } else {
      debugLog('No current store available');
    }
  }, [currentStore]);
  
  // Memoized loadCustomers function to prevent recreating on every render
  const loadCustomers = useCallback(async () => {
    // Không tải dữ liệu nếu store context đang tải
    if (storeLoading) {
      debugLog('Skipping customer loading because store context is still initializing');
      return;
    }
    
    debugLog('Loading customers with filters:', searchFilters);
    debugLog('Current store when loading:', currentStore?.name);
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Always use current store if available
      const storeId = currentStore ? currentStore.id : 
                     (searchFilters.store !== 'all' ? searchFilters.store : undefined);
      
      debugLog(`Using store ID for filtering: ${storeId}`);
      
      const status = searchFilters.status !== 'all' ? searchFilters.status : undefined;
      
      // Call API
      const { data, total, error } = await getCustomers(
        currentPage,
        pageSize,
        searchFilters.query,
        storeId,
        status
      );
      
      if (error) throw error;
      
      debugLog(`Loaded ${data.length} customers out of ${total}`);
      if (data.length > 0) {
        debugLog('First customer sample:', {
          id: data[0].id,
          name: data[0].name,
          store_id: data[0].store_id
        });
      }
      
      setCustomers(data);
      setTotalCustomers(total);
    } catch (err: any) {
      const errorMsg = err.message || 'Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.';
      debugLog(`Error loading customers: ${errorMsg}`);
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchFilters, currentStore, storeLoading]);
  
  // Effect to load customers when filters change
  useEffect(() => {
    debugLog('Load customers effect triggered');
    loadCustomers();
  }, [loadCustomers]);
  
  // Load store data
  useEffect(() => {
    async function fetchStores() {
      try {
        const { data, error } = await getAllActiveStores();
        if (error) throw error;
        debugLog(`Fetched ${data.length} stores`);
        setStores(data || []);
      } catch (err) {
        debugLog('Error fetching stores:', err);
      }
    }
    
    fetchStores();
  }, []);
  
  // Event handlers for search and filtering
  const handleSearchFilters = (filters: any) => {
    debugLog('Search filters changed:', filters);
    setSearchFilters(filters);
    setCurrentPage(1);
  };
  
  const handleResetFilters = () => {
    const newFilters = {
      query: '',
      store: currentStore ? currentStore.id : 'all',
      status: 'all'
    };
    debugLog('Resetting filters to:', newFilters);
    setSearchFilters(newFilters);
    setCurrentPage(1);
  };
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // CRUD operations
  const handleCreateCustomer = () => {
    setIsCreateModalOpen(true);
  };
  
  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    loadCustomers();
  };
  
  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsEditModalOpen(true);
  };
  
  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    loadCustomers();
  };
  
  const handleDeleteCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDeleteDialogOpen(true);
  };
  
  const handleDeleteSuccess = () => {
    setIsDeleteDialogOpen(false);
    loadCustomers();
  };
  
  const handleViewCredits = (customerId: string) => {
    router.push(`/credits?customer_id=${customerId}`);
  };
  
  // Hiển thị trạng thái loading khi store chưa khởi tạo xong
  if (storeLoading) {
    return (
      <Layout>
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quản lý khách hàng</h1>
            </div>
          </div>
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Đang tải dữ liệu cửa hàng...</div>
          </div>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="max-w-full">
        {/* Title và nút trở về */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý khách hàng</h1>
            {currentStore && (
              <div className="text-sm text-gray-500">
                Cửa hàng: {currentStore.name}
              </div>
            )}
          </div>
        </div>
        
        {/* Search and filters */}
        <SearchFilters
          statusMap={customerStatusMap}
          stores={stores}
          initialFilters={searchFilters}
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
        {selectedCustomer && (
          <CustomerEditModal
            isOpen={isEditModalOpen}
            customer={selectedCustomer}
            onClose={() => setIsEditModalOpen(false)}
            onSuccess={handleEditSuccess}
            stores={stores}
          />
        )}
        
        {/* Delete Customer Dialog */}
        {selectedCustomer && (
          <CustomerDeleteDialog
            isOpen={isDeleteDialogOpen}
            customer={selectedCustomer}
            onClose={() => setIsDeleteDialogOpen(false)}
            onSuccess={handleDeleteSuccess}
          />
        )}
      </div>
    </Layout>
  );
}
