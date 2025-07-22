import { InstallmentWithCustomer, InstallmentStatus } from "@/models/installment";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MoreVerticalIcon, TrashIcon, AlertTriangleIcon, CalendarIcon, DollarSignIcon, UnlockIcon, CalendarDaysIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { useEffect, useState, useCallback } from "react";
import { updateInstallmentStatus } from "@/lib/installmentPayment";
import { getInstallmentStatus, updateInstallmentPaymentDueDate } from "@/lib/installment";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/components/ui/use-toast";
import { 
  calculateDailyAmount,
  calculateRatio
} from "@/lib/installmentCalculations";
import { supabase } from "@/lib/supabase";
import { recordContractReopening } from "@/lib/installmentAmountHistory";
import { usePermissions } from '@/hooks/usePermissions';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow
} from '@/components/ui/table';
// Define status info interface
interface StatusInfo {
  label: string;
  color: string;
}

// Define installment with status info
interface InstallmentWithStatusInfo extends InstallmentWithCustomer {
  statusInfo?: StatusInfo;
  totalPaid?: number;
  remainingToPay?: number;
  oldDebt?: number;
  nextPaymentDate?: string | null;
  isDueToday?: boolean;
  overdueDays?: number;
}

interface InstallmentsTableProps {
  installments: InstallmentWithStatusInfo[];
  statusMap: Record<string, { label: string; color: string }>;
  isLoading: boolean;
  onEdit: (id: string) => void;
  onUpdateStatus: (installment: InstallmentWithStatusInfo) => void;
  onDelete: (installment: InstallmentWithStatusInfo) => void;
  onShowPaymentHistory?: (installment: InstallmentWithStatusInfo) => void;
  onShowPaymentActions?: (installment: InstallmentWithStatusInfo) => void;
  onRefresh?: () => void;
  totals?: {
    total_amount_given: number;
    total_paid: number;
    total_debt: number;
    total_daily_amount: number;
    total_remaining: number;
  };
}

