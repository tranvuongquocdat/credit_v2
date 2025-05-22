"use client";

import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { StoreFundHistoryForm } from '@/components/StoreFundHistory';
import { getStoreFundHistory, createStoreFundHistory, updateStoreFundHistory, deleteStoreFundHistory } from '@/lib/storeFundHistory';
import { StoreFundHistory, StoreFundHistoryFormData, TransactionType, transactionTypeMap } from '@/models/storeFundHistory';
import { useStore } from '@/contexts/StoreContext';
import { Plus, Pencil, Trash2, RefreshCw, MoreVertical, FilterIcon, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { FinancialSummary } from '@/components/common/FinancialSummary';

// Shadcn UI components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";

export default function CapitalPage() {
  // Get current store from context
  const { currentStore } = useStore();
  
  // Reference to FinancialSummary for manual refresh
  const [financialSummaryKey, setFinancialSummaryKey] = useState(0);
  
  // Helper function to handle error messages
  const getErrorMessage = (error: any): string => {
    if (typeof error === 'object' && error !== null) {
      return error.message || String(error);
    }
    return String(error);
  };
  
  // State for pagination and search
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // State for filters
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<string>('all');
  
  // State for data and loading
  const [fundHistory, setFundHistory] = useState<StoreFundHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for dialogs
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<StoreFundHistory | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Format currency
  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy HH:mm');
    } catch (e) {
      return dateString;
    }
  };

  // Load store fund history
  const fetchFundHistory = async () => {
    if (!currentStore?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error, totalPages: pages, count } = await getStoreFundHistory(
        currentStore.id,
        currentPage,
        pageSize,
        dateFrom,
        dateTo,
        transactionTypeFilter
      );
      
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      
      setFundHistory(data);
      setTotalPages(pages);
      setTotalRecords(count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Effect to load fund history when component mounts and when filters change
  useEffect(() => {
    if (currentStore?.id) {
      fetchFundHistory();
    }
  }, [currentStore?.id, currentPage, pageSize, dateFrom, dateTo, transactionTypeFilter]);

  // Handle search
  const handleSearch = () => {
    setCurrentPage(1); // Reset to page 1 when searching
    fetchFundHistory();
  };
  
  // Reset filters
  const handleResetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setTransactionTypeFilter('all');
    setCurrentPage(1);
  };

  // Handle adding new record
  const handleAddRecord = async (data: StoreFundHistoryFormData) => {
    setIsSubmitting(true);
    
    try {
      const { data: newRecord, error } = await createStoreFundHistory({
        ...data,
        store_id: currentStore?.id || ''
      });
      
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      
      setIsFormModalOpen(false);
      // Refresh fund history and financial summary
      fetchFundHistory();
      setFinancialSummaryKey(prev => prev + 1); // Force FinancialSummary to refresh
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo giao dịch mới');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle updating a record
  const handleUpdateRecord = async (data: StoreFundHistoryFormData) => {
    if (!selectedRecord) return;
    
    setIsSubmitting(true);
    
    try {
      const { error } = await updateStoreFundHistory(
        selectedRecord.id, 
        {
          ...data,
          store_id: currentStore?.id || ''
        }, 
        selectedRecord.fund_amount,
        selectedRecord.transaction_type || ''
      );
      
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      
      setIsFormModalOpen(false);
      setSelectedRecord(null);
      // Refresh fund history and financial summary
      fetchFundHistory();
      setFinancialSummaryKey(prev => prev + 1); // Force FinancialSummary to refresh
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật giao dịch');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle deleting a record
  const handleDeleteRecord = async () => {
    if (!selectedRecord) return;
    
    setIsSubmitting(true);
    
    try {
      const { error } = await deleteStoreFundHistory(selectedRecord.id);
      
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      
      setIsDeleteModalOpen(false);
      setSelectedRecord(null);
      // Refresh fund history and financial summary
      fetchFundHistory();
      setFinancialSummaryKey(prev => prev + 1); // Force FinancialSummary to refresh
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa giao dịch');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open edit modal
  const openEditModal = (record: StoreFundHistory) => {
    setSelectedRecord(record);
    setIsFormModalOpen(true);
  };

  // Open delete modal
  const openDeleteModal = (record: StoreFundHistory) => {
    setSelectedRecord(record);
    setIsDeleteModalOpen(true);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Get page numbers for pagination
  const getPageNumbers = () => {
    const effectiveTotalPages = Math.max(totalPages, 1);
    const currentPageWindow = 5; // Show 5 page numbers at a time
    
    let startPage = Math.max(1, currentPage - Math.floor(currentPageWindow / 2));
    let endPage = startPage + currentPageWindow - 1;
    
    if (endPage > effectiveTotalPages) {
      endPage = effectiveTotalPages;
      startPage = Math.max(1, endPage - currentPageWindow + 1);
    }
    
    return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
  };

  // Render pagination
  const renderPagination = () => {
    const pageNumbers = getPageNumbers();
    const effectiveTotalPages = Math.max(totalPages, 1);
    
    return (
      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <div>
          Hiển thị {fundHistory.length} / {totalRecords} bản ghi
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
                  <PaginationLink 
                    onClick={() => handlePageChange(1)}
                  >
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
        {/* Title and actions */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý nguồn vốn</h1>
          </div>
        </div>
        
        {/* Financial summary */}
        {currentStore && (
          <FinancialSummary 
            key={financialSummaryKey}
            storeId={currentStore.id} 
            onRefresh={fetchFundHistory}
            autoFetch={true}
          />
        )}
        
        {/* Search and filters */}
        <div className="space-y-4 my-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label htmlFor="dateFrom" className="block text-sm font-medium text-gray-700 mb-1">
                Từ ngày
              </label>
              <div className="relative">
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <CalendarIcon className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="dateTo" className="block text-sm font-medium text-gray-700 mb-1">
                Đến ngày
              </label>
              <div className="relative">
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <CalendarIcon className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="transactionType" className="block text-sm font-medium text-gray-700 mb-1">
                Loại giao dịch
              </label>
              <Select value={transactionTypeFilter} onValueChange={setTransactionTypeFilter}>
                <SelectTrigger id="transactionType" className="w-full">
                  <SelectValue placeholder="Loại giao dịch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả loại giao dịch</SelectItem>
                  <SelectItem value={TransactionType.DEPOSIT}>{transactionTypeMap[TransactionType.DEPOSIT].label}</SelectItem>
                  <SelectItem value={TransactionType.WITHDRAWAL}>{transactionTypeMap[TransactionType.WITHDRAWAL].label}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between gap-2 mb-4">
            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  setSelectedRecord(null);
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
                <FilterIcon className="mr-1 h-3.5 w-3.5" />
                Lọc dữ liệu
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
        
        {/* Fund history table */}
        <div className="rounded-md border mt-4 mb-1 border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 text-center flex justify-center items-center">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Đang tải...</span>
            </div>
          ) : fundHistory.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              Không tìm thấy giao dịch nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50 border-b">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-left font-medium w-12 border-b border-r border-gray-200">#</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Thời gian</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Loại giao dịch</TableHead>
                    <TableHead className="py-2 px-3 text-right font-medium border-b border-r border-gray-200">Số tiền</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Ghi chú</TableHead>
                    <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fundHistory.map((record, index) => (
                    <TableRow key={record.id} className="hover:bg-gray-50 transition-colors">
                      <TableCell className="py-3 px-3 text-gray-500 border-b border-r border-gray-200">
                        {(currentPage - 1) * pageSize + index + 1}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        {formatDate(record.created_at)}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <Badge 
                          className={record.transaction_type ? transactionTypeMap[record.transaction_type as TransactionType]?.color || '' : ''}
                          variant="outline"
                        >
                          {record.transaction_type ? transactionTypeMap[record.transaction_type as TransactionType]?.label || record.transaction_type : 'Không xác định'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 px-3 text-right font-medium border-b border-r border-gray-200">
                        <span className={
                          record.transaction_type === TransactionType.WITHDRAWAL 
                            ? 'text-red-600' 
                            : 'text-green-600'
                        }>
                          {formatCurrency(record.fund_amount)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div className="text-sm">{record.note || '-'}</div>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-gray-200">
                        <div className="flex justify-center space-x-1">
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0" 
                            onClick={() => openEditModal(record)}
                          >
                            <Pencil className="h-4 w-4 text-gray-500" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0" 
                            onClick={() => openDeleteModal(record)}
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
                              <DropdownMenuItem onClick={() => openEditModal(record)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Sửa thông tin
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openDeleteModal(record)} className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Xóa giao dịch
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
        
        {/* Pagination */}
        <div className="mt-4">
          {!isLoading && fundHistory.length > 0 && renderPagination()}
        </div>
        
        {/* Modal Form */}
        <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{selectedRecord ? 'Chỉnh sửa giao dịch' : 'Thêm giao dịch mới'}</DialogTitle>
            </DialogHeader>
            
            <StoreFundHistoryForm
              initialData={selectedRecord}
              onSubmit={selectedRecord ? handleUpdateRecord : handleAddRecord}
              isSubmitting={isSubmitting}
              hideButtons={true}
            />
            
            <DialogFooter className="mt-6">
              <Button 
                type="submit" 
                disabled={isSubmitting}
                onClick={(e) => {
                  e.preventDefault();
                  const form = document.querySelector('form');
                  if (form) {
                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                {selectedRecord ? 'Cập nhật' : 'Tạo mới'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Delete Modal */}
        <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc chắn muốn xóa giao dịch có giá trị <span className="font-semibold">{formatCurrency(selectedRecord?.fund_amount)}</span>?
                <br />
                Hành động này sẽ điều chỉnh lại quỹ tiền mặt của cửa hàng.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>Hủy bỏ</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteRecord} 
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