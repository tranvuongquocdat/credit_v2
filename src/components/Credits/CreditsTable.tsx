import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { CreditWithCustomer } from '@/models/credit';
import { MoreVertical, DollarSignIcon, UnlockIcon, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getInterestDisplayString } from '@/lib/interest-calculator';
import { reopenContract } from '@/lib/Credits/reopen_contract';
import { useToast } from '../ui/use-toast';
import { CreditFinancialDetail } from '@/hooks/useCreditCalculation';
import { CreditStatusResult } from '@/lib/Credits/calculate_credit_status';
import { usePermissions } from '@/hooks/usePermissions';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface CreditsTableProps {
  credits: CreditWithCustomer[];
  statusMap: StatusMapType;
  calculatedDetails?: Record<string, CreditFinancialDetail>;
  calculatedStatuses?: Record<string, CreditStatusResult>;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (credit: CreditWithCustomer) => void;
  onUpdateStatus: (credit: CreditWithCustomer) => void;
  onShowPaymentHistory?: (credit: CreditWithCustomer) => void;
  onRefresh?: () => void;
}

// Kết quả truy vấn từ hàm calculateCreditPayment
interface CreditPaymentInfo {
  paidInterest: number;
  oldDebt: number;
  loading: boolean;
}

// Kết quả truy vấn từ hàm calculateNextPaymentDate
interface NextPaymentInfo {
  nextDate: string | null;
  isCompleted: boolean;
  loading: boolean;
}

// Kết quả truy vấn từ hàm calculateInterestToday
interface InterestTodayInfo {
  interestToday: number;
  loading: boolean;
}

// Thêm interface cho actual loan amount
interface ActualLoanAmountInfo {
  actualAmount: number;
  loading: boolean;
}

