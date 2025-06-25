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
import { PawnWithCustomer } from '@/models/pawn';
import { MoreVertical, DollarSignIcon, UnlockIcon, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getPawnInterestDisplayString } from '@/lib/interest-calculator';
import { reopenContract } from '@/lib/Pawns/reopen_contract';
import { useToast } from '../ui/use-toast';
import { PawnFinancialDetail } from '@/hooks/usePawnCalculation';
import { PawnStatusResult } from '@/lib/Pawns/calculate_pawn_status';
import { usePermissions } from '@/hooks/usePermissions';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface PawnsTableProps {
  pawns: PawnWithCustomer[];
  statusMap: StatusMapType;
  calculatedDetails?: Record<string, PawnFinancialDetail>;
  calculatedStatuses?: Record<string, PawnStatusResult>;
  onEdit: (id: string) => void;
  onDelete: (pawn: PawnWithCustomer) => void;
  onUpdateStatus: (pawn: PawnWithCustomer) => void;
  onShowPaymentHistory?: (pawn: PawnWithCustomer) => void;
  onRefresh?: () => void;
}

export function PawnsTable({ 
  pawns, 
  statusMap,
  calculatedDetails,
  calculatedStatuses,
  onEdit, 
  onDelete,
  onShowPaymentHistory,
  onRefresh
}: PawnsTableProps) {
  // Toast hook
  const { toast } = useToast();
  
  // Sử dụng hook kiểm tra quyền
  const { hasPermission } = usePermissions();
  
  // Kiểm tra quyền sửa hợp đồng tín chấp
  const canEditPawn = hasPermission('sua_hop_dong_cam_do');
  
  // Kiểm tra quyền xóa hợp đồng tín chấp
  const canDeletePawn = hasPermission('xoa_hop_dong_cam_do');
  
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
  const handleContractCodeClick = (pawnId: string) => {
    if (canEditPawn) {
      onEdit(pawnId);
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
          {pawns.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="py-8 text-center text-gray-500 border-b border-gray-200">
                Không tìm thấy hợp đồng nào
              </TableCell>
            </TableRow>
          ) : (
            pawns.map((pawn, index) => (
              <TableRow key={pawn.id} className="hover:bg-gray-50 transition-colors">
                <TableCell className="py-3 px-3 text-gray-500 text-center border-b border-r border-gray-200">{index + 1}</TableCell>
                <TableCell 
                  className="py-3 px-3 font-medium text-blue-600 cursor-pointer text-center border-b border-r border-gray-200" 
                  onClick={() => handleContractCodeClick(pawn.id)}
                  title={canEditPawn ? 'Nhấn để chỉnh sửa hợp đồng' : 'Bạn không có quyền chỉnh sửa hợp đồng'}
                >
                  {pawn.contract_code || '-'}
                </TableCell>
                <TableCell 
                  className="py-3 px-3 text-center border-b border-r border-gray-200"
                  title={`Xem hợp đồng của ${pawn.customer?.name}`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>{pawn.customer?.name || '-'}</span>
                    {(pawn.customer as any)?.blacklist_reason && (
                      <div title="Khách hàng bị báo xấu">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                {pawn.collateral_detail?.name || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    {formatCurrency(calculatedDetails?.[pawn.id]?.actualLoanAmount ?? pawn.loan_amount)}
                    <div className="text-xs text-red-800 mt-1">
                      {getPawnInterestDisplayString(pawn)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-gray-600 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    <span className="text-base">{formatDate(pawn.loan_date)}</span>
                    <div className="text-xs text-gray-400 mt-1">
                      Kỳ lãi: {pawn.interest_period} {
                        pawn.interest_ui_type?.startsWith('weekly') 
                          ? 'ngày (tuần)' 
                          : pawn.interest_ui_type?.startsWith('monthly') 
                            ? 'ngày (tháng)' 
                            : 'ngày'
                      }
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {formatCurrency(calculatedDetails?.[pawn.id]?.paidInterest ?? 0)}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {formatCurrency(calculatedDetails?.[pawn.id]?.oldDebt ?? 0)}
                </TableCell>
                <TableCell className="py-3 px-3 text-center text-rose-600 font-medium border-b border-r border-gray-200">
                  {formatCurrency(calculatedDetails?.[pawn.id]?.interestToday ?? 0)}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {/* Ngày phải đóng lãi phí */}
                  {(() => {
                    const det = calculatedDetails?.[pawn.id];
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
                    const st = calculatedStatuses?.[pawn.id];
                    if (!st) {
                      // Fallback to raw status
                      return <Badge className="bg-gray-100 text-gray-800">{pawn.status === 'closed' ? 'Đã đóng' : 'Đang vay'}</Badge>;
                    }
                    let colorClass = '';
                    switch (st.statusCode) {
                      case 'CLOSED':
                        colorClass = 'bg-blue-100 text-blue-800 border-blue-200';
                        break;
                      case 'DELETED':
                        colorClass = 'bg-gray-100 text-gray-800 border-gray-200';
                        break;
                      case 'OVERDUE':
                        colorClass = 'bg-red-100 text-red-800 border-red-200';
                        break;
                      case 'LATE_INTEREST':
                        colorClass = 'bg-yellow-100 text-yellow-800 border-yellow-200';
                        break;
                      case 'ACTIVE':
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
                      pawn.status === 'closed' && hasPermission('huy_dong_hop_dong_tin_chap') ? (
                        <>
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-green-700" 
                            onClick={async () => { 
                              try {
                                await reopenContract(pawn.id);
                                
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
                      ) : pawn.status === 'deleted' ? (
                        // Hợp đồng đã xóa - chỉ hiển thị nút xem chi tiết
                        <Button 
                          variant="ghost" 
                          className="h-8 w-8 p-0" 
                          onClick={() => onShowPaymentHistory(pawn)}
                          title="Xem chi tiết"
                        >
                          <DollarSignIcon className="h-4 w-4 text-gray-400" />
                        </Button>
                      ) : (
                        <Button 
                          variant="ghost" 
                          className="h-8 w-8 p-0" 
                          onClick={() => onShowPaymentHistory(pawn)}
                          title="Lịch sử thanh toán"
                        >
                          <DollarSignIcon className="h-4 w-4 text-gray-500" />
                        </Button>
                      )
                    )}
                    {/* Hiển thị dropdown menu nếu: hợp đồng đã đóng HOẶC (hợp đồng chưa bị xóa và chưa có kỳ thanh toán đã được thanh toán) */}
                    {(pawn.status === 'closed' || (pawn.status !== 'deleted' && !(calculatedDetails?.[pawn.id]?.hasPaid))) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Mở menu</span>
                            <MoreVertical className="h-4 w-4 text-gray-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {/* Hiển thị "Lịch sử thanh toán" cho hợp đồng đã đóng */}
                          {pawn.status === 'closed' && onShowPaymentHistory && (
                            <DropdownMenuItem onClick={() => onShowPaymentHistory(pawn)}>
                              Lịch sử thanh toán
                            </DropdownMenuItem>
                          )}
                          {/* Hiển thị "Xóa hợp đồng" cho hợp đồng chưa có kỳ thanh toán đã được thanh toán */}
                          {pawn.status !== 'closed' && !calculatedDetails?.[pawn.id]?.hasPaid && canDeletePawn && (
                            <DropdownMenuItem onClick={() => onDelete(pawn)} className="text-red-600">
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
