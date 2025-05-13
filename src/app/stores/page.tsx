"use client";
import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { StoreForm } from '@/components/Store';
import { Modal } from '@/components/ui';
import { getStores, createStore, updateStore, deleteStore } from '@/lib/store';
import { Store, StoreFormData, StoreStatus } from '@/models/store';
import { Plus, Pencil, Trash2, Eye, Search, RefreshCw } from 'lucide-react';

// Shadcn UI components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  Table,
  TableBody,
  TableCaption,
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
  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };
  
  // Status map for styling
  const statusMap = {
    [StoreStatus.ACTIVE]: {
      label: 'Hoạt động',
      color: 'bg-green-100 text-green-800',
      variant: 'secondary' as const
    },
    [StoreStatus.SUSPENDED]: {
      label: 'Tạm ngưng',
      color: 'bg-orange-100 text-orange-800',
      variant: 'outline' as const
    },
    [StoreStatus.INACTIVE]: {
      label: 'Không hoạt động',
      color: 'bg-red-100 text-red-800',
      variant: 'destructive' as const
    }
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
        <Button
          key={i}
          onClick={() => setCurrentPage(i)}
          variant={currentPage === i ? "default" : "outline"}
          size="sm"
          className="w-9 h-9 p-0"
        >
          {i}
        </Button>
      );
    }
    
    return (
      <div className="flex justify-center mt-6 gap-2">
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
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold">Quản lý cửa hàng</CardTitle>
              <CardDescription>Danh sách các cửa hàng trong hệ thống</CardDescription>
            </div>
            <Button
              onClick={() => {
                setSelectedStore(null);
                setIsFormModalOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Thêm cửa hàng
            </Button>
          </CardHeader>

          <CardContent className="py-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Input
                  placeholder="Tìm kiếm theo tên cửa hàng..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex flex-row gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value={StoreStatus.ACTIVE}>Hoạt động</SelectItem>
                    <SelectItem value={StoreStatus.SUSPENDED}>Tạm ngưng</SelectItem>
                    <SelectItem value={StoreStatus.INACTIVE}>Không hoạt động</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={fetchStores}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Hiển thị lỗi nếu có */}
            {error && (
              <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6">
                {error}
              </div>
            )}

            {/* Danh sách cửa hàng */}
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên cửa hàng</TableHead>
                      <TableHead>Địa chỉ</TableHead>
                      <TableHead>Vốn đầu tư</TableHead>
                      <TableHead>Quỹ tiền mặt</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stores.map((store) => (
                      <TableRow key={store.id} className="cursor-default">
                        <TableCell>
                          <div className="font-medium cursor-pointer hover:text-primary" 
                            onClick={() => openEditModal(store)}>
                            {store.name}
                          </div>
                          <div className="text-sm text-muted-foreground">{store.phone}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{store.address}</div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(store.investment)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(store.cash_fund)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusMap[store.status || StoreStatus.INACTIVE].variant}>
                            {statusMap[store.status || StoreStatus.INACTIVE].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditModal(store)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteModal(store)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          <CardFooter>
            {/* Phân trang */}
            {!isLoading && stores.length > 0 && renderPagination()}
          </CardFooter>
        </Card>
        
        {/* Modal Form */}
        <Modal
          isOpen={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          title={selectedStore ? 'Chỉnh sửa cửa hàng' : 'Thêm cửa hàng mới'}
        >
          <StoreForm
            initialData={selectedStore}
            onSubmit={selectedStore ? handleUpdateStore : handleAddStore}
            isSubmitting={isSubmitting}
          />
        </Modal>
        
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
