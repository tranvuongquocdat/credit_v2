"use client";
import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { StoreForm } from '@/components/Store';
import { Modal } from '@/components/UI';
import { getStores, createStore, updateStore, deleteStore } from '@/lib/store';
import { Store, StoreFormData, StoreStatus } from '@/models/store';
import { FiPlus, FiEdit2, FiTrash2, FiEye } from 'react-icons/fi';

export default function StoresPage() {
  // Trạng thái
  const [stores, setStores] = useState<Store[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search và filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Modal
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };

  // Fetch danh sách cửa hàng
  const fetchStores = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error, totalPages: pages } = await getStores(
        currentPage,
        10,
        searchQuery,
        statusFilter
      );
      
      if (error) {
        throw new Error(error.message);
      }
      
      setStores(data);
      setTotalPages(pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch lại khi các dependency thay đổi
  useEffect(() => {
    fetchStores();
  }, [currentPage, searchQuery, statusFilter]);

  // Xử lý tìm kiếm
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // Reset về trang 1 khi tìm kiếm
  };

  // Xử lý thêm cửa hàng mới
  const handleAddStore = async (data: StoreFormData) => {
    setIsSubmitting(true);
    
    try {
      const { data: newStore, error } = await createStore(data);
      
      if (error) {
        throw new Error(error.message);
      }
      
      setIsFormModalOpen(false);
      fetchStores(); // Refresh danh sách
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo cửa hàng mới');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý cập nhật cửa hàng
  const handleUpdateStore = async (data: StoreFormData) => {
    if (!selectedStore) return;
    
    setIsSubmitting(true);
    
    try {
      const { error } = await updateStore(selectedStore.id, data);
      
      if (error) {
        throw new Error(error.message);
      }
      
      setIsFormModalOpen(false);
      setSelectedStore(null);
      fetchStores(); // Refresh danh sách
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật cửa hàng');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý xóa cửa hàng
  const handleDeleteStore = async () => {
    if (!selectedStore) return;
    
    setIsSubmitting(true);
    
    try {
      const { error } = await deleteStore(selectedStore.id);
      
      if (error) {
        throw new Error(error.message);
      }
      
      setIsDeleteModalOpen(false);
      setSelectedStore(null);
      fetchStores(); // Refresh danh sách
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa cửa hàng');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mở modal chỉnh sửa
  const openEditModal = (store: Store) => {
    setSelectedStore(store);
    setIsFormModalOpen(true);
  };

  // Mở modal xóa
  const openDeleteModal = (store: Store) => {
    setSelectedStore(store);
    setIsDeleteModalOpen(true);
  };

  // Render phân trang
  const renderPagination = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => setCurrentPage(i)}
          className={`px-3 py-1 rounded ${
            currentPage === i
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          {i}
        </button>
      );
    }
    
    return (
      <div className="flex justify-center mt-6 space-x-2">
        <button
          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          className="px-3 py-1 rounded bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          Trước
        </button>
        {pages}
        <button
          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-3 py-1 rounded bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          Sau
        </button>
      </div>
    );
  };

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Quản lý cửa hàng</h1>
          <button
            onClick={() => {
              setSelectedStore(null);
              setIsFormModalOpen(true);
            }}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <FiPlus className="mr-2" /> Thêm cửa hàng
          </button>
        </div>

        {/* Search và filter */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                Tìm kiếm theo tên
              </label>
              <input
                type="text"
                id="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nhập tên cửa hàng..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                Lọc theo trạng thái
              </label>
              <select
                id="status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Tất cả trạng thái</option>
                <option value={StoreStatus.ACTIVE}>Hoạt động</option>
                <option value={StoreStatus.SUSPENDED}>Tạm ngưng</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Tìm kiếm
              </button>
            </div>
          </form>
        </div>

        {/* Hiển thị lỗi nếu có */}
        {error && (
          <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Danh sách cửa hàng */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-6 text-center">Đang tải...</div>
          ) : stores.length === 0 ? (
            <div className="p-6 text-center">
              Không tìm thấy cửa hàng nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tên cửa hàng
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Địa chỉ
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vốn đầu tư
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quỹ tiền mặt
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trạng thái
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stores.map((store) => (
                    <tr key={store.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900 cursor-pointer hover:text-blue-600" 
                          onClick={() => openEditModal(store)}>
                          {store.name}
                        </div>
                        <div className="text-sm text-gray-500">{store.phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{store.address}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatCurrency(store.investment)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatCurrency(store.cash_fund)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          store.status === StoreStatus.ACTIVE
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {store.status === StoreStatus.ACTIVE ? 'Hoạt động' : 'Tạm ngưng'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => openEditModal(store)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <FiEdit2 size={18} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(store)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <FiTrash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Phân trang */}
          {!isLoading && stores.length > 0 && renderPagination()}
        </div>
      </div>

      {/* Modal thêm/sửa cửa hàng */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setSelectedStore(null);
        }}
        title={selectedStore ? 'Chỉnh sửa cửa hàng' : 'Thêm cửa hàng mới'}
        size="lg"
      >
        <StoreForm
          store={selectedStore || undefined}
          onSubmit={selectedStore ? handleUpdateStore : handleAddStore}
          isSubmitting={isSubmitting}
        />
      </Modal>

      {/* Modal xác nhận xóa */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedStore(null);
        }}
        title="Xác nhận xóa"
        size="sm"
      >
        <div className="py-4">
          <p className="text-gray-700">
            Bạn có chắc chắn muốn xóa cửa hàng "{selectedStore?.name}"?
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Hành động này không thể hoàn tác.
          </p>
          <div className="flex justify-end mt-6 space-x-3">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Hủy bỏ
            </button>
            <button
              onClick={handleDeleteStore}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Đang xử lý...' : 'Xóa'}
            </button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
