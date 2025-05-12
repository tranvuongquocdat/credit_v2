"use client";
import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { EmployeeForm } from '@/components/Employee';
import { Modal } from '@/components/UI';
import { getEmployees, createEmployee, updateEmployee, deactivateEmployee, activateEmployee } from '@/lib/employee';
import { getStores } from '@/lib/store';
import { Employee, EmployeeFormData, EmployeeStatus, EmployeeWithAuth } from '@/models/employee';
import { Store } from '@/models/store';
import { FiPlus, FiEdit2, FiUserX, FiUserCheck } from 'react-icons/fi';

export default function EmployeesPage() {
  // Trạng thái
  const [employees, setEmployees] = useState<EmployeeWithAuth[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search và filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  
  // Modal
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithAuth | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch danh sách nhân viên
  const fetchEmployees = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error, totalPages: pages } = await getEmployees(
        currentPage,
        10,
        searchQuery,
        storeFilter,
        statusFilter
      );
      
      if (error) {
        const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
    ? String(error.message) 
    : 'Lỗi không xác định';
  throw new Error(errorMessage);
      }
      
      setEmployees(data);
      setTotalPages(pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch danh sách cửa hàng cho filter
  const fetchStores = async () => {
    try {
      const { data, error } = await getStores(1, 100); // Lấy tối đa 100 cửa hàng
      
      if (error) {
        throw new Error(error.message);
      }
      
      setStores(data);
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  // Fetch lại khi các dependency thay đổi
  useEffect(() => {
    fetchEmployees();
  }, [currentPage, searchQuery, statusFilter, storeFilter]);

  // Fetch danh sách cửa hàng khi component mount
  useEffect(() => {
    fetchStores();
  }, []);
  
  // Xử lý tìm kiếm
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // Reset về trang 1 khi tìm kiếm
  };

  // Xử lý thêm nhân viên mới
  const handleAddEmployee = async (data: EmployeeFormData) => {
    setIsSubmitting(true);
    
    try {
      const { data: newEmployee, error } = await createEmployee(data);
      
      if (error) {
        const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
    ? String(error.message) 
    : 'Lỗi không xác định';
  throw new Error(errorMessage);
      }
      
      setIsFormModalOpen(false);
      fetchEmployees(); // Refresh danh sách
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo nhân viên mới');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý cập nhật nhân viên
  const handleUpdateEmployee = async (data: EmployeeFormData) => {
    if (!selectedEmployee) return;
    
    setIsSubmitting(true);
    
    try {
      const { error } = await updateEmployee(selectedEmployee.id, data);
      
      if (error) {
        const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
    ? String(error.message) 
    : 'Lỗi không xác định';
  throw new Error(errorMessage);
      }
      
      setIsFormModalOpen(false);
      setSelectedEmployee(null);
      fetchEmployees(); // Refresh danh sách
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật nhân viên');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý thay đổi trạng thái nhân viên
  const handleChangeEmployeeStatus = async () => {
    if (!selectedEmployee) return;
    
    setIsSubmitting(true);
    
    try {
      const isActivating = selectedEmployee.status === EmployeeStatus.INACTIVE;
      const { error } = isActivating 
        ? await activateEmployee(selectedEmployee.id)
        : await deactivateEmployee(selectedEmployee.id);
      
      if (error) {
        const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
    ? String(error.message) 
    : 'Lỗi không xác định';
  throw new Error(errorMessage);
      }
      
      setIsStatusModalOpen(false);
      setSelectedEmployee(null);
      fetchEmployees(); // Refresh danh sách
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể thay đổi trạng thái nhân viên');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mở modal chỉnh sửa
  const openEditModal = (employee: EmployeeWithAuth) => {
    setSelectedEmployee(employee);
    setIsFormModalOpen(true);
  };

  // Mở modal thay đổi trạng thái
  const openStatusModal = (employee: EmployeeWithAuth) => {
    setSelectedEmployee(employee);
    setIsStatusModalOpen(true);
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
          <h1 className="text-2xl font-bold">Quản lý nhân viên</h1>
          <button
            onClick={() => {
              setSelectedEmployee(null);
              setIsFormModalOpen(true);
            }}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <FiPlus className="mr-2" /> Thêm nhân viên
          </button>
        </div>

        {/* Search và filter */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                Tìm kiếm theo tên
              </label>
              <input
                type="text"
                id="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nhập tên nhân viên..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label htmlFor="store" className="block text-sm font-medium text-gray-700 mb-1">
                Lọc theo cửa hàng
              </label>
              <select
                id="store"
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Tất cả cửa hàng</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
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
                <option value={EmployeeStatus.WORKING}>Đang làm việc</option>
                <option value={EmployeeStatus.INACTIVE}>Đã nghỉ việc</option>
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

        {/* Danh sách nhân viên */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-6 text-center">Đang tải...</div>
          ) : employees.length === 0 ? (
            <div className="p-6 text-center">
              Không tìm thấy nhân viên nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Họ tên
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tên đăng nhập
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cửa hàng
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Liên hệ
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
                  {employees.map((employee) => (
                    <tr key={employee.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900 cursor-pointer hover:text-blue-600" 
                          onClick={() => openEditModal(employee)}>
                          {employee.full_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{employee.username}</div>
                        <div className="text-sm text-gray-500">{employee.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{employee.store?.name || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{employee.phone || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          employee.status === EmployeeStatus.WORKING
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {employee.status === EmployeeStatus.WORKING ? 'Đang làm việc' : 'Đã nghỉ việc'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => openEditModal(employee)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Chỉnh sửa"
                          >
                            <FiEdit2 size={18} />
                          </button>
                          <button
                            onClick={() => openStatusModal(employee)}
                            className={employee.status === EmployeeStatus.WORKING ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}
                            title={employee.status === EmployeeStatus.WORKING ? 'Vô hiệu hóa' : 'Kích hoạt'}
                          >
                            {employee.status === EmployeeStatus.WORKING ? <FiUserX size={18} /> : <FiUserCheck size={18} />}
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
          {!isLoading && employees.length > 0 && renderPagination()}
        </div>
      </div>

      {/* Modal thêm/sửa nhân viên */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setSelectedEmployee(null);
        }}
        title={selectedEmployee ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'}
        size="lg"
      >
        <EmployeeForm
          employee={selectedEmployee || undefined}
          onSubmit={selectedEmployee ? handleUpdateEmployee : handleAddEmployee}
          isSubmitting={isSubmitting}
          isEditing={!!selectedEmployee}
        />
      </Modal>

      {/* Modal xác nhận thay đổi trạng thái */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => {
          setIsStatusModalOpen(false);
          setSelectedEmployee(null);
        }}
        title={selectedEmployee?.status === EmployeeStatus.WORKING ? 'Vô hiệu hóa nhân viên' : 'Kích hoạt nhân viên'}
        size="sm"
      >
        <div className="py-4">
          <p className="text-gray-700">
            {selectedEmployee?.status === EmployeeStatus.WORKING 
              ? `Bạn có chắc chắn muốn vô hiệu hóa tài khoản của nhân viên "${selectedEmployee?.full_name}"?`
              : `Bạn có chắc chắn muốn kích hoạt lại tài khoản của nhân viên "${selectedEmployee?.full_name}"?`
            }
          </p>
          <p className="text-gray-500 text-sm mt-2">
            {selectedEmployee?.status === EmployeeStatus.WORKING 
              ? 'Nhân viên sẽ không thể đăng nhập vào hệ thống sau khi bị vô hiệu hóa.'
              : 'Nhân viên sẽ có thể đăng nhập lại vào hệ thống sau khi được kích hoạt.'
            }
          </p>
          <div className="flex justify-end mt-6 space-x-3">
            <button
              onClick={() => setIsStatusModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Hủy bỏ
            </button>
            <button
              onClick={handleChangeEmployeeStatus}
              className={`px-4 py-2 ${selectedEmployee?.status === EmployeeStatus.WORKING ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white rounded-md disabled:opacity-50`}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Đang xử lý...' : selectedEmployee?.status === EmployeeStatus.WORKING ? 'Vô hiệu hóa' : 'Kích hoạt'}
            </button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
