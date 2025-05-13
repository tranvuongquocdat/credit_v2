'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  getCredits, 
  markCreditAsOverdue, 
  closeCredit, 
  deleteCredit
} from '@/lib/credit';
import { Credit, CreditStatus, CreditWithCustomer, InterestType } from '@/models/credit';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from '@/components/ui/pagination';
// Import Calendar component đúng cách
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  AlertDialog, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
// Tạm thởi bỏ calendar date range selection
// import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { ChevronLeft, MoreVertical, PlusIcon, RefreshCw, FileEditIcon, Trash2Icon } from 'lucide-react';
import { Layout } from '@/components/Layout';

// Map trạng thái thành màu sắc và nhãn
const statusMap = {
  [CreditStatus.ON_TIME]: { label: 'Đúng hẹn', color: 'bg-green-100 text-green-800' },
  [CreditStatus.OVERDUE]: { label: 'Quá hạn', color: 'bg-red-100 text-red-800' },
  [CreditStatus.LATE_INTEREST]: { label: 'Chậm lãi', color: 'bg-yellow-100 text-yellow-800' },
  [CreditStatus.BAD_DEBT]: { label: 'Nợ xấu', color: 'bg-purple-100 text-purple-800' },
  [CreditStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-blue-100 text-blue-800' },
  [CreditStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800' },
};

// Format số tiền
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

// Format ngày tháng
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    return format(new Date(dateString), 'dd/MM/yyyy', { locale: vi });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '-';
  }
}

