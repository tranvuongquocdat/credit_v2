import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Customer } from '@/models/customer';
import { Store } from '@/models/store';
import { cn } from '@/lib/utils';
import { MoreVertical, FileEditIcon, Trash2Icon, CreditCardIcon, PhoneIcon, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface CustomersTableProps {
  customers: Customer[];
  stores: Store[];
  statusMap: StatusMapType;
  currentPage: number;
  pageSize: number;
  isLoading: boolean;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
  onViewCredits: (customerId: string) => void;
  onView?: (customerId: string) => void;
}

export function CustomersTable({ 
  customers, 
  stores,
  statusMap, 
  currentPage,
  pageSize,
  isLoading,
  onEdit, 
  onDelete,
  onViewCredits,
  onView
}: CustomersTableProps) {
  // Format ngày tháng
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: vi });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '-';
    }
  };

  // Hiển thị loading state
  if (isLoading) {
    return (
      <div className="overflow-hidden">
        <Table className="border-collapse">
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="py-2 px-3 text-left font-medium w-12 border-b border-r border-gray-200">#</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tên khách hàng</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Số điện thoại</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">CCCD/CMND</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Địa chỉ</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Cửa hàng</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium w-28 border-b border-r border-gray-200">Ngày tạo</TableHead>
              <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Trạng thái</TableHead>
              <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-gray-500 border-b border-gray-200">
                <div className="flex justify-center items-center py-12">
                  <RefreshCw className="animate-spin h-6 w-6 text-gray-400" />
                  <span className="ml-2">Đang tải dữ liệu...</span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  // Hiển thị trạng thái trống
  if (customers.length === 0) {
    return (
      <div className="overflow-hidden">
        <Table className="border-collapse">
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="py-2 px-3 text-left font-medium w-12 border-b border-r border-gray-200">#</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tên khách hàng</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Số điện thoại</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">CCCD/CMND</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Địa chỉ</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Cửa hàng</TableHead>
              <TableHead className="py-2 px-3 text-left font-medium w-28 border-b border-r border-gray-200">Ngày tạo</TableHead>
              <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Trạng thái</TableHead>
              <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-gray-500 border-b border-gray-200">
                <div className="py-8">
                  <h3 className="text-lg font-medium">Không tìm thấy khách hàng</h3>
                  <p className="text-sm text-muted-foreground mt-1">Thử thay đổi điều kiện tìm kiếm hoặc thêm khách hàng mới</p>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  // Hiển thị dữ liệu khách hàng
  return (
    <div className="overflow-hidden">
      <Table className="border-collapse">
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="py-2 px-3 text-left font-medium w-12 border-b border-r border-gray-200">#</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tên khách hàng</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Số điện thoại</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">CCCD/CMND</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Địa chỉ</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Cửa hàng</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium w-28 border-b border-r border-gray-200">Ngày tạo</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Trạng thái</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer, index) => (
            <TableRow key={customer.id} className="hover:bg-gray-50 transition-colors">
              <TableCell className="py-3 px-3 text-gray-500 border-b border-r border-gray-200">
                {(currentPage - 1) * pageSize + index + 1}
              </TableCell>
              <TableCell 
                className="py-3 px-3 font-medium text-blue-600 cursor-pointer border-b border-r border-gray-200"
                onClick={() => onView ? onView(customer.id) : onEdit(customer)}
              >
                {customer.name || "-"}
              </TableCell>
              <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                {customer.phone || '-'}
              </TableCell>
              <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                {customer.id_number || '-'}
              </TableCell>
              <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                {customer.address || '-'}
              </TableCell>
              <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                {stores.find(s => s.id === customer.store_id)?.name || '-'}
              </TableCell>
              <TableCell className="py-3 px-3 text-gray-600 border-b border-r border-gray-200">
                {formatDate(customer.created_at)}
              </TableCell>
              <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                <div className="flex justify-center">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-xs",
                    statusMap.active?.color || "bg-green-100 text-green-800"
                  )}>
                    {statusMap.active?.label || "Hoạt động"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-3 px-3 border-b border-gray-200">
                <div className="flex justify-center space-x-1">
                  <Button 
                    variant="ghost" 
                    className="h-8 w-8 p-0" 
                    onClick={() => onEdit(customer)}
                  >
                    <FileEditIcon className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="h-8 w-8 p-0" 
                    onClick={() => onDelete(customer)}
                  >
                    <Trash2Icon className="h-4 w-4 text-gray-500" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Mở menu</span>
                        <MoreVertical className="h-4 w-4 text-gray-500" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {onView && (
                        <DropdownMenuItem onClick={() => onView(customer.id)}>
                          Xem chi tiết
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onViewCredits(customer.id)}>
                        <CreditCardIcon className="mr-2 h-4 w-4" />
                        Xem hợp đồng
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => window.open(`tel:${customer.phone}`)} disabled={!customer.phone}>
                        <PhoneIcon className="mr-2 h-4 w-4" />
                        Gọi điện
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(customer)} className="text-red-600">
                        <Trash2Icon className="mr-2 h-4 w-4" />
                        Xóa khách hàng
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
  );
}