"use client";
import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { EmployeesPagination } from '@/components/Employees/EmployeesPagination';
import { SearchFilters, EmployeeSearchFilters } from '@/components/Employees/SearchFilters';
import { EmployeeCreateModal } from '@/components/Employees/EmployeeCreateModal';
import { EmployeeEditModal } from '@/components/Employees/EmployeeEditModal';
import { EmployeeStatusDialog } from '@/components/Employees/EmployeeStatusDialog';
import { getEmployees, createEmployee, updateEmployee, deactivateEmployee, activateEmployee } from '@/lib/employee';
import { getStores } from '@/lib/store';
import { Employee, EmployeeFormData, EmployeeStatus, EmployeeWithAuth } from '@/models/employee';
import { Store } from '@/models/store';
import { Plus, Edit, UserX, UserCheck, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
  
  // Nội dung các hàm xử lý tìm kiếm đã được di chuyển vào SearchFilters component

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
      const { error } = await updateEmployee(selectedEmployee.uid, data);
      
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

  // Các hàm xử lý form đã được di chuyển vào các modal component

  // Xử lý thay đổi trạng thái nhân viên
  const handleChangeEmployeeStatus = async () => {
    if (!selectedEmployee) return;
    
    setIsSubmitting(true);
    
    try {
      const isActivating = selectedEmployee.status === EmployeeStatus.INACTIVE;
      const { error } = isActivating 
        ? await activateEmployee(selectedEmployee.uid)
        : await deactivateEmployee(selectedEmployee.uid);
      
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

  // Xử lý thay đổi trang
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <Layout>
      <div className="max-w-full">
        {/* Title và nút trở về */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý nhân viên</h1>
          </div>
        </div>

        {/* Search và filter */}
        <SearchFilters 
          stores={stores}
          onSearch={(filters: EmployeeSearchFilters) => {
            setSearchQuery(filters.query);
            setStoreFilter(filters.store);
            setStatusFilter(filters.status);
            setCurrentPage(1);
          }}
          onReset={() => {
            setSearchQuery('');
            setStoreFilter('all');
            setStatusFilter('all');
            setCurrentPage(1);
          }}
          onCreateNew={() => {
            setSelectedEmployee(null);
            setIsFormModalOpen(true);
          }}
        />

        {/* Hiển thị lỗi nếu có */}
        {error && (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        )}

        {/* Danh sách nhân viên */}
        <div className="rounded-md border mt-4 mb-1">
          {isLoading ? (
            <div className="overflow-hidden">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Họ tên</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tên đăng nhập</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Cửa hàng</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Liên hệ</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Trạng thái</TableHead>
                    <TableHead className="py-2 px-3 text-center font-medium border-b border-gray-200">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-gray-500 border-b border-gray-200">
                      <div className="flex justify-center items-center py-12">
                        <RefreshCw className="animate-spin h-6 w-6 text-gray-400" />
                        <span className="ml-2">Đang tải dữ liệu...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : employees.length === 0 ? (
            <div className="overflow-hidden">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Họ tên</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tên đăng nhập</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Cửa hàng</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Liên hệ</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Trạng thái</TableHead>
                    <TableHead className="py-2 px-3 text-center font-medium border-b border-gray-200">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-gray-500 border-b border-gray-200">
                      <div className="py-8">
                        <h3 className="text-lg font-medium">Không tìm thấy nhân viên nào</h3>
                        <p className="text-sm text-muted-foreground mt-1">Thử thay đổi điều kiện tìm kiếm hoặc thêm nhân viên mới</p>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="overflow-hidden">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Họ tên</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tên đăng nhập</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Cửa hàng</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Liên hệ</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Trạng thái</TableHead>
                    <TableHead className="py-2 px-3 text-center font-medium border-b border-gray-200">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.uid} className="hover:bg-gray-50 transition-colors">
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div 
                          className="font-medium cursor-pointer text-blue-600" 
                          onClick={() => openEditModal(employee)}
                        >
                          {employee.full_name}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div>{employee.auth.username}</div>
                        <div className="text-sm text-muted-foreground">{employee.auth.email}</div>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        {employee.store?.name || '-'}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        {employee.phone || '-'}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div className="flex justify-center">
                          <span className={`px-2 py-1 rounded-full text-xs ${employee.status === EmployeeStatus.WORKING ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {employee.status === EmployeeStatus.WORKING ? 'Đang làm việc' : 'Đã nghỉ việc'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-gray-200">
                        <div className="flex justify-center space-x-1">
                          <Button
                            onClick={() => openEditModal(employee)}
                            variant="ghost"
                            size="sm"
                            title="Chỉnh sửa"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => openStatusModal(employee)}
                            variant="ghost"
                            size="sm"
                            className={employee.status === EmployeeStatus.WORKING ? 'text-destructive hover:text-destructive' : 'text-success hover:text-success'}
                            title={employee.status === EmployeeStatus.WORKING ? 'Vô hiệu hóa' : 'Kích hoạt'}
                          >
                            {employee.status === EmployeeStatus.WORKING ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        
        {/* Phân trang */}
        <EmployeesPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalPages * 10} // Assuming 10 items per page, adjust if needed
          itemsPerPage={10}
          onPageChange={handlePageChange}
        />
      </div>


      {/* Modal thêm nhân viên mới */}
      <EmployeeCreateModal
        isOpen={isFormModalOpen && !selectedEmployee}
        onClose={() => setIsFormModalOpen(false)}
        onSuccess={() => {
          fetchEmployees();
        }}
        stores={stores}
      />

      {/* Modal sửa thông tin nhân viên */}
      <EmployeeEditModal
        isOpen={isFormModalOpen && !!selectedEmployee}
        onClose={() => {
          setIsFormModalOpen(false);
          setSelectedEmployee(null);
        }}
        onSuccess={() => {
          fetchEmployees();
        }}
        employee={selectedEmployee}
        stores={stores}
      />

      {/* Dialog thay đổi trạng thái nhân viên */}
      <EmployeeStatusDialog
        isOpen={isStatusModalOpen}
        onClose={() => {
          setIsStatusModalOpen(false);
          setSelectedEmployee(null);
        }}
        onSuccess={() => {
          fetchEmployees();
        }}
        employee={selectedEmployee}
      />
    </Layout>
  );
}
