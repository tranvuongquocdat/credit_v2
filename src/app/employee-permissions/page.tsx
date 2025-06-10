"use client";

import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { EmployeePermissionModal } from '@/components/Permissions/EmployeePermissionModal';
import { getEmployees } from '@/lib/employee';
import { initializeDefaultPermissions } from '@/lib/permission';
import { getCurrentUser } from '@/lib/auth';
import { EmployeeWithProfile } from '@/models/employee';
import { 
  Search, 
  UserCog, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

interface EmployeePermissionFilters {
  search: string;
  status: string;
  store: string;
}

export default function EmployeePermissionsPage() {
  const [employees, setEmployees] = useState<EmployeeWithProfile[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  
  // Filters
  const [filters, setFilters] = useState<EmployeePermissionFilters>({
    search: '',
    status: 'all',
    store: ''
  });
  
  // Modal state
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithProfile | null>(null);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    loadData();
    initializePermissions();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [employees, filters]);

  useEffect(() => {
    updatePagination();
  }, [filteredEmployees, currentPage]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load current user
      const user = await getCurrentUser();
      setCurrentUser(user);

      // Load employees
      const { data, error } = await getEmployees(1, 1000); // Load all employees
      if (error) {
        throw new Error('Không thể tải danh sách nhân viên');
      }
      
      setEmployees(data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tải dữ liệu',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const initializePermissions = async () => {
    try {
      await initializeDefaultPermissions();
    } catch (error) {
      console.error('Error initializing permissions:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...employees];

    // Search filter
    if (filters.search.trim()) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(employee => 
        employee.full_name.toLowerCase().includes(searchTerm) ||
        employee.profiles?.username.toLowerCase().includes(searchTerm) ||
        employee.profiles?.email?.toLowerCase().includes(searchTerm)
      );
    }

    // Status filter
    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter(employee => employee.status === filters.status);
    }

    setFilteredEmployees(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const updatePagination = () => {
    const total = Math.ceil(filteredEmployees.length / pageSize);
    setTotalPages(total);
  };

  const getCurrentPageEmployees = () => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredEmployees.slice(startIndex, endIndex);
  };

  const handleFilterChange = (key: keyof EmployeePermissionFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handlePermissionClick = (employee: EmployeeWithProfile) => {
    setSelectedEmployee(employee);
    setIsPermissionModalOpen(true);
  };

  const handlePermissionModalClose = () => {
    setIsPermissionModalOpen(false);
    setSelectedEmployee(null);
  };

  const handlePermissionSuccess = () => {
    toast({
      title: 'Thành công',
      description: 'Đã cập nhật quyền cho nhân viên',
    });
    // Có thể reload data nếu cần
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'working':
        return <Badge variant="default" className="bg-green-100 text-green-800">Đang làm việc</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Không hoạt động</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Phân quyền nhân viên</h1>
            <p className="text-gray-600 mt-1">Quản lý quyền truy cập cho từng nhân viên</p>
          </div>
          <Button
            onClick={loadData}
            variant="outline"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bộ lọc</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Tìm kiếm nhân viên..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status Filter */}
              <Select
                value={filters.status}
                onValueChange={(value) => handleFilterChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="working">Đang làm việc</SelectItem>
                  <SelectItem value="inactive">Không hoạt động</SelectItem>
                </SelectContent>
              </Select>

              {/* Store Filter - có thể thêm sau */}
              <div className="flex items-center text-sm text-gray-500">
                Tổng: {filteredEmployees.length} nhân viên
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Employee Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead>Tên đăng nhập</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead className="text-center">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <div className="flex items-center justify-center">
                          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                          Đang tải...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : getCurrentPageEmployees().length > 0 ? (
                    getCurrentPageEmployees().map((employee) => (
                      <TableRow key={employee.uid} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="font-medium">{employee.full_name}</div>
                          <div className="text-sm text-gray-500">{employee.phone}</div>
                        </TableCell>
                        <TableCell>{employee.profiles?.username}</TableCell>
                        <TableCell>{employee.profiles?.email || '-'}</TableCell>
                        <TableCell>{getStatusBadge(employee.status)}</TableCell>
                        <TableCell>{formatDate(employee.created_at)}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePermissionClick(employee)}
                            className="flex items-center gap-2"
                          >
                            <UserCog className="h-4 w-4" />
                            Phân quyền
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        {filters.search || (filters.status && filters.status !== 'all') ? 
                          'Không tìm thấy nhân viên nào phù hợp' : 
                          'Chưa có nhân viên nào'
                        }
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Hiển thị {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredEmployees.length)} 
              trong tổng số {filteredEmployees.length} nhân viên
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Trước
              </Button>
              <span className="text-sm">
                Trang {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Sau
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Permission Modal */}
      <EmployeePermissionModal
        isOpen={isPermissionModalOpen}
        onClose={handlePermissionModalClose}
        onSuccess={handlePermissionSuccess}
        employee={selectedEmployee}
        currentUserId={currentUser?.id || ''}
      />
    </Layout>
  );
} 