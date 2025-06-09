'use client';

import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { StoreForm } from '@/components/Store';
import { getStores, createStore, updateStore, deleteStore } from '@/lib/store';
import { Store, StoreFormData, StoreStatus } from '@/models/store';
import { Plus, Pencil, Trash2, RefreshCw, SearchIcon, MoreVertical, FileEditIcon, PhoneIcon } from 'lucide-react';

// Shadcn UI components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from "@/components/ui/pagination";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Badge } from "@/components/ui/badge";

// Define store status badges
const statusMap = {
  [StoreStatus.ACTIVE]: {
    label: 'Hoạt động',
    color: 'bg-green-100 text-green-800 border-green-200',
    variant: 'secondary' as const
  },
  [StoreStatus.SUSPENDED]: {
    label: 'Tạm ngưng',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    variant: 'outline' as const
  },
  [StoreStatus.INACTIVE]: {
    label: 'Không hoạt động',
    color: 'bg-red-100 text-red-800 border-red-200',
    variant: 'destructive' as const
  }
};

export default function StoresPage() {
  // State cho phân trang và tìm kiếm
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalStores, setTotalStores] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // State cho search và filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // State cho dữ liệu và loading
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State cho dialog
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Format currency
  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };

  // Load danh sách cửa hàng
  const fetchStores = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error, totalPages: pages, count } = await getStores(
        currentPage,
        pageSize,
        searchQuery,
        statusFilter
      );
      
      if (error) {
        throw new Error((error as any)?.message || 'Đã xảy ra lỗi khi tải dữ liệu');
      }
      
      setStores(data);
      setTotalPages(pages);
      setTotalStores(count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Effect để load cửa hàng khi mount và khi filters thay đổi
  useEffect(() => {
    fetchStores();
  }, [currentPage, pageSize, searchQuery, statusFilter]);

  // Xử lý tìm kiếm
  const handleSearch = () => {
    setCurrentPage(1); // Reset về trang 1 khi tìm kiếm
    fetchStores();
  };
  
  // Reset tìm kiếm
  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setCurrentPage(1);
  };

  // Xử lý thêm cửa hàng mới
  const handleAddStore = async (data: StoreFormData) => {
    setIsSubmitting(true);
    
    try {
      const { data: newStore, error } = await createStore(data);
      
      if (error) {
        throw new Error((error as any)?.message || 'Không thể tạo cửa hàng mới');
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
        throw new Error((error as any)?.message || 'Không thể cập nhật cửa hàng');
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
        throw new Error((error as any)?.message || 'Không thể xóa cửa hàng');
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

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow) {
      // Show all pages if there are few
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show a subset of pages with current page in the middle
      let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
      let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
      
      // Adjust if we're near the end
      if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };
  
  // Render phân trang
  const renderPagination = () => {
    const effectiveTotalPages = Math.max(1, totalPages);
    const pageNumbers = totalPages > 0 ? getPageNumbers() : [1];
    
    return (
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-muted-foreground">
          Hiển thị {stores.length} / {totalStores} cửa hàng
        </div>
        
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                href="#" 
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage > 1) handlePageChange(currentPage - 1);
                }}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
            
            {/* First page link */}
            {pageNumbers[0] > 1 && (
              <>
                <PaginationItem>
                  <PaginationLink onClick={() => handlePageChange(1)}>
                    1
                  </PaginationLink>
                </PaginationItem>
                {pageNumbers[0] > 2 && (
                  <PaginationItem>
                    <span className="px-2">...</span>
                  </PaginationItem>
                )}
              </>
            )}
            
            {/* Page numbers */}
            {pageNumbers.map((page) => (
              <PaginationItem key={page}>
                <PaginationLink 
                  onClick={() => handlePageChange(page)}
                  isActive={currentPage === page}
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            ))}
            
            {/* Last page link */}
            {pageNumbers[pageNumbers.length - 1] < effectiveTotalPages - 1 && (
              <PaginationItem>
                <span className="px-2">...</span>
              </PaginationItem>
            )}
            {pageNumbers[pageNumbers.length - 1] < effectiveTotalPages && (
              <PaginationItem>
                <PaginationLink onClick={() => handlePageChange(effectiveTotalPages)}>
                  {effectiveTotalPages}
                </PaginationLink>
              </PaginationItem>
            )}
            
            <PaginationItem>
              <PaginationNext 
                href="#" 
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage < effectiveTotalPages) handlePageChange(currentPage + 1);
                }}
                className={currentPage === effectiveTotalPages ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };
  
  return (
    <Layout>
      <div className="max-w-full">
        {/* Title và actions */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý cửa hàng</h1>
          </div>
        </div>
        
        {/* Search and filters */}
        <div className="space-y-4 my-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-1">
                Tìm kiếm
              </label>
              <div className="relative">
                <Input
                  id="query"
                  placeholder="Tìm kiếm theo tên cửa hàng..."
                  className="w-full pr-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <SearchIcon className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                Trạng thái
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value={StoreStatus.ACTIVE}>Hoạt động</SelectItem>
                  <SelectItem value={StoreStatus.SUSPENDED}>Tạm ngưng</SelectItem>
                  <SelectItem value={StoreStatus.INACTIVE}>Không hoạt động</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between gap-2 mb-4">
            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  setSelectedStore(null);
                  setIsFormModalOpen(true);
                }}
                size="sm"
                className="text-white bg-green-600 hover:bg-green-700"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Thêm mới
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                className="bg-gray-100"
                onClick={handleResetFilters}
              >
                Đặt lại bộ lọc
              </Button>
              <Button 
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSearch}
              >
                Tìm kiếm
              </Button>
            </div>
          </div>
        </div>
        
        {/* Error message */}
        {error && (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        )}
        
        {/* Danh sách cửa hàng */}
        <div className="rounded-md border mt-4 mb-1 border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 text-center flex justify-center items-center">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Đang tải...</span>
            </div>
          ) : stores.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              Không tìm thấy cửa hàng nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50 border-b">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-left font-medium w-12 border-b border-r border-gray-200">#</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tên cửa hàng</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Địa chỉ</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Vốn đầu tư</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Quỹ tiền mặt</TableHead>
                    <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Trạng thái</TableHead>
                    <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store, index) => (
                    <TableRow key={store.id} className="hover:bg-gray-50 transition-colors">
                      <TableCell className="py-3 px-3 text-gray-500 border-b border-r border-gray-200">
                        {(currentPage - 1) * pageSize + index + 1}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div className="font-medium cursor-pointer hover:text-primary" 
                          onClick={() => openEditModal(store)}>
                          {store.name}
                        </div>
                        <div className="text-sm text-muted-foreground">{store.phone}</div>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div className="text-sm">{store.address}</div>
                      </TableCell>
                      <TableCell className="py-3 px-3 font-medium border-b border-r border-gray-200">
                        {formatCurrency(store.investment)}
                      </TableCell>
                      <TableCell className="py-3 px-3 font-medium border-b border-r border-gray-200">
                        {formatCurrency(store.cash_fund)}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div className="flex justify-center">
                          <Badge 
                            className={statusMap[store.status || StoreStatus.INACTIVE].color}
                            variant="outline"
                          >
                            {statusMap[store.status || StoreStatus.INACTIVE].label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-gray-200">
                        <div className="flex justify-center space-x-1">
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0" 
                            onClick={() => openEditModal(store)}
                          >
                            <Pencil className="h-4 w-4 text-gray-500" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0" 
                            onClick={() => openDeleteModal(store)}
                          >
                            <Trash2 className="h-4 w-4 text-gray-500" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Mở menu</span>
                                <MoreVertical className="h-4 w-4 text-gray-500" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEditModal(store)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Sửa thông tin
                              </DropdownMenuItem>
                              {store.phone && (
                                <DropdownMenuItem onClick={() => window.open(`tel:${store.phone}`)}>
                                  <PhoneIcon className="mr-2 h-4 w-4" />
                                  Gọi điện
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openDeleteModal(store)} className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Xóa cửa hàng
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
        <div className="mt-4">
          {!isLoading && stores.length > 0 && renderPagination()}
        </div>
        
        {/* Modal Form */}
        <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{selectedStore ? 'Chỉnh sửa cửa hàng' : 'Thêm cửa hàng mới'}</DialogTitle>
            </DialogHeader>
            
            <StoreForm
              initialData={selectedStore}
              onSubmit={selectedStore ? handleUpdateStore : handleAddStore}
              isSubmitting={isSubmitting}
              hideButtons={false}
            />
            
            <DialogFooter className="mt-6">
              <Button variant="outline" type="button" onClick={() => setIsFormModalOpen(false)}>
                Hủy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Modal Xóa */}
        <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc chắn muốn xóa cửa hàng: <span className="font-semibold">{selectedStore?.name}</span>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>Hủy bỏ</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteStore} 
                disabled={isSubmitting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isSubmitting ? 'Đang xử lý...' : 'Xác nhận xóa'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
