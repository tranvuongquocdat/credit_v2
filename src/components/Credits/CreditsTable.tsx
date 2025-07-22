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
import { CreditStatus, CreditWithCustomer } from '@/models/credit';
import { MoreVertical, DollarSignIcon, UnlockIcon, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getInterestDisplayString } from '@/lib/interest-calculator';
import { reopenContract } from '@/lib/Credits/reopen_contract';
import { useToast } from '../ui/use-toast';
import { CreditFinancialDetail } from '@/hooks/useCreditCalculation';
import { getCreditStatusInfo } from '@/lib/credit-status-utils';
import { usePermissions } from '@/hooks/usePermissions';
import { getCreditStatus } from '@/lib/credit';
import { useState, useEffect } from 'react';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface CreditsTableProps {
  credits: CreditWithCustomer[];
  statusMap?: StatusMapType; // Now optional since we use shared utility
  calculatedDetails?: Record<string, CreditFinancialDetail>;
  calculatedStatuses?: Record<string, any>; // Legacy, no longer used
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (credit: CreditWithCustomer) => void;
  onUpdateStatus: (credit: CreditWithCustomer) => void;
  onShowPaymentHistory?: (credit: CreditWithCustomer) => void;
  onRefresh?: () => void;
  totals?: {
    total_loan_amount: number;
    total_paid_interest: number;
    total_old_debt: number;
    total_interest_today: number;
  };
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
  calculatedStatuses, // Legacy, no longer used
  onEdit, 
  onDelete, 
  onShowPaymentHistory,
  onRefresh,
  totals,
}: CreditsTableProps) {
  // Toast hook
  const { toast } = useToast();
  
  // Sử dụng hook kiểm tra quyền
  const { hasPermission } = usePermissions();
  
  // Kiểm tra quyền sửa hợp đồng tín chấp
  const canEditCredit = hasPermission('sua_hop_dong_tin_chap');
  
  // Kiểm tra quyền xóa hợp đồng tín chấp
  const canDeleteCredit = hasPermission('xoa_hop_dong_tin_chap');
  
  // Kiểm tra quyền mở lại hợp đồng tín chấp
  const canUnlockCredit = hasPermission('huy_dong_hop_dong_tin_chap');
  
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

  // Hàm xử lý mở lại hợp đồng tín chấp
  const handleUnlockCredit = async (credit: CreditWithCustomer) => {
    try {
      // Call the reopen contract function
      await reopenContract(credit.id);
      
      // Show success message
      toast({
        title: "Thành công",
        description: "Đã mở lại hợp đồng tín chấp",
      });
      
      // Refresh the data
      onRefresh?.();
    } catch (error) {
      console.error('Error reopening credit contract:', error);
      toast({
        title: "Lỗi",
        description: "Không thể mở lại hợp đồng tín chấp",
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
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Lãi phí đã đóng</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Nợ cũ</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Lãi phí đến hôm nay</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Ngày phải đóng lãi phí</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Trạng thái</TableHead>
                <TableHead className="py-2 px-3 text-center font-medium border-b border-gray-200">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
        <TableBody className="bg-white divide-y divide-gray-200">
          {credits.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-gray-500 border-b border-gray-200" colSpan={8}>
                Không tìm thấy hợp đồng nào
              </TableCell>
            </TableRow>
          ) : (
            credits.map((credit, index) => (
              <TableRow key={credit.id} className="hover:bg-gray-50 transition-colors">
                <TableCell className="py-3 px-3 text-gray-500 text-center border-b border-r border-gray-200 hidden lg:table-cell">{index + 1}</TableCell>
                <TableCell 
                  className="py-3 px-1 lg:px-3 font-medium text-blue-600 cursor-pointer text-center border-b border-r border-gray-200 text-xs lg:text-sm" 
                  onClick={() => handleContractCodeClick(credit.id)}
                  title={canEditCredit ? 'Nhấn để chỉnh sửa hợp đồng' : 'Bạn không có quyền chỉnh sửa hợp đồng'}
                >
                  {credit.contract_code || '-'}
                </TableCell>
                <TableCell 
                  className="py-3 px-1 lg:px-3 text-center border-b border-r border-gray-200 text-xs lg:text-sm"
                  title={`Xem hợp đồng của ${credit.customer?.name}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="truncate max-w-20 lg:max-w-none">{credit.customer?.name || '-'}</span>
                    {(credit.customer as any)?.blacklist_reason && (
                      <div title="Khách hàng bị báo xấu">
                        <AlertTriangle className="h-3 w-3 lg:h-4 lg:w-4 text-red-500" />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200 hidden lg:table-cell">
                  {credit.collateral || '-'}
                </TableCell>
                <TableCell className="py-3 px-1 lg:px-3 text-center border-b border-r border-gray-200 text-xs lg:text-sm">
                  <div className="flex flex-col items-center">
                    <span className="text-xs lg:text-sm">{formatCurrency(calculatedDetails?.[credit.id]?.actualLoanAmount ?? credit.loan_amount)}</span>
                    <div className="text-xs text-red-800 mt-1">
                      {getInterestDisplayString(credit)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-gray-600 text-center border-b border-r border-gray-200 hidden lg:table-cell">
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
                <TableCell className="py-3 px-1 lg:px-3 text-center border-b border-r border-gray-200 text-xs lg:text-sm">
                  {(() => {
                    const paidValue = calculatedDetails?.[credit.id]?.paidInterest ?? 0;
                    const latestPaid = calculatedDetails?.[credit.id]?.latestPaidDate;
                    let daysPaid: number | null = null;
                    if (latestPaid) {
                      const start = new Date(credit.loan_date);
                      const end   = new Date(latestPaid);
                      start.setHours(0,0,0,0);
                      end.setHours(0,0,0,0);
                      const diff = Math.floor((end.getTime() - start.getTime()) / (24*3600*1000)) + 1;
                      daysPaid = diff > 0 ? diff : 0;
                    }
                    return (
                      <div className="flex flex-col items-center">
                        <span className="text-xs lg:text-sm">{formatCurrency(paidValue)}</span>
                        {daysPaid !== null && (
                          <span className="text-xs text-gray-400">{daysPaid} ngày</span>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200 hidden lg:table-cell">
                  {formatCurrency(calculatedDetails?.[credit.id]?.oldDebt ?? 0)}
                </TableCell>
                <TableCell className="py-3 px-3 text-center text-rose-600 font-medium border-b border-r border-gray-200 hidden lg:table-cell">
                  {(() => {
                    const todayValue = calculatedDetails?.[credit.id]?.interestToday ?? 0;
                    const latestPaid = calculatedDetails?.[credit.id]?.latestPaidDate;
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    let startRef: Date;
                    if (latestPaid) {
                      startRef = new Date(latestPaid);
                    } else {
                      startRef = new Date(credit.loan_date);
                    }
                    startRef.setHours(0,0,0,0);
                    const diff = Math.floor((today.getTime() - startRef.getTime()) / (24*3600*1000));

                    const daysSince = diff > 0 ? diff : 0;

                    return (
                      <div className="flex flex-col items-center text-rose-600">
                        <span>{formatCurrency(todayValue)}</span>
                        <span className="text-xs text-gray-400">{daysSince} ngày</span>
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell className="py-3 px-1 lg:px-3 text-center border-b border-r border-gray-200 text-xs lg:text-sm">
                  {/* Ngày phải đóng lãi phí */}
                  {(() => {
                    const det = calculatedDetails?.[credit.id];
                    if (!det) return '-';
                    if (det.isCompleted) return <span className="text-green-600 font-medium text-xs lg:text-sm">Hoàn thành</span>;
                    if (!det.nextPayment) return '-';
                    const nextDate = new Date(det.nextPayment);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    nextDate.setHours(0,0,0,0);
                    const diff = (nextDate.getTime()-today.getTime())/(24*3600*1000);
                    const cls = diff<0 ? 'text-red-600 font-medium text-xs lg:text-sm' : diff===0 ? 'text-amber-600 font-medium text-xs lg:text-sm' : 'text-xs lg:text-sm';
                    return <span className={cls}>{formatDate(det.nextPayment)}</span>;
                  })()}
                </TableCell>
                <TableCell className="py-3 px-1 lg:px-3 text-center border-b border-r border-gray-200">
                  {/* ----- Status Cell ----- */}
                  {(() => {
                    // Use status_code from credits_by_store view
                    const statusCode = credit.status_code || 'ON_TIME';
                    const statusInfo = getCreditStatusInfo(statusCode);
                    
                    return <Badge className={`${statusInfo.color} text-xs lg:text-sm px-1 lg:px-2`}>{statusInfo.label}</Badge>;
                  })()}
                </TableCell>
                <TableCell className="py-3 px-1 lg:px-3 border-b border-r border-gray-200">
                  <div className="flex justify-center">
                    {onShowPaymentHistory && (
                      credit.status === 'closed' && hasPermission('huy_dong_hop_dong_tin_chap') ? (
                        <>
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-green-700" 
                            onClick={async () => { 
                              try {
                                const status = await getCreditStatus(credit.id);
                                if (status === CreditStatus.ON_TIME) {
                                  toast({
                                    title: "Lỗi",
                                    description: "Hợp đồng đã được mở lại",
                                  });
                                  return;
                                } else if (status === CreditStatus.DELETED) {
                                  toast({
                                    title: "Lỗi",
                                    description: "Hợp đồng đã bị xóa",
                                  });
                                  return;
                                }
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
        {totals && (
          <tfoot className="bg-yellow-200 font-semibold">
            <TableRow>
              {/* # column - hidden on mobile */}
              <TableCell className="py-2 px-3 text-center font-bold hidden lg:table-cell">Tổng</TableCell>
              {/* Mã HĐ, Tên KH - visible on mobile */}
              <TableCell className="py-2 px-1 lg:px-3 text-center font-bold lg:hidden" colSpan={2}>Tổng</TableCell>
              <TableCell className="py-2 px-3 text-center font-bold hidden lg:table-cell" colSpan={2}></TableCell>
              {/* Tài sản - hidden on mobile */}
              <TableCell className="py-2 px-3 hidden lg:table-cell"></TableCell>
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
        {credits.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Không có hợp đồng tín chấp nào
          </div>
        ) : (
          credits.map((credit, index) => {
            const statusInfo = getCreditStatusInfo(credit.status_code ||  'ON_TIME');
            const financialDetail = calculatedDetails?.[credit.id];

            return (
              <div key={credit.id} className="bg-white border rounded-lg p-4 shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-600">#{index + 1}</span>
                    <span className="font-bold text-blue-600">{credit.contract_code}</span>
                  </div>
                  <Badge variant="outline" className={statusInfo.color}>
                    {statusInfo.label}
                  </Badge>
                </div>

                {/* Customer Info */}
                <div className="mb-3">
                  <div className="flex items-center gap-1 mb-1">
                    <span 
                      className="font-medium text-blue-600 cursor-pointer hover:underline" 
                      onClick={() => handleContractCodeClick(credit.id)}
                      title={canEditCredit ? 'Nhấn để chỉnh sửa hợp đồng' : 'Bạn không có quyền chỉnh sửa hợp đồng'}
                    >
                      {credit.customer?.name || "N/A"}
                    </span>
                    {(credit.customer as any)?.blacklist_reason && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  {credit.collateral && (
                    <div className="text-sm text-gray-600">
                      Tài sản: {credit.collateral}
                    </div>
                  )}
                </div>

                {/* Financial Info Grid */}
                <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                  <div>
                    <span className="text-gray-600">Số tiền:</span>
                    <div className="font-medium">{formatCurrency(credit.loan_amount)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Đã đóng:</span>
                    <div className="font-medium text-green-600">
                      {formatCurrency(financialDetail?.paidInterest || 0)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Lãi phí:</span>
                    <div className="font-medium">{getInterestDisplayString(credit)}</div>
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
                      {credit.loan_date ? format(new Date(credit.loan_date), 'dd/MM/yyyy', { locale: vi }) : 'N/A'}
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
                  <span className="text-gray-600">Ngày phải đóng lãi phí: </span>
                  <span className={`font-medium ${
                    financialDetail?.nextPayment === 'Hôm nay' ? 'text-amber-500' :
                    financialDetail?.nextPayment === 'Quá hạn' ? 'text-red-500' : 
                    'text-gray-900'
                  }`}>
                    {formatDate(financialDetail?.nextPayment) || 'N/A'}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex items-center gap-2">
                    {/* Payment History Button */}
                    {onShowPaymentHistory && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => onShowPaymentHistory(credit)}
                        className="flex items-center gap-1"
                      >
                        <DollarSignIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Thanh toán</span>
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Unlock Button */}
                    {credit.status === CreditStatus.CLOSED && canUnlockCredit && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleUnlockCredit(credit)}
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
                        {canEditCredit && (
                          <DropdownMenuItem onClick={() => onEdit(credit.id)}>
                            Chỉnh sửa
                          </DropdownMenuItem>
                        )}
                        {canDeleteCredit && credit.status !== CreditStatus.CLOSED && (
                          <DropdownMenuItem onClick={() => onDelete(credit)} className="text-red-600">
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
          </div>
        )}
      </div>
    </div>
  );
}
