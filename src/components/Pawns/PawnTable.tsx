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
import { PawnStatus, PawnWithCustomer } from '@/models/pawn';
import { MoreVertical, DollarSignIcon, UnlockIcon, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getPawnInterestDisplayString } from '@/lib/interest-calculator';
import { reopenContract } from '@/lib/Pawns/reopen_contract';
import { useToast } from '../ui/use-toast';
import { PawnFinancialDetail } from '@/hooks/usePawnCalculation';
// Removed: import { PawnStatusResult } from '@/lib/Pawns/calculate_pawn_status';
import { getPawnStatusInfo } from '@/lib/pawn-status-utils';
import { usePermissions } from '@/hooks/usePermissions';
import { getPawnStatus } from '@/lib/pawn';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface PawnsTableProps {
  pawns: PawnWithCustomer[];
  statusMap?: StatusMapType; // Now optional since we use shared utility
  calculatedDetails?: Record<string, PawnFinancialDetail>;
  calculatedStatuses?: Record<string, {status: string; statusCode: string}>;
  onEdit: (id: string) => void;
  onDelete: (pawn: PawnWithCustomer) => void;
  onUpdateStatus: (pawn: PawnWithCustomer) => void;
  onShowPaymentHistory?: (pawn: PawnWithCustomer) => void;
  onRefresh?: () => void;
  currentPage?: number; // Add pagination props
  itemsPerPage?: number;
  totals?: {
    total_loan_amount: number;
    total_paid_interest: number;
    total_old_debt: number;
    total_interest_today: number;
    collateral_breakdown?: Array<{ name: string; count: number }> | null;
  };
}

