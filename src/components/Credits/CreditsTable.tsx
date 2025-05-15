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
import { cn } from '@/lib/utils';
import { CreditWithCustomer, CreditStatus } from '@/models/credit';
import { FileEditIcon, MoreVertical, Trash2Icon, CalendarIcon, ClockIcon } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface CreditsTableProps {
  credits: CreditWithCustomer[];
  statusMap: StatusMapType;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (credit: CreditWithCustomer) => void;
  onUpdateStatus: (credit: CreditWithCustomer) => void;
  onShowPaymentHistory?: (credit: CreditWithCustomer) => void;
}

export function CreditsTable({ 
  credits, 
  statusMap, 
  onView, 
  onEdit, 
  onDelete, 
  onUpdateStatus,
  onShowPaymentHistory 
}: CreditsTableProps) {
  // Format tiền tệ
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

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

  return (
    <div className="rounded-md border overflow-hidden mb-4">
      <Table className="border-collapse">
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="py-2 px-3 text-left font-medium w-12 border-b border-r border-gray-200">#</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Mã HĐ</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tên KH</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Tài sản</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Số tiền</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium w-28 border-b border-r border-gray-200">Ngày vay</TableHead>
            <TableHead className="py-2 px-3 text-left font-medium w-28 border-b border-r border-gray-200">Ngày trả</TableHead>
            <TableHead className="py-2 px-3 text-right font-medium w-28 border-b border-r border-gray-200">Lãi phí đã đóng</TableHead>
            <TableHead className="py-2 px-3 text-right font-medium w-28 border-b border-r border-gray-200">Nợ cũ</TableHead>
            <TableHead className="py-2 px-3 text-right font-medium w-28 border-b border-r border-gray-200">Lãi phí đến hôm nay</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Tình trạng</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {credits.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="py-8 text-center text-gray-500 border-b border-gray-200">
                Không tìm thấy hợp đồng nào
              </TableCell>
            </TableRow>
          ) : (
            credits.map((credit, index) => (
              <TableRow key={credit.id} className="hover:bg-gray-50 transition-colors">
                <TableCell className="py-3 px-3 text-gray-500 border-b border-r border-gray-200">{index + 1}</TableCell>
                <TableCell 
                  className="py-3 px-3 font-medium text-blue-600 cursor-pointer border-b border-r border-gray-200" 
                  onClick={() => onView(credit.id)}
                >
                  {credit.contract_code || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                  {credit.customer?.name || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                  {credit.collateral || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                  <div>
                    {formatCurrency(credit.loan_amount)}
                    <div className="text-xs text-red-800 mt-1">
                      {credit.interest_type === 'percentage' 
                        ? `${credit.interest_value}%` 
                        : `${formatCurrency(credit.interest_value)}`}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-gray-600 border-b border-r border-gray-200">
                  <div>
                    {formatDate(credit.loan_date)}
                    <div className="text-xs text-gray-400 mt-1">
                      Kỳ lãi: {credit.interest_period} ngày
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-gray-600 border-b border-r border-gray-200">
                  {formatDate(new Date(new Date(credit.loan_date).getTime() + credit.loan_period * 24 * 60 * 60 * 1000).toISOString())}
                </TableCell>
                <TableCell className="py-3 px-3 text-right border-b border-r border-gray-200">
                  {formatCurrency(credit.interest_value)}
                </TableCell>
                <TableCell className="py-3 px-3 text-right border-b border-r border-gray-200">
                  {/* Assuming old_debt is a field in your data model */}
                  {formatCurrency(0)} {/* Replace with actual old debt if available */}
                </TableCell>
                <TableCell className="py-3 px-3 text-right text-rose-600 font-medium border-b border-r border-gray-200">
                  -
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                  <div className="flex justify-center">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs",
                      statusMap[credit.status || CreditStatus.ON_TIME]?.color || "bg-gray-100 text-gray-800"
                    )}>
                      {statusMap[credit.status || CreditStatus.ON_TIME]?.label || "Không xác định"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-gray-200">
                  <div className="flex justify-center space-x-1">
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => onEdit(credit.id)}
                    >
                      <FileEditIcon className="h-4 w-4 text-gray-500" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => onDelete(credit)}
                    >
                      <Trash2Icon className="h-4 w-4 text-gray-500" />
                    </Button>
                    {onShowPaymentHistory && (
                      <Button 
                        variant="ghost" 
                        className="h-8 w-8 p-0" 
                        onClick={() => onShowPaymentHistory(credit)}
                        title="Lịch sử thanh toán"
                      >
                        <CalendarIcon className="h-4 w-4 text-gray-500" />
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Mở menu</span>
                          <MoreVertical className="h-4 w-4 text-gray-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onView(credit.id)}>
                          Xem chi tiết
                        </DropdownMenuItem>
                        {onShowPaymentHistory && (
                          <DropdownMenuItem onClick={() => onShowPaymentHistory(credit)}>
                            Lịch sử thanh toán
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onUpdateStatus(credit)}>
                          Cập nhật trạng thái
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(credit)} className="text-red-600">
                          Xóa hợp đồng
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
