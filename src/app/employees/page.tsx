"use client";
import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { EmployeeForm } from '@/components/Employee';
import { Modal } from '@/components/ui';
import { getEmployees, createEmployee, updateEmployee, deactivateEmployee, activateEmployee } from '@/lib/employee';
import { getStores } from '@/lib/store';
import { Employee, EmployeeFormData, EmployeeStatus, EmployeeWithAuth } from '@/models/employee';
import { Store } from '@/models/store';
import { Plus, Edit, UserX, UserCheck, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  // Render phân trang
  const renderPagination = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(
        <Button
          key={i}
          onClick={() => setCurrentPage(i)}
          variant={currentPage === i ? "default" : "outline"}
          size="sm"
          className="w-10"
        >
          {i}
        </Button>
      );
    }
    
    return (
      <div className="flex justify-center mt-6 space-x-2">
        <Button
          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          variant="outline"
          size="sm"
        >
          Trước
        </Button>
        {pages}
        <Button
          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages}
          variant="outline"
          size="sm"
        >
          Sau
        </Button>
      </div>
    );
  };

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Quản lý nhân viên</h1>
          <Button
            onClick={() => {
              setSelectedEmployee(null);
              setIsFormModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Thêm nhân viên
          </Button>
        </div>

        {/* Search và filter */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label htmlFor="search" className="text-sm font-medium">
                  Tìm kiếm theo tên
                </label>
                <Input
                  type="text"
                  id="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nhập tên nhân viên..."
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="store" className="text-sm font-medium">
                  Lọc theo cửa hàng
                </label>
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả cửa hàng" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả cửa hàng</SelectItem>
                    {stores.map(store => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="status" className="text-sm font-medium">
                  Lọc theo trạng thái
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value={EmployeeStatus.WORKING}>Đang làm việc</SelectItem>
                    <SelectItem value={EmployeeStatus.INACTIVE}>Đã nghỉ việc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-end">
                <Button type="submit">
                  <Search className="mr-2 h-4 w-4" /> Tìm kiếm
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Hiển thị lỗi nếu có */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6 text-red-700">
              {error}
            </CardContent>
          </Card>
        )}

        {/* Danh sách nhân viên */}
        <Card>
          <CardHeader>
            <CardTitle>Danh sách nhân viên</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="p-6 text-center">Đang tải...</div>
            ) : employees.length === 0 ? (
              <div className="p-6 text-center">
                Không tìm thấy nhân viên nào
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Họ tên</TableHead>
                      <TableHead>Tên đăng nhập</TableHead>
                      <TableHead>Cửa hàng</TableHead>
                      <TableHead>Liên hệ</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((employee) => (
                      <TableRow key={employee.uid}>
                        <TableCell>
                          <div 
                            className="font-medium cursor-pointer hover:text-primary" 
                            onClick={() => openEditModal(employee)}
                          >
                            {employee.full_name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{employee.auth.username}</div>
                          <div className="text-sm text-muted-foreground">{employee.auth.email}</div>
                        </TableCell>
                        <TableCell>
                          {employee.store?.name || '-'}
                        </TableCell>
                        <TableCell>
                          {employee.phone || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={employee.status === EmployeeStatus.WORKING ? "success" : "destructive"}>
                            {employee.status === EmployeeStatus.WORKING ? 'Đang làm việc' : 'Đã nghỉ việc'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
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
                
                {/* Phân trang */}
                {totalPages > 1 && renderPagination()}
              </div>
            )}
          </CardContent>
        </Card>
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
          <p>
            {selectedEmployee?.status === EmployeeStatus.WORKING 
              ? `Bạn có chắc chắn muốn vô hiệu hóa tài khoản của nhân viên "${selectedEmployee?.full_name}"?`
              : `Bạn có chắc chắn muốn kích hoạt lại tài khoản của nhân viên "${selectedEmployee?.full_name}"?`
            }
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            {selectedEmployee?.status === EmployeeStatus.WORKING 
              ? 'Nhân viên sẽ không thể đăng nhập vào hệ thống sau khi bị vô hiệu hóa.'
              : 'Nhân viên sẽ có thể đăng nhập lại vào hệ thống sau khi được kích hoạt.'
            }
          </p>
          <div className="flex justify-end mt-6 space-x-3">
            <Button
              onClick={() => setIsStatusModalOpen(false)}
              variant="outline"
            >
              Hủy bỏ
            </Button>
            <Button
              onClick={handleChangeEmployeeStatus}
              variant={selectedEmployee?.status === EmployeeStatus.WORKING ? "destructive" : "default"}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Đang xử lý...' : selectedEmployee?.status === EmployeeStatus.WORKING ? 'Vô hiệu hóa' : 'Kích hoạt'}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