export function PawnsTable({ 
  pawns, 
  statusMap,
  calculatedDetails,
  calculatedStatuses,
  onEdit, 
  onDelete,
  onShowPaymentHistory,
  onRefresh,
  currentPage = 1,
  itemsPerPage = 30,
  totals,
}: PawnsTableProps) {
  // Per-row Tài sản: luôn hiện `name (xN)` (qty default 1 nếu thiếu)
  const renderCollateralName = (
    detail: { name?: string | null; quantity?: number | null } | null | undefined
  ): string => {
    if (!detail?.name) return '-';
    const qty = detail.quantity && detail.quantity > 0 ? detail.quantity : 1;
    return `${detail.name} (x${qty})`;
  };
  // Toast hook
  const { toast } = useToast();
  
  // Sử dụng hook kiểm tra quyền
  const { hasPermission } = usePermissions();
  
  // Kiểm tra quyền sửa hợp đồng tín chấp
  const canEditPawn = hasPermission('sua_hop_dong_cam_do');
  
  // Kiểm tra quyền xóa hợp đồng tín chấp
  const canDeletePawn = hasPermission('xoa_hop_dong_cam_do');
  
  // Kiểm tra quyền mở lại hợp đồng cầm đồ
  const canUnlockPawn = hasPermission('huy_dong_hop_dong_cam_do');
  
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

  // Hàm xử lý mở lại hợp đồng cầm đồ
  const handleUnlockPawn = async (pawn: PawnWithCustomer) => {
    try {
      // Call the reopen contract function
      await reopenContract(pawn.id);
      
      // Show success message
      toast({
        title: "Thành công",
        description: "Đã mở lại hợp đồng cầm đồ",
      });
      
      // Refresh the data
      onRefresh?.();
    } catch (error) {
      console.error('Error reopening pawn contract:', error);
      toast({
        title: "Lỗi",
        description: "Không thể mở lại hợp đồng cầm đồ",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="mb-4">
      {/* Desktop Table View (lg and above) */}
      <div className="hidden lg:block rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="border-collapse min-w-full">
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="py-2 px-3 text-center font-medium w-12 border-b border-r border-gray-200">#</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Mã HĐ</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Tên KH</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Tài sản</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Số tiền</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Ngày vay</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Lãi đã đóng</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Nợ cũ</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Lãi phí đến hôm nay</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Ngày đóng</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Trạng thái</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-gray-200">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
        <TableBody className="bg-white divide-y divide-gray-200">
          {pawns.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-gray-500 border-b border-gray-200" colSpan={8}>
                Không tìm thấy hợp đồng nào
              </TableCell>
            </TableRow>
          ) : (
            pawns.map((pawn, index) => (
              <TableRow key={pawn.id} className="hover:bg-gray-50 transition-colors">
                <TableCell className="py-3 px-3 text-gray-500 text-center border-b border-r border-gray-200 hidden lg:table-cell">{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                <TableCell 
                  className="py-3 px-1 lg:px-3 font-medium text-blue-600 cursor-pointer text-center border-b border-r border-gray-200 text-xs lg:text-sm" 
                  onClick={() => handleContractCodeClick(pawn.id)}
                  title={canEditPawn ? 'Nhấn để chỉnh sửa hợp đồng' : 'Bạn không có quyền chỉnh sửa hợp đồng'}
                >
                  {pawn.contract_code || '-'}
                </TableCell>
                <TableCell 
                  className="py-3 px-1 lg:px-3 text-center border-b border-r border-gray-200 text-xs lg:text-sm"
                  title={`Xem hợp đồng của ${pawn.customer?.name}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="truncate max-w-20 lg:max-w-none">{pawn.customer?.name || '-'}</span>
                    {(pawn.customer as any)?.blacklist_reason && (
                      <div title="Khách hàng bị báo xấu">
                        <AlertTriangle className="h-3 w-3 lg:h-4 lg:w-4 text-red-500" />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200 hidden lg:table-cell">
                  {renderCollateralName(pawn.collateral_detail as any)}
                </TableCell>
                <TableCell className="py-3 px-1 lg:px-3 text-center border-b border-r border-gray-200 text-xs lg:text-sm">
                  <div className="flex flex-col items-center">
                    <span className="text-xs lg:text-sm">{formatCurrency(calculatedDetails?.[pawn.id]?.actualLoanAmount ?? pawn.loan_amount)}</span>
                    <div className="text-xs text-red-800 mt-1">
                      {getPawnInterestDisplayString(pawn)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-gray-600 text-center border-b border-r border-gray-200 hidden lg:table-cell">
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
                <TableCell className="py-3 px-1 lg:px-3 text-center border-b border-r border-gray-200 text-xs lg:text-sm">
                  {formatCurrency(calculatedDetails?.[pawn.id]?.paidInterest ?? 0)}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200 hidden lg:table-cell">
                  {formatCurrency(calculatedDetails?.[pawn.id]?.oldDebt ?? 0)}
                </TableCell>
                <TableCell className="py-3 px-3 text-center text-rose-600 font-medium border-b border-r border-gray-200 hidden lg:table-cell">
                  {formatCurrency(calculatedDetails?.[pawn.id]?.interestToday ?? 0)}
                </TableCell>
                <TableCell className="py-3 px-1 lg:px-3 text-center border-b border-r border-gray-200 text-xs lg:text-sm">
                  {/* Ngày phải đóng lãi phí */}
                  {(() => {
                    const det = calculatedDetails?.[pawn.id];
                    if (!det) return '-';
                    if (det.isCompleted) return <span className="text-green-600 font-medium text-xs lg:text-sm">Hoàn thành</span>;
                    if (!det.nextPayment) return '-';
                    const nextDate = new Date(det.nextPayment);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    nextDate.setHours(0,0,0,0);
                    const diff = (nextDate.getTime()-today.getTime())/(24*3600*1000);
                    const cls = diff<0 ? 'text-red-600 font-medium text-xs lg:text-sm' : (diff===0 || diff===1) ? 'text-amber-600 font-medium text-xs lg:text-sm' : 'text-xs lg:text-sm';
                    const label = diff===0 ? 'Hôm nay' : diff===1 ? 'Ngày mai' : formatDate(det.nextPayment);
                    return <span className={cls}>{label}</span>;
                  })()}
                </TableCell>
                <TableCell className="py-3 px-1 lg:px-3 text-center border-b border-r border-gray-200">
                  {/* ----- Status Cell ----- */}
                  {(() => {
                    // Use status_code from pawns_by_store view
                    const statusCode = pawn.status_code || 'ON_TIME';
                    const statusInfo = getPawnStatusInfo(statusCode);
                    
                    return <Badge className={`${statusInfo.color} text-xs lg:text-sm px-1 lg:px-2`}>{statusInfo.label}</Badge>;
                  })()}
                </TableCell>
                <TableCell className="py-3 px-1 lg:px-3 border-b border-r border-gray-200">
                  <div className="flex justify-center">
                    {onShowPaymentHistory && (
                      pawn.status === 'closed' && hasPermission('huy_dong_hop_dong_tin_chap') ? (
                        <>
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-green-700" 
                            onClick={async () => { 
                              try {
                                const status = await getPawnStatus(pawn.id);
                                if (status === PawnStatus.ON_TIME) {
                                  toast({
                                    title: "Lỗi",
                                    description: "Hợp đồng đã được mở lại",
                                  });
                                  return;
                                } else if (status === PawnStatus.DELETED) {
                                  toast({
                                    title: "Lỗi",
                                    description: "Hợp đồng đã bị xóa",
                                  });
                                  return;
                                }
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
        {/* Table end */}
        {totals && (
          <tfoot className="bg-yellow-200 font-semibold">
            <TableRow>
              {/* # column - hidden on mobile */}
              <TableCell className="py-2 px-3 text-center font-bold hidden lg:table-cell">Tổng</TableCell>
              {/* Mã HĐ, Tên KH - visible on mobile */}
              <TableCell className="py-2 px-1 lg:px-3 text-center font-bold lg:hidden" colSpan={2}>Tổng</TableCell>
              <TableCell className="py-2 px-3 text-center font-bold hidden lg:table-cell" colSpan={2}></TableCell>
              {/* Tài sản - hidden on mobile - breakdown by collateral name */}
              <TableCell className="py-2 px-3 hidden lg:table-cell align-top">
                {totals.collateral_breakdown && totals.collateral_breakdown.length > 0 && (
                  <div className="text-xs lg:text-sm space-y-0.5 text-center">
                    {totals.collateral_breakdown.map((item, i) => (
                      <div key={i}>{item.name} (x{item.count})</div>
                    ))}
                  </div>
                )}
              </TableCell>
              {/* Số tiền - visible on mobile */}
              <TableCell className="py-2 px-1 lg:px-3 text-center text-rose-600 font-bold text-xs lg:text-sm">{formatCurrency(totals.total_loan_amount)}</TableCell>
              {/* Ngày vay - hidden on mobile */}
              <TableCell className="py-2 px-3 hidden lg:table-cell" />
              {/* Lãi đã đóng - visible on mobile */}
              <TableCell className="py-2 px-1 lg:px-3 text-center text-rose-600 font-bold text-xs lg:text-sm">{formatCurrency(totals.total_paid_interest)}</TableCell>
              {/* Nợ cũ - hidden on mobile */}
              <TableCell className="py-2 px-3 text-center text-rose-600 font-bold hidden lg:table-cell">{formatCurrency(totals.total_old_debt)}</TableCell>
              {/* Lãi phí đến hôm nay - hidden on mobile */}
              <TableCell className="py-2 px-3 text-center text-rose-600 font-bold hidden lg:table-cell">{formatCurrency(totals.total_interest_today)}</TableCell>
              {/* Ngày đóng, Trạng thái, Thao tác - visible on mobile */}
              <TableCell className="py-2 px-1 lg:px-3" colSpan={3} />
            </TableRow>
          </tfoot>
        )}
        </Table>
      </div>
      </div>

      {/* Mobile/Tablet Card View (below lg) */}
      <div className="lg:hidden space-y-3">
        {pawns.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Không có hợp đồng cầm đồ nào
          </div>
        ) : (
          pawns.map((pawn, index) => {
            const statusInfo = getPawnStatusInfo(pawn.status_code || 'ON_TIME');
            const financialDetail = calculatedDetails?.[pawn.id];

            return (
              <div key={pawn.id} className="bg-white border rounded-lg p-4 shadow-sm">
                {/* Header - Prioritize Customer Name */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-600">#{(currentPage - 1) * itemsPerPage + index + 1}</span>
                    <span 
                      className="font-bold text-lg text-blue-600 cursor-pointer hover:underline" 
                      onClick={() => handleContractCodeClick(pawn.id)}
                      title={canEditPawn ? 'Nhấn để chỉnh sửa hợp đồng' : 'Bạn không có quyền chỉnh sửa hợp đồng'}
                    >
                      {pawn.customer?.name || "N/A"}
                    </span>
                    {(pawn.customer as any)?.blacklist_reason && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <Badge variant="outline" className={statusInfo.color}>
                    {statusInfo.label}
                  </Badge>
                </div>

                {/* Contract Info */}
                <div className="mb-3">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-sm text-gray-500">Mã HĐ:</span>
                    <span className="font-medium text-gray-700">{pawn.contract_code}</span>
                  </div>
                  {pawn.collateral_detail?.name && (
                    <div className="text-sm text-gray-600">
                      Tài sản: {renderCollateralName(pawn.collateral_detail as any)}
                    </div>
                  )}
                </div>

                {/* Financial Info Grid */}
                <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                  <div>
                    <span className="text-gray-600">Số tiền:</span>
                    <div className="font-medium">{formatCurrency(pawn.loan_amount)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Đã đóng:</span>
                    <div className="font-medium text-green-600">
                      {formatCurrency(financialDetail?.paidInterest || 0)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Lãi phí:</span>
                    <div className="font-medium">{getPawnInterestDisplayString(pawn)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Nợ cũ:</span>
                    <div className={`font-medium ${(financialDetail?.oldDebt || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(financialDetail?.oldDebt || 0)}
                    </div>
                  </div>
                </div>

                {/* Due Date and Interest Today */}
                <div className="mb-3 text-sm grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-gray-600">Ngày vay: </span>
                    <span className="font-medium">
                      {pawn.loan_date ? format(new Date(pawn.loan_date), 'dd/MM/yyyy', { locale: vi }) : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Lãi hôm nay: </span>
                    <span className="font-medium text-rose-600">
                      {formatCurrency(financialDetail?.interestToday || 0)}
                    </span>
                  </div>
                </div>

                {/* Next Payment Date */}
                <div className="mb-3 text-sm">
                  <span className="text-gray-600">Ngày phải đóng: </span>
                  {(() => {
                    if (!financialDetail?.nextPayment) return <span className="font-medium text-gray-900">N/A</span>;
                    const nextDate = new Date(financialDetail.nextPayment);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    nextDate.setHours(0,0,0,0);
                    const diff = (nextDate.getTime()-today.getTime())/(24*3600*1000);
                    const label = diff===0 ? 'Hôm nay' : diff===1 ? 'Ngày mai' : formatDate(financialDetail.nextPayment);
                    const cls = diff<0 ? 'font-medium text-red-500' : (diff===0 || diff===1) ? 'font-medium text-amber-500' : 'font-medium text-gray-900';
                    return <span className={cls}>{label}</span>;
                  })()}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex items-center gap-2">
                    {/* Payment History Button */}
                    {onShowPaymentHistory && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => onShowPaymentHistory(pawn)}
                        className="flex items-center gap-1"
                      >
                        <DollarSignIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Thanh toán</span>
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Unlock Button */}
                    {pawn.status === PawnStatus.CLOSED && canUnlockPawn && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleUnlockPawn(pawn)}
                        className="flex items-center gap-1"
                      >
                        <UnlockIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Mở lại</span>
                      </Button>
                    )}
                    
                    {/* More Actions Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <MoreVertical className="h-4 w-4" />
                          <span className="hidden sm:inline">Khác</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEditPawn && (
                          <DropdownMenuItem onClick={() => onEdit(pawn.id)}>
                            Chỉnh sửa
                          </DropdownMenuItem>
                        )}
                        {canDeletePawn && pawn.status !== PawnStatus.CLOSED && (
                          <DropdownMenuItem onClick={() => onDelete(pawn)} className="text-red-600">
                            Xóa hợp đồng
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Totals Card for Mobile */}
        {totals && (
          <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4">
            <h3 className="font-bold text-center mb-3">Tổng kết</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="text-center">
                <div className="text-gray-600">Tổng tiền vay</div>
                <div className="font-bold text-rose-600">{formatCurrency(totals.total_loan_amount)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600">Lãi đã đóng</div>
                <div className="font-bold text-rose-600">{formatCurrency(totals.total_paid_interest)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600">Nợ cũ</div>
                <div className="font-bold text-rose-600">{formatCurrency(totals.total_old_debt)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600">Lãi hôm nay</div>
                <div className="font-bold text-rose-600">{formatCurrency(totals.total_interest_today)}</div>
              </div>
            </div>

            {/* Collateral breakdown */}
            {totals.collateral_breakdown && totals.collateral_breakdown.length > 0 && (
              <div className="mt-3 pt-3 border-t border-yellow-300">
                <div className="text-gray-700 text-sm font-semibold mb-2">Tài sản</div>
                <div className="text-sm space-y-0.5">
                  {totals.collateral_breakdown.map((item, i) => (
                    <div key={i}>{item.name} (x{item.count})</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
