"use client";
import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { AdminsPagination } from '@/components/Admins/AdminsPagination';
import { SearchFilters, AdminSearchFilters } from '@/components/Admins/SearchFilters';
import { AdminCreateModal } from '@/components/Admins/AdminCreateModal';
import { AdminEditModal } from '@/components/Admins/AdminEditModal';
import { AdminStatusDialog } from '@/components/Admins/AdminStatusDialog';
import { AdminDeleteDialog } from '@/components/Admins/AdminDeleteDialog';
import { AdminBulkDeactivateDialog } from '@/components/Admins/AdminBulkDeactivateDialog';
import { getAdmins } from '@/lib/admin';
import { AdminStatus, AdminWithProfile } from '@/models/admin';
import { Edit, UserX, UserCheck, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function AdminsPage() {
  const router = useRouter();
  
  // All useState hooks must be at the top
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [admins, setAdmins] = useState<AdminWithProfile[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminWithProfile | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Fetch danh sách admin
  const fetchAdmins = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error, totalPages: pages } = await getAdmins(
        currentPage,
        10,
        searchQuery,
        statusFilter
      );
      
      if (error) {
        const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
          ? String(error.message) 
          : 'Lỗi không xác định';
        throw new Error(errorMessage);
      }
      
      setAdmins(data);
      setTotalPages(pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };
  
  // All useEffect hooks must be together and before any conditional logic
  // Check authentication and role
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
        
        if (!user || user.role !== 'superadmin') {
          router.push('/dashboard');
          return;
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        router.push('/dashboard');
      } finally {
        setIsCheckingAuth(false);
      }
    };
    
    checkAuth();
  }, [router]);

  // Fetch lại khi các dependency thay đổi
  useEffect(() => {
    if (currentUser && currentUser.role === 'superadmin') {
      fetchAdmins();
    }
  }, [currentPage, searchQuery, statusFilter, currentUser]);
  
  // Don't render if still checking auth or not superadmin
  if (isCheckingAuth || !currentUser || currentUser.role !== 'superadmin') {
    return null;
  }

  // Mở modal chỉnh sửa
  const openEditModal = (admin: AdminWithProfile) => {
    setSelectedAdmin(admin);
    setIsFormModalOpen(true);
  };

  // Mở modal thay đổi trạng thái
  const openStatusModal = (admin: AdminWithProfile) => {
    setSelectedAdmin(admin);
    setIsStatusModalOpen(true);
  };

  // Mở modal xóa
  const openDeleteModal = (admin: AdminWithProfile) => {
    setSelectedAdmin(admin);
    setIsDeleteModalOpen(true);
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
            <h1 className="text-lg font-bold">Quản lý Admin</h1>
            <span className="text-sm text-gray-500">(Chỉ dành cho Superadmin)</span>
          </div>
        </div>

        {/* Search và filter */}
        <SearchFilters 
          onSearch={(filters: AdminSearchFilters) => {
            setSearchQuery(filters.query);
            setStatusFilter(filters.status);
            setCurrentPage(1);
          }}
          onReset={() => {
            setSearchQuery('');
            setStatusFilter('all');
            setCurrentPage(1);
          }}
          onCreateNew={() => {
            setSelectedAdmin(null);
            setIsFormModalOpen(true);
          }}
          onDeactivateAll={() => setIsBulkModalOpen(true)}
        />

        {/* Hiển thị lỗi nếu có */}
        {error && (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        )}

        {/* Danh sách admin */}
        <div className="rounded-md border mt-4 mb-1">
          {isLoading ? (
            <div className="overflow-hidden">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Họ tên</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tên đăng nhập</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Email</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Vai trò</TableHead>
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
          ) : admins.length === 0 ? (
            <div className="overflow-hidden">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Họ tên</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tên đăng nhập</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Email</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Vai trò</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Trạng thái</TableHead>
                    <TableHead className="py-2 px-3 text-center font-medium border-b border-gray-200">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-gray-500 border-b border-gray-200">
                      <div className="py-8">
                        <h3 className="text-lg font-medium">Không tìm thấy admin nào</h3>
                        <p className="text-sm text-muted-foreground mt-1">Thử thay đổi điều kiện tìm kiếm hoặc thêm admin mới</p>
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
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Email</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Vai trò</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Trạng thái</TableHead>
                    <TableHead className="py-2 px-3 text-center font-medium border-b border-gray-200">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map((admin) => (
                    <TableRow key={admin.id} className="hover:bg-gray-50 transition-colors">
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div 
                          className="font-medium cursor-pointer text-blue-600" 
                          onClick={() => openEditModal(admin)}
                        >
                          {admin.full_name || admin.username}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div>{admin.username}</div>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        {admin.email || '-'}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                          {admin.role === 'admin' ? 'Admin' : 'Superadmin'}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div className="flex justify-center">
                          <span className={`px-2 py-1 rounded-full text-xs ${admin.status === AdminStatus.ACTIVE ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {admin.status === AdminStatus.ACTIVE ? 'Hoạt động' : 'Vô hiệu hóa'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-gray-200">
                        <div className="flex justify-center space-x-1">
                          <Button
                            onClick={() => openEditModal(admin)}
                            variant="ghost"
                            size="sm"
                            title="Chỉnh sửa"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => openStatusModal(admin)}
                            variant="ghost"
                            size="sm"
                            className={admin.status === AdminStatus.ACTIVE ? 'text-destructive hover:text-destructive' : 'text-success hover:text-success'}
                            title={admin.status === AdminStatus.ACTIVE ? 'Vô hiệu hóa' : 'Kích hoạt'}
                          >
                            {admin.status === AdminStatus.ACTIVE ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </Button>
                          <Button
                            onClick={() => openDeleteModal(admin)}
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            title="Xóa"
                          >
                            <Trash2 className="h-4 w-4" />
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
        <AdminsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalPages * 10}
          itemsPerPage={10}
          onPageChange={handlePageChange}
        />
      </div>

      {/* Modal thêm admin mới */}
      <AdminCreateModal
        isOpen={isFormModalOpen && !selectedAdmin}
        onClose={() => setIsFormModalOpen(false)}
        onSuccess={() => {
          fetchAdmins();
        }}
      />

      {/* Modal sửa thông tin admin */}
      <AdminEditModal
        isOpen={isFormModalOpen && !!selectedAdmin}
        onClose={() => {
          setIsFormModalOpen(false);
          setSelectedAdmin(null);
        }}
        onSuccess={() => {
          fetchAdmins();
        }}
        admin={selectedAdmin}
      />

      {/* Dialog thay đổi trạng thái admin */}
      <AdminStatusDialog
        isOpen={isStatusModalOpen}
        onClose={() => {
          setIsStatusModalOpen(false);
          setSelectedAdmin(null);
        }}
        onSuccess={() => {
          fetchAdmins();
        }}
        admin={selectedAdmin}
      />

      <AdminDeleteDialog
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedAdmin(null);
        }}
        onSuccess={() => {
          fetchAdmins();
        }}
        admin={selectedAdmin}
      />

      <AdminBulkDeactivateDialog
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        admins={admins}
        onSuccess={() => fetchAdmins()}
      />
    </Layout>
  );
} 