export default function CreditsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // State cho phân trang và tìm kiếm
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCredits, setTotalCredits] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');  // Giá trị rỗng tương ứng với 'all'
  // Tạm thời bỏ chức năng lọc theo ngày
  // const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  // State cho dữ liệu và loading
  const [credits, setCredits] = useState<CreditWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State cho dialog
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  // Tải danh sách hợp đồng
  useEffect(() => {
    async function loadCredits() {
      setIsLoading(true);
      setError(null);
      
      try {
        const { data, total, error } = await getCredits(
          currentPage,
          pageSize,
          searchQuery,
          '',  // Tạm thởi không dùng filter date
          selectedStatus
        );
        
        if (error) throw error;
        
        setCredits(data);
        setTotalCredits(total);
      } catch (err) {
        setError('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.');
        console.error('Error loading credits:', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadCredits();
  }, [currentPage, pageSize, searchQuery, selectedStatus]);
  
  // Xử lý khi thay đổi tìm kiếm
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset về trang 1 khi tìm kiếm
  };
  
  // Xử lý khi thay đổi trạng thái
  const handleStatusChange = (value: string) => {
    setSelectedStatus(value === 'all' ? '' : value);
    setCurrentPage(1);
  };
  
  // Xử lý khi thay đổi trang
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // Mở form tạo hợp đồng mới
  const handleCreateCredit = () => {
    router.push('/credits/create');
  };
  
  // Mở form chỉnh sửa hợp đồng
  const handleEditCredit = (credit: Credit) => {
    router.push(`/credits/edit/${credit.id}`);
  };
  
  // Xử lý khi thay đổi trạng thái hợp đồng
  const handleChangeStatus = async (status: CreditStatus) => {
    if (!selectedCredit) return;
    
    try {
      let result;
      
      if (status === CreditStatus.CLOSED) {
        result = await closeCredit(selectedCredit.id);
      } else if (status === CreditStatus.OVERDUE) {
        result = await markCreditAsOverdue(selectedCredit.id);
      } else {
        // Cập nhật trạng thái khác nếu cần
      }
      
      if (result?.error) {
        throw result.error;
      }
      
      // Refresh danh sách
      const { data, total, error } = await getCredits(
        currentPage,
        pageSize,
        searchQuery,
        '',
        selectedStatus
      );
      
      if (error) throw error;
      
      setCredits(data);
      setTotalCredits(total);
      setIsStatusDialogOpen(false);
    } catch (err) {
      console.error('Error updating credit status:', err);
      setError('Có lỗi xảy ra khi cập nhật trạng thái. Vui lòng thử lại sau.');
    }
  };
  
  // Xử lý khi xóa hợp đồng
  const handleDeleteCredit = async () => {
    if (!selectedCredit) return;
    
    try {
      const { error } = await deleteCredit(selectedCredit.id);
      
      if (error) throw error;
      
      // Refresh danh sách
      const { data, total, error: refreshError } = await getCredits(
        currentPage,
        pageSize,
        searchQuery,
        '',
        selectedStatus
      );
      
      if (refreshError) throw refreshError;
      
      setCredits(data);
      setTotalCredits(total);
      setIsDeleteDialogOpen(false);
    } catch (err) {
      console.error('Error deleting credit:', err);
      setError('Có lỗi xảy ra khi xóa hợp đồng. Vui lòng thử lại sau.');
    }
  };
  
  // Tính toán tổng số trang
  const totalPages = Math.ceil(totalCredits / pageSize);
  
  return (
    <Layout>
      <div className="container py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Quản lý hợp đồng tín chấp</CardTitle>
            <CardDescription>
              Tổng cộng {totalCredits} hợp đồng
            </CardDescription>
          </div>
          <Button onClick={handleCreateCredit}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Tạo hợp đồng mới
          </Button>
        </CardHeader>
        <CardContent>
          {/* Thanh tìm kiếm và bộ lọc */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Tìm kiếm theo mã hợp đồng, tên khách hàng..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full"
              />
            </div>
            <div className="flex flex-row gap-2">
              <Select value={selectedStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value={CreditStatus.ON_TIME}>Đúng hẹn</SelectItem>
                  <SelectItem value={CreditStatus.OVERDUE}>Quá hạn</SelectItem>
                  <SelectItem value={CreditStatus.LATE_INTEREST}>Chậm lãi</SelectItem>
                  <SelectItem value={CreditStatus.BAD_DEBT}>Nợ xấu</SelectItem>
                  <SelectItem value={CreditStatus.CLOSED}>Đã đóng</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Bỏ tạm phần date picker để sửa lỗi hydration */}
              {/* <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    <span>Chọn khoảng thời gian</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover> */}
            </div>
          </div>
          
          {/* Bảng danh sách hợp đồng */}
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <RefreshCw className="animate-spin h-8 w-8 text-gray-400" />
            </div>
          ) : error ? (
            <div className="text-center text-red-500 my-8">{error}</div>
          ) : credits.length === 0 ? (
            <div className="text-center text-gray-500 my-8">
              Không tìm thấy hợp đồng nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã hợp đồng</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Ngày vay</TableHead>
                    <TableHead>Số tiền</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credits.map((credit) => (
                    <TableRow key={credit.id}>
                      <TableCell>
                        <div className="font-medium">
                          {credit.contract_code || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {credit.customer?.name || "Không có thông tin"}
                      </TableCell>
                      <TableCell>{formatDate(credit.loan_date)}</TableCell>
                      <TableCell>{formatCurrency(credit.loan_amount)}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "whitespace-nowrap",
                            statusMap[credit.status as CreditStatus]?.color || "bg-gray-100"
                          )}
                        >
                          {statusMap[credit.status as CreditStatus]?.label || credit.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Mở menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedCredit(credit);
                                handleEditCredit(credit);
                              }}
                            >
                              <FileEditIcon className="mr-2 h-4 w-4" />
                              Sửa thông tin
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedCredit(credit);
                                setIsStatusDialogOpen(true);
                              }}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Cập nhật trạng thái
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedCredit(credit);
                                setIsDeleteDialogOpen(true);
                              }}
                              className="text-red-600"
                            >
                              <Trash2Icon className="mr-2 h-4 w-4" />
                              Xóa hợp đồng
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          
          {/* Phân trang */}
          {totalPages > 0 && (
            <div className="mt-6 flex justify-center">
              <Pagination>
                <PaginationContent>
                  {currentPage > 1 && (
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(currentPage - 1);
                        }}
                      />
                    </PaginationItem>
                  )}
                  
                  {Array.from({ length: totalPages }, (_, i) => (
                    <PaginationItem key={i + 1}>
                      <PaginationLink
                        href="#"
                        isActive={currentPage === i + 1}
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(i + 1);
                        }}
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  
                  {currentPage < totalPages && (
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(currentPage + 1);
                        }}
                      />
                    </PaginationItem>
                  )}
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Dialog cập nhật trạng thái */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cập nhật trạng thái hợp đồng</DialogTitle>
            <DialogDescription>
              Chọn trạng thái mới cho hợp đồng {selectedCredit?.contract_code || ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Select onValueChange={(value) => handleChangeStatus(value as CreditStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn trạng thái mới" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CreditStatus.ON_TIME}>Đúng hẹn</SelectItem>
                <SelectItem value={CreditStatus.OVERDUE}>Quá hạn</SelectItem>
                <SelectItem value={CreditStatus.LATE_INTEREST}>Chậm lãi</SelectItem>
                <SelectItem value={CreditStatus.BAD_DEBT}>Nợ xấu</SelectItem>
                <SelectItem value={CreditStatus.CLOSED}>Đã đóng</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsStatusDialogOpen(false)}>Hủy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog xác nhận xóa */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa hợp đồng</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa hợp đồng này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="secondary" onClick={() => setIsDeleteDialogOpen(false)}>Hủy</Button>
            <Button variant="destructive" onClick={handleDeleteCredit}>Xóa</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </Layout>
  );
}