export function InstallmentsTable({
  installments,
  isLoading,
  onEdit,
  onDelete,
  onShowPaymentHistory,
  onShowPaymentActions,
  onRefresh,
  totals,
}: InstallmentsTableProps) {
  // State để lưu trữ thông tin có kỳ thanh toán đã được thanh toán hay không cho mỗi installment
  const [hasPaidPaymentPeriods, setHasPaidPaymentPeriods] = useState<Record<string, boolean>>({});
  
  // State for unlock confirmation dialog
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);
  const [installmentToUnlock, setInstallmentToUnlock] = useState<InstallmentWithStatusInfo | null>(null);
  
  // State for payment due date update
  const [selectedDateInstallmentId, setSelectedDateInstallmentId] = useState<string | null>(null);
  const [isUpdatingDueDate, setIsUpdatingDueDate] = useState(false);
  
  // Get current store and toast
  const { currentStore } = useStore();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  // Kiểm tra quyền xóa hợp đồng trả góp
  const canDeleteInstallment = hasPermission('xoa_hop_dong_tra_gop');
  // Kiểm tra quyền sửa hợp đồng trả góp
  const canEditInstallment = hasPermission('sua_hop_dong_tra_gop');
  // Kiểm tra quyền mở lại hợp đồng trả góp
  const canUnlockInstallment = hasPermission('huy_dong_hop_dong_tra_gop');
  // Hàm kiểm tra xem installment có kỳ thanh toán nào đã được thanh toán không
  const checkHasPaidPaymentPeriods = useCallback(async (installmentId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('installment_history')
        .select('id')
        .eq('installment_id', installmentId)
        .eq('transaction_type', 'payment')
        .eq('is_deleted', false)
        .limit(1);
      
      if (error) {
        console.error('Error checking paid payment periods:', error);
        return false;
      }
      
      return data && data.length > 0;
    } catch (error) {
      console.error('Error in checkHasPaidPaymentPeriods:', error);
      return false;
    }
  }, []);

  // Check if installments have paid periods when list changes
  useEffect(() => {
    const loadPaymentPeriodsInfo = async () => {
      const newHasPaidPaymentPeriodsInfo: Record<string, boolean> = {};

      const results = await Promise.all(
        installments.map(async (installment) => {
          const hasPaidPayments = await checkHasPaidPaymentPeriods(installment.id);
          return { installmentId: installment.id, hasPaidPayments };
        })
      );

      results.forEach(({ installmentId, hasPaidPayments }) => {
        newHasPaidPaymentPeriodsInfo[installmentId] = hasPaidPayments;
      });

      setHasPaidPaymentPeriods(newHasPaidPaymentPeriodsInfo);
    };

    if (installments.length > 0) {
      loadPaymentPeriodsInfo();
    }
  }, [installments, checkHasPaidPaymentPeriods]);

  // Show confirmation dialog before unlocking
  const confirmUnlockInstallment = (installment: InstallmentWithStatusInfo) => {
    setInstallmentToUnlock(installment);
    setUnlockConfirmOpen(true);
  };

  // Add function to handle unlocking a closed installment
  const handleUnlockInstallment = async (installment: InstallmentWithStatusInfo) => {
    // Close the dialog
    setUnlockConfirmOpen(false);
    
    try {
      // If the installment is already open, throw error
      const status = await getInstallmentStatus(installment.id);
      if (status === InstallmentStatus.ON_TIME) {
        toast({
          title: "Lỗi", 
          description: "Hợp đồng đã được mở lại",
        });
        onRefresh?.();
        return;
      }
      // Since updateInstallmentStatus doesn't support storeId parameter, we'll rely on the 
      // implementation to handle the store context if needed
      const { error } = await updateInstallmentStatus(
        installment.id, 
        InstallmentStatus.ON_TIME
      );

      // Ghi lịch sử mở lại hợp đồng
      await recordContractReopening(installment.id);
      
      if (error) {
        console.error("Error unlocking installment:", error);
        return;
      }
      // Show success toast
      toast({
        title: "Thành công",
        description: "Đã mở lại hợp đồng",
      });
      onRefresh?.();
      // TODO: trigger parent refresh via a callback if needed
    } catch (err) {
      console.error("Error unlocking installment:", err);
    }
  };

  // Function to handle payment due date update
  const handlePaymentDueDateUpdate = async (installmentId: string, date: Date) => {
    setIsUpdatingDueDate(true);
    try {
      // Format date as ISO string (YYYY-MM-DD)
      const formattedDate = format(date, 'yyyy-MM-dd');
      
      // Call API to update payment due date
      const { error } = await updateInstallmentPaymentDueDate(installmentId, formattedDate);
      
      if (error) {
        throw error;
      }
      
      // Show success toast
      toast({
        title: "Thành công",
        description: "Đã cập nhật ngày đóng tiền",
      });
      onRefresh?.();
      // TODO: trigger parent refresh via a callback if needed
    } catch (error) {
      console.error('Error updating payment due date:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật ngày đóng tiền",
        variant: "destructive"
      });
    } finally {
      setIsUpdatingDueDate(false);
      setSelectedDateInstallmentId(null);
    }
  };

  const handleContractCodeClick = (installmentId: string) => {
    if (canEditInstallment) {
      onEdit(installmentId);
    }
  };

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (installments.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500">
        <AlertTriangleIcon size={40} className="mb-2 text-amber-500" />
        <p className="text-lg font-medium">Không tìm thấy hợp đồng nào{currentStore ? ` tại ${currentStore.name}` : ''}</p>
        <p className="text-sm">Vui lòng thử lại với bộ lọc khác hoặc tạo hợp đồng mới.</p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {/* Desktop Table View (lg and above) */}
      <div className="hidden lg:block rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="border-collapse min-w-full">
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-10">#</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-24">Mã HĐ</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-36">Tên KH</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-28">Tiền giao khách</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-16">Tỷ lệ</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-20">Thời gian</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-28">Tiền đã đóng</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-24">Nợ</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-24">Tiền 1 ngày</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-28">Còn phải đóng</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-28">Tình trạng</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm border-r border-gray-200 w-28">Ngày phải đóng</TableHead>
                <TableHead className="py-3 px-3 text-center font-medium text-sm w-32">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="bg-white divide-y divide-gray-200">
              {installments.map((installment, index) => {
                const statusInfo = installment.statusInfo ?? {
                  label: "Không xác định",
                  color: "bg-gray-100 text-gray-800",
                };

                return (
                  <TableRow 
                    key={installment.id} 
                    className="hover:bg-gray-50 transition-colors text-sm"
                  >
                    <TableCell className="py-3 px-3 border-r border-gray-200 text-center">{index + 1}</TableCell>
                    <TableCell className="py-3 px-3 border-r border-gray-200 font-medium text-center">
                      <span>
                        {installment.contract_code}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 border-r border-gray-200 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span 
                          className="text-blue-600 cursor-pointer hover:underline" 
                          onClick={() => handleContractCodeClick(installment.id)}
                          title={canEditInstallment ? 'Nhấn để chỉnh sửa hợp đồng' : 'Bạn không có quyền chỉnh sửa hợp đồng'}
                        >
                          {installment.customer?.name || "N/A"}
                        </span>
                        {(installment.customer as any)?.blacklist_reason && (
                          <div className="relative group">
                            <AlertTriangleIcon className="h-4 w-4 text-red-500" />
                            <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                              Khách hàng bị báo xấu
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-3 border-r border-gray-200 text-center">
                      {formatCurrency(installment.amount_given)}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-r border-gray-200 text-center">
                      {calculateRatio(installment)}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-r border-gray-200 text-center">
                  {(() => {
                    // Calculate end date based on start date and duration
                    try {
                      const startDate = new Date(installment.start_date);
                      const endDate = new Date(startDate);
                      endDate.setDate(startDate.getDate() + installment.duration - 1);
                      
                      // Format dates in Vietnamese format
                      const formatDate = (date: Date) => {
                        // Format as DD/MM (Day/Month) without year
                        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                      };
                      
                      return (
                        <div className="flex flex-col items-center min-w-[100px]">
                          <span className="text-sm text-gray-600">
                            {formatDate(startDate)} → {formatDate(endDate)}
                          </span>
                          <span className="font-medium mt-1 text-sm">
                            ({installment.duration} ngày)
                          </span>
                        </div>
                      );
                    } catch (error) {
                      // Fallback if date calculation fails
                      return `${installment.duration} ngày`;
                    }
                  })()}
                </TableCell>
                <TableCell className="py-3 px-3 border-r border-gray-200 text-center">
                  {(() => {
                    const paidAmount = installment.totalPaid ?? 0;
                    const paymentPeriod = installment.payment_period || 10; // Default 10 days per period
                    let paidPeriods: number | null = null;
                    
                    // Try to use latest payment date if available (similar to credits system)
                    const latestPaymentDate = installment.latest_payment_date;
                    if (latestPaymentDate && installment.start_date) {
                      const startDate = new Date(installment.start_date);
                      const latestPaidDate = new Date(latestPaymentDate);
                      startDate.setHours(0, 0, 0, 0);
                      latestPaidDate.setHours(0, 0, 0, 0);
                      
                      // Calculate days paid from start date to latest payment date
                      const daysPaid = Math.floor((latestPaidDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000)) + 1;
                      if (daysPaid > 0) {
                        paidPeriods = Math.floor(daysPaid / paymentPeriod);
                      }
                    }
                    
                    return (
                      <div className="flex flex-col items-center">
                        <span>{formatCurrency(paidAmount)}</span>
                        {paidPeriods !== null && paidPeriods > 0 && (
                          <span className="text-xs text-gray-400">{paidPeriods} kỳ</span>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>
                    <TableCell className="py-3 px-3 border-r border-gray-200 text-center">
                      <span className={installment.debt_amount && installment.debt_amount > 0 ? 'text-red-600' : 'text-green-600'}>
                        {formatCurrency(installment.debt_amount || 0)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 border-r border-gray-200 text-center">
                      {formatCurrency(calculateDailyAmount(installment))}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-r border-gray-200 text-center">
                  {(() => {
                    const remainingAmount = installment.remainingToPay ?? 0;
                    const paymentPeriod = installment.payment_period || 10; // Default 10 days per period
                    let remainingPeriods: number | null = null;
                    
                    // Calculate remaining periods based on contract duration and paid periods
                    const totalPeriods = Math.ceil(installment.duration / paymentPeriod);
                    
                    // Try to use latest payment date if available (similar to credits system)
                    const latestPaymentDate = installment.latest_payment_date;
                    if (latestPaymentDate && installment.start_date) {
                      const startDate = new Date(installment.start_date);
                      const latestPaidDate = new Date(latestPaymentDate);
                      startDate.setHours(0, 0, 0, 0);
                      latestPaidDate.setHours(0, 0, 0, 0);
                      
                      // Calculate days paid from start date to latest payment date
                      const daysPaid = Math.floor((latestPaidDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000)) + 1;
                      if (daysPaid > 0) {
                        const paidPeriods = Math.floor(daysPaid / paymentPeriod);
                        remainingPeriods = Math.max(0, totalPeriods - paidPeriods);
                      }
                    } else {
                      // Fallback: calculate based on remaining amount if no payment date available
                      const dailyAmount = calculateDailyAmount(installment);
                      if (remainingAmount > 0 && dailyAmount > 0) {
                        const remainingDays = Math.ceil(remainingAmount / dailyAmount);
                        remainingPeriods = Math.ceil(remainingDays / paymentPeriod);
                      }
                    }
                    
                    return (
                      <div className="flex flex-col items-center">
                        <span>{formatCurrency(remainingAmount)}</span>
                        {remainingPeriods !== null && remainingPeriods > 0 && (
                          <span className="text-xs text-gray-400">{remainingPeriods} kỳ</span>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell className="py-3 px-3 border-r border-gray-200 text-center">
                  <Badge
                    variant="outline"
                    className={statusInfo.color}
                  >
                    {statusInfo.label}
                  </Badge>
                </TableCell>
                <TableCell className="py-3 px-3 border-r border-gray-200 text-center hidden md:table-cell">
                  {installment.status === InstallmentStatus.CLOSED || 
                   installment.nextPaymentDate == "Hoàn thành" || 
                   !installment.payment_due_date ? (
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-green-600 font-medium">
                        Hoàn thành
                      </span>
                    </div>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="ghost" 
                          className={`flex items-center justify-center gap-1 h-8 w-full ${
                            installment.overdueDays ? 'text-red-500 font-medium' : 
                            installment.isDueToday ? 'text-amber-500 font-medium' : 
                            installment.nextPaymentDate === "Ngày mai" ? 'text-blue-500 font-medium' : ''
                          }`}
                          disabled={isUpdatingDueDate || !installment.payment_due_date || !canEditInstallment}
                          onClick={() => setSelectedDateInstallmentId(installment.id)}
                          title={canEditInstallment ? 'Nhấn để thay đổi ngày đóng tiền' : 'Bạn không có quyền thay đổi ngày đóng tiền'}
                        >
                          {isUpdatingDueDate && selectedDateInstallmentId === installment.id ? (
                            <Spinner size="sm" className="mr-1" />
                          ) : (
                            <CalendarDaysIcon className="h-4 w-4 mr-1" />
                          )}
                    {(() => {
                      // Chỉ hiển thị dựa trên payment_due_date
                      if (!installment.payment_due_date) {
                        return (
                          <span className="text-green-600 font-medium">
                            Hoàn thành
                          </span>
                        );
                      }
                      
                      // Convert date để hiển thị
                      const dueDateObj = new Date(installment.payment_due_date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      
                      // So sánh ngày chuẩn xác
                      const isSameDay = (date1: Date, date2: Date) => {
                        return date1.getDate() === date2.getDate() &&
                               date1.getMonth() === date2.getMonth() &&
                               date1.getFullYear() === date2.getFullYear();
                      };
                      
                      if (isSameDay(today, dueDateObj)) {
                        return "Hôm nay";
                      }
                      
                      // Kiểm tra ngày mai
                      const tomorrow = new Date(today);
                      tomorrow.setDate(today.getDate() + 1);
                      
                      if (isSameDay(tomorrow, dueDateObj)) {
                        return "Ngày mai";
                      }
                      
                      // Format ngày tháng
                      const day = dueDateObj.getDate().toString().padStart(2, '0');
                      const month = (dueDateObj.getMonth() + 1).toString().padStart(2, '0');
                      return `${day}/${month}`;
                    })()}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="center">
                        <Calendar
                          mode="single"
                          initialFocus
                          selected={installment.payment_due_date ? new Date(installment.payment_due_date) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              handlePaymentDueDateUpdate(installment.id, date);
                              
                            }
                          }}
                          disabled={isUpdatingDueDate}
                          className="rounded-md border"
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                </TableCell>
                <TableCell className="py-3 px-3 text-center">
                  <div className="inline-flex items-center justify-center gap-1">
                    {/* Luôn hiển thị nút xem chi tiết thanh toán */}
                    {onShowPaymentHistory && (
                      <Button 
                        variant="ghost" 
                        className="h-8 w-8 p-0" 
                        onClick={() => onShowPaymentHistory(installment)}
                        title="Lịch sử thanh toán"
                      >
                        <CalendarIcon className="h-4 w-4 text-gray-500" />
                      </Button>
                    )}
                    
                    {/* Luôn hiển thị nút thao tác thanh toán/xem chi tiết tài chính */}
                    {onShowPaymentActions && (
                      <Button 
                        variant="ghost" 
                        className="h-8 w-8 p-0" 
                        onClick={() => onShowPaymentActions(installment)}
                        title={installment.status === InstallmentStatus.DELETED ? "Xem chi tiết tài chính" : "Thao tác thanh toán"}
                      >
                        <DollarSignIcon className={`h-4 w-4 ${installment.status === InstallmentStatus.DELETED ? 'text-gray-400' : 'text-gray-500'}`} />
                      </Button>
                    )}
                    
                    {/* Chỉ hiển thị các nút khác nếu hợp đồng chưa bị xóa */}
                    {installment.status !== InstallmentStatus.DELETED && (
                      <>
                        {installment.status === InstallmentStatus.CLOSED && canUnlockInstallment && (
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0" 
                            onClick={() => confirmUnlockInstallment(installment)}
                            title="Mở lại hợp đồng"
                          >
                            <UnlockIcon className="h-4 w-4 text-amber-500" />
                          </Button>
                        )}
                        {/* Hiển thị dropdown menu nếu: hợp đồng đã đóng HOẶC chưa có kỳ thanh toán đã được thanh toán */}
                        {(installment.status === InstallmentStatus.CLOSED || !hasPaidPaymentPeriods[installment.id]) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Mở menu</span>
                                <MoreVerticalIcon className="h-4 w-4 text-gray-500" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {/* Hiển thị "Lịch sử thanh toán" cho hợp đồng đã đóng */}
                              {installment.status === InstallmentStatus.CLOSED && onShowPaymentHistory && (
                                <DropdownMenuItem onClick={() => onShowPaymentHistory(installment)}>
                                  Lịch sử thanh toán
                                </DropdownMenuItem>
                              )}
                              {/* Hiển thị "Xóa hợp đồng" cho hợp đồng chưa có kỳ thanh toán đã được thanh toán */}
                              {installment.status !== InstallmentStatus.CLOSED && canDeleteInstallment && (
                                <DropdownMenuItem onClick={() => onDelete(installment)} className="text-red-600">
                                  Xóa hợp đồng
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {totals && (
          <tfoot className="bg-yellow-200 font-semibold">
            <TableRow>
              <TableCell className="py-2 px-3 text-center font-bold"></TableCell>
              <TableCell className="py-2 px-3 text-center font-bold" colSpan={2}>Tổng</TableCell>
              <TableCell className="py-2 px-3 text-center text-rose-600 font-bold">{formatCurrency(totals.total_amount_given)}</TableCell>
              <TableCell className="py-2 px-3" />
              <TableCell className="py-2 px-3" />
              <TableCell className="py-2 px-3 text-center text-rose-600 font-bold">{formatCurrency(totals.total_paid)}</TableCell>
              <TableCell className="py-2 px-3 text-center text-rose-600 font-bold">{formatCurrency(totals.total_debt)}</TableCell>
              <TableCell className="py-2 px-3 text-center text-rose-600 font-bold">{formatCurrency(totals.total_daily_amount)}</TableCell>
              <TableCell className="py-2 px-3 text-center text-rose-600 font-bold">{formatCurrency(totals.total_remaining)}</TableCell>
              <TableCell className="py-2 px-3"></TableCell>
              <TableCell className="py-2 px-3"></TableCell>
              <TableCell className="py-2 px-3"></TableCell>
            </TableRow>
          </tfoot>
        )}
        </Table>
      </div>
      </div>

      {/* Mobile/Tablet Card View (below lg) */}
      <div className="lg:hidden space-y-3">
        {installments.map((installment, index) => {
          const statusInfo = installment.statusInfo ?? {
            label: "Không xác định",
            color: "bg-gray-100 text-gray-800",
          };

          return (
            <div key={installment.id} className="bg-white border rounded-lg p-4 shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-600">#{index + 1}</span>
                  <span className="font-bold text-blue-600">{installment.contract_code}</span>
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
                    onClick={() => handleContractCodeClick(installment.id)}
                    title={canEditInstallment ? 'Nhấn để chỉnh sửa hợp đồng' : 'Bạn không có quyền chỉnh sửa hợp đồng'}
                  >
                    {installment.customer?.name || "N/A"}
                  </span>
                  {(installment.customer as any)?.blacklist_reason && (
                    <AlertTriangleIcon className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>

              {/* Financial Info Grid */}
              <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div>
                  <span className="text-gray-600">Tiền giao:</span>
                  <div className="font-medium">{formatCurrency(installment.amount_given)}</div>
                </div>
                <div>
                  <span className="text-gray-600">Đã đóng:</span>
                  <div className="font-medium text-green-600">{formatCurrency(installment.totalPaid ?? 0)}</div>
                </div>
                <div>
                  <span className="text-gray-600">Tỷ lệ:</span>
                  <div className="font-medium">{calculateRatio(installment)}</div>
                </div>
                <div>
                  <span className="text-gray-600">Nợ:</span>
                  <div className={`font-medium ${installment.debt_amount && installment.debt_amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(installment.debt_amount || 0)}
                  </div>
                </div>
              </div>

              {/* Due Date */}
              <div className="mb-3 text-sm">
                <span className="text-gray-600">Ngày phải đóng: </span>
                {installment.status === InstallmentStatus.CLOSED || 
                 installment.nextPaymentDate == "Hoàn thành" || 
                 !installment.payment_due_date ? (
                  <span className="text-green-600 font-medium">Hoàn thành</span>
                ) : (
                  <span className={`font-medium ${
                    installment.overdueDays ? 'text-red-500' : 
                    installment.isDueToday ? 'text-amber-500' : 
                    installment.nextPaymentDate === "Ngày mai" ? 'text-blue-500' : ''
                  }`}>
                    {(() => {
                      if (!installment.payment_due_date) return "Hoàn thành";
                      
                      const dueDateObj = new Date(installment.payment_due_date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      
                      const isSameDay = (date1: Date, date2: Date) => {
                        return date1.getDate() === date2.getDate() &&
                               date1.getMonth() === date2.getMonth() &&
                               date1.getFullYear() === date2.getFullYear();
                      };
                      
                      if (isSameDay(today, dueDateObj)) return "Hôm nay";
                      
                      const tomorrow = new Date(today);
                      tomorrow.setDate(today.getDate() + 1);
                      
                      if (isSameDay(tomorrow, dueDateObj)) return "Ngày mai";
                      
                      const day = dueDateObj.getDate().toString().padStart(2, '0');
                      const month = (dueDateObj.getMonth() + 1).toString().padStart(2, '0');
                      return `${day}/${month}`;
                    })()}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t">
                <div className="flex items-center gap-2">
                  {/* Payment History Button */}
                  {onShowPaymentHistory && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onShowPaymentHistory(installment)}
                      className="flex items-center gap-1"
                    >
                      <CalendarIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Lịch sử</span>
                    </Button>
                  )}
                  
                  {/* Payment Actions Button */}
                  {onShowPaymentActions && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onShowPaymentActions(installment)}
                      className="flex items-center gap-1"
                    >
                      <DollarSignIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Thanh toán</span>
                    </Button>
                  )}
                </div>

                {installment.status !== InstallmentStatus.DELETED && (
                  <div className="flex items-center gap-2">
                    {/* Unlock Button */}
                    {installment.status === InstallmentStatus.CLOSED && canUnlockInstallment && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => confirmUnlockInstallment(installment)}
                        className="flex items-center gap-1"
                      >
                        <UnlockIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Mở lại</span>
                      </Button>
                    )}
                    
                    {/* Delete Button */}
                    {(installment.status === InstallmentStatus.CLOSED || !hasPaidPaymentPeriods[installment.id]) && 
                     installment.status !== InstallmentStatus.CLOSED && canDeleteInstallment && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => onDelete(installment)}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700"
                      >
                        <TrashIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Xóa</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Totals Card for Mobile */}
        {totals && (
          <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4">
            <h3 className="font-bold text-center mb-3">Tổng kết</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="text-center">
                <div className="text-gray-600">Tiền giao khách</div>
                <div className="font-bold text-rose-600">{formatCurrency(totals.total_amount_given)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600">Đã đóng</div>
                <div className="font-bold text-rose-600">{formatCurrency(totals.total_paid)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600">Nợ</div>
                <div className="font-bold text-rose-600">{formatCurrency(totals.total_debt)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600">Còn phải đóng</div>
                <div className="font-bold text-rose-600">{formatCurrency(totals.total_remaining)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Unlocking Contract */}
      <AlertDialog open={unlockConfirmOpen} onOpenChange={setUnlockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận mở khóa hợp đồng</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn mở khóa hợp đồng {installmentToUnlock?.contract_code || ''} không? 
              Hành động này sẽ chuyển trạng thái hợp đồng từ "Đóng" thành "Hoàn thành".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => installmentToUnlock && handleUnlockInstallment(installmentToUnlock)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Xác nhận mở khóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