export function CreditsTable({ 
  credits, 
  statusMap,
  calculatedDetails,
  calculatedStatuses,
  onEdit, 
  onDelete, 
  onShowPaymentHistory,
  onRefresh
}: CreditsTableProps) {
  // Toast hook
  const { toast } = useToast();
  
  // Sử dụng hook kiểm tra quyền
  const { hasPermission } = usePermissions();
  
  // Kiểm tra quyền sửa hợp đồng tín chấp
  const canEditCredit = hasPermission('sua_hop_dong_tin_chap');
  
  // Kiểm tra quyền xóa hợp đồng tín chấp
  const canDeleteCredit = hasPermission('xoa_hop_dong_tin_chap');
  
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
  
  // Hàm xử lý khi click vào mã hợp đồng
  const handleContractCodeClick = (creditId: string) => {
    if (canEditCredit) {
      onEdit(creditId);
    }
  };

  return (
    <div className="rounded-md border overflow-hidden mb-4">
      <Table className="border-collapse">
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="py-2 px-3 text-center font-medium w-12 border-b border-r border-gray-200">#</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Mã HĐ</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Tên KH</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Tài sản</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Số tiền</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Ngày vay</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Lãi phí đã đóng</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Nợ cũ</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Lãi phí đến hôm nay</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Ngày phải đóng lãi phí</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Tình trạng</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bg-white divide-y divide-gray-200">
          {credits.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="py-8 text-center text-gray-500 border-b border-gray-200">
                Không tìm thấy hợp đồng nào
              </TableCell>
            </TableRow>
          ) : (
            credits.map((credit, index) => (
              <TableRow key={credit.id} className="hover:bg-gray-50 transition-colors">
                <TableCell className="py-3 px-3 text-gray-500 text-center border-b border-r border-gray-200">{index + 1}</TableCell>
                <TableCell 
                  className="py-3 px-3 font-medium text-blue-600 cursor-pointer text-center border-b border-r border-gray-200" 
                  onClick={() => handleContractCodeClick(credit.id)}
                  title={canEditCredit ? 'Nhấn để chỉnh sửa hợp đồng' : 'Bạn không có quyền chỉnh sửa hợp đồng'}
                >
                  {credit.contract_code || '-'}
                </TableCell>
                <TableCell 
                  className="py-3 px-3 text-center border-b border-r border-gray-200"
                  title={`Xem hợp đồng của ${credit.customer?.name}`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>{credit.customer?.name || '-'}</span>
                    {(credit.customer as any)?.blacklist_reason && (
                      <div title="Khách hàng bị báo xấu">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {credit.collateral || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    {formatCurrency(calculatedDetails?.[credit.id]?.actualLoanAmount ?? credit.loan_amount)}
                    <div className="text-xs text-red-800 mt-1">
                      {getInterestDisplayString(credit)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-gray-600 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    <span className="text-base">{formatDate(credit.loan_date)}</span>
                    <div className="text-xs text-gray-400 mt-1">
                      Kỳ lãi: {credit.interest_period} {
                        credit.interest_ui_type?.startsWith('weekly') 
                          ? 'ngày (tuần)' 
                          : credit.interest_ui_type?.startsWith('monthly') 
                            ? 'ngày (tháng)' 
                            : 'ngày'
                      }
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {formatCurrency(calculatedDetails?.[credit.id]?.paidInterest ?? 0)}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {formatCurrency(calculatedDetails?.[credit.id]?.oldDebt ?? 0)}
                </TableCell>
                <TableCell className="py-3 px-3 text-center text-rose-600 font-medium border-b border-r border-gray-200">
                  {formatCurrency(calculatedDetails?.[credit.id]?.interestToday ?? 0)}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {/* Ngày phải đóng lãi phí */}
                  {(() => {
                    const det = calculatedDetails?.[credit.id];
                    if (!det) return '-';
                    if (det.isCompleted) return <span className="text-green-600 font-medium">Hoàn thành</span>;
                    if (!det.nextPayment) return '-';
                    const nextDate = new Date(det.nextPayment);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    nextDate.setHours(0,0,0,0);
                    const diff = (nextDate.getTime()-today.getTime())/(24*3600*1000);
                    const cls = diff<0 ? 'text-red-600 font-medium' : diff===0 ? 'text-amber-600 font-medium' : '';
                    return <span className={cls}>{formatDate(det.nextPayment)}</span>;
                  })()}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {/* ----- Status Cell ----- */}
                  {(() => {
                    const st = calculatedStatuses?.[credit.id];
                    if (!st) {
                      // Fallback to raw status
                      return <Badge className="bg-gray-100 text-gray-800">{credit.status === 'closed' ? 'Đã đóng' : 'Đang vay'}</Badge>;
                    }
                    let colorClass = '';
                    switch (st.statusCode) {
                      case 'CLOSED':
                        colorClass = 'bg-blue-100 text-blue-800 border-blue-200';
                        break;
                      case 'DELETED':
                        colorClass = 'bg-gray-100 text-gray-800 border-gray-200';
                        break;
                      case 'FINISHED':
                        colorClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                        break;
                      case 'BAD_DEBT':
                        colorClass = 'bg-purple-100 text-purple-800 border-purple-200';
                        break;
                      case 'OVERDUE':
                        colorClass = 'bg-red-100 text-red-800 border-red-200';
                        break;
                      case 'LATE_INTEREST':
                        colorClass = 'bg-yellow-100 text-yellow-800 border-yellow-200';
                        break;
                      case 'ON_TIME':
                      default:
                        colorClass = 'bg-green-100 text-green-800 border-green-200';
                        break;
                    }
                    const labelText = st.status && st.status.trim() !== ''
                      ? st.status
                      : statusMap[st.statusCode.toLowerCase()]?.label || st.statusCode;
                    return <Badge className={colorClass}>{labelText}</Badge>;
                  })()}
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                  <div className="flex justify-center">
                    {onShowPaymentHistory && (
                      credit.status === 'closed' && hasPermission('huy_dong_hop_dong_tin_chap') ? (
                        <>
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-green-700" 
                            onClick={async () => { 
                              try {
                                await reopenContract(credit.id);
                                
                                // Show success toast
                                toast({
                                  title: "Thành công",
                                  description: "Đã mở lại hợp đồng thành công",
                                  variant: "default",
                                });
                                
                                // Refresh the page
                                if (onRefresh) onRefresh();
                              } catch (error) {
                                console.error('Error reopening contract:', error);
                                
                                // Show error toast
                                toast({
                                  title: "Lỗi",
                                  description: error instanceof Error ? error.message : "Có lỗi xảy ra khi mở lại hợp đồng",
                                  variant: "destructive",
                                });
                              }
                            }}
                            title="Mở lại hợp đồng"
                          >
                            <UnlockIcon className="h-4 w-4 text-amber-500" />
                          </Button>
                        </>
                      ) : credit.status === 'deleted' ? (
                        // Hợp đồng đã xóa - chỉ hiển thị nút xem chi tiết
                        <Button 
                          variant="ghost" 
                          className="h-8 w-8 p-0" 
                          onClick={() => onShowPaymentHistory(credit)}
                          title="Xem chi tiết"
                        >
                          <DollarSignIcon className="h-4 w-4 text-gray-400" />
                        </Button>
                      ) : (
                        <Button 
                          variant="ghost" 
                          className="h-8 w-8 p-0" 
                          onClick={() => onShowPaymentHistory(credit)}
                          title="Lịch sử thanh toán"
                        >
                          <DollarSignIcon className="h-4 w-4 text-gray-500" />
                        </Button>
                      )
                    )}
                    {/* Hiển thị dropdown menu nếu: hợp đồng đã đóng HOẶC (hợp đồng chưa bị xóa và chưa có kỳ thanh toán đã được thanh toán) */}
                    {(credit.status === 'closed' || (credit.status !== 'deleted' && !(calculatedDetails?.[credit.id]?.hasPaid))) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Mở menu</span>
                            <MoreVertical className="h-4 w-4 text-gray-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {/* Hiển thị "Lịch sử thanh toán" cho hợp đồng đã đóng */}
                          {credit.status === 'closed' && onShowPaymentHistory && (
                            <DropdownMenuItem onClick={() => onShowPaymentHistory(credit)}>
                              Lịch sử thanh toán
                            </DropdownMenuItem>
                          )}
                          {/* Hiển thị "Xóa hợp đồng" cho hợp đồng chưa có kỳ thanh toán đã được thanh toán */}
                          {credit.status !== 'closed' && !calculatedDetails?.[credit.id]?.hasPaid && hasPermission('xoa_hop_dong_tin_chap') && (
                            <DropdownMenuItem onClick={() => onDelete(credit)} className="text-red-600">
                              Xóa hợp đồng
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
