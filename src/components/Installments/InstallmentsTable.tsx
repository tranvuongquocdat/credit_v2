import { InstallmentWithCustomer, InstallmentStatus } from "@/models/installment";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Edit2Icon, MoreVerticalIcon, TrashIcon, AlertTriangleIcon, CalendarIcon, ClockIcon, FileTextIcon, DollarSignIcon, UnlockIcon, CalendarDaysIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { useEffect, useState, useCallback } from "react";
import { updateInstallmentStatus } from "@/lib/installmentPayment";
import { updateInstallmentPaymentDueDate } from "@/lib/installment";
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
  calculateRatio,
  calculateRemainingToPay
} from "@/lib/installmentCalculations";
import { supabase } from "@/lib/supabase";
import { getinstallmentPaymentHistory } from "@/lib/Installments/payment_history";
import { calculateMultipleInstallmentStatus, InstallmentStatusResult } from "@/lib/Installments/calculate_installment_status";
import { recordContractReopening } from "@/lib/installmentAmountHistory";
import { usePermissions } from '@/hooks/usePermissions';
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
  installments: InstallmentWithCustomer[];
  statusMap: Record<string, { label: string; color: string }>;
  isLoading: boolean;
  onEdit: (id: string) => void;
  onUpdateStatus: (installment: InstallmentWithCustomer) => void;
  onDelete: (installment: InstallmentWithCustomer) => void;
  onShowPaymentHistory?: (installment: InstallmentWithCustomer) => void;
  onShowPaymentActions?: (installment: InstallmentWithCustomer) => void;
}

export function InstallmentsTable({
  installments,
  statusMap,
  isLoading,
  onEdit,
  onUpdateStatus,
  onDelete,
  onShowPaymentHistory,
  onShowPaymentActions,
}: InstallmentsTableProps) {
  // State để lưu trữ dữ liệu hợp đồng đã kèm thông tin thanh toán
  const [installmentsWithStatus, setInstallmentsWithStatus] = useState<InstallmentWithStatusInfo[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  
  // State để lưu trữ thông tin có kỳ thanh toán đã được thanh toán hay không cho mỗi installment
  const [hasPaidPaymentPeriods, setHasPaidPaymentPeriods] = useState<Record<string, boolean>>({});
  
  // State cho calculated status
  const [calculatedStatuses, setCalculatedStatuses] = useState<Record<string, InstallmentStatusResult>>({});
  
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

  // Extract loadPaymentData to a separate function so it can be called from other places
  const loadPaymentData = useCallback(async () => {
    if (!installments.length) return;
    
    setLoadingPayments(true);
    
    try {
      // Calculate statuses for all installments in parallel
      const installmentIds = installments.map(installment => installment.id);
      const statusResults = await calculateMultipleInstallmentStatus(installmentIds);
      setCalculatedStatuses(statusResults);
      
      // Tạo bản sao dữ liệu ban đầu
      const enhancedInstallments: InstallmentWithStatusInfo[] = [...installments];

      // Nạp dữ liệu thanh toán cho từng hợp đồng
      for (let i = 0; i < enhancedInstallments.length; i++) {
        const installment = enhancedInstallments[i];
        
        // Fetch fresh installment data from database to get latest payment_due_date
        const { data: freshInstallmentData } = await supabase
          .from('installments')
          .select('payment_due_date')
          .eq('id', installment.id)
          .single();
        
        // Update the installment with fresh payment_due_date if available
        if (freshInstallmentData) {
          installment.payment_due_date = freshInstallmentData.payment_due_date;
        }
        
        // Lấy dữ liệu kỳ thanh toán từ API
        const paymentHistory = await getinstallmentPaymentHistory(installment.id);
        
        if (!paymentHistory) {
          console.error(`Error loading payment data for installment ${installment.id}:`, paymentHistory);
          continue;
        }
        
        // Tính tổng tiền đã đóng (tổng của credit_amount)
        installment.totalPaid = paymentHistory.reduce(
          (sum, period) => sum + (period.credit_amount || 0), 
          0
        );
        
        // Tính còn phải đóng sử dụng utility function
        installment.remainingToPay = calculateRemainingToPay(installment, installment.totalPaid || 0);
        if (installment.oldDebt && installment.oldDebt < 0) {
          // If there's negative oldDebt (customer owes more), add the absolute value
          installment.remainingToPay += Math.abs(installment.oldDebt);
        }
        
        // Xử lý ngày đóng tiền tiếp theo dựa trên payment_due_date
        if (installment.payment_due_date) {
          // Có payment_due_date => chưa hoàn thành
          const dueDateObj = new Date(installment.payment_due_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          // So sánh ngày chuẩn xác
          const isSameDay = (date1: Date, date2: Date) => {
            return date1.getDate() === date2.getDate() &&
                   date1.getMonth() === date2.getMonth() &&
                   date1.getFullYear() === date2.getFullYear();
          };
          
          // Format ngày
          const day = dueDateObj.getDate().toString().padStart(2, '0');
          const month = (dueDateObj.getMonth() + 1).toString().padStart(2, '0');
          const year = dueDateObj.getFullYear();
          installment.nextPaymentDate = `${day}/${month}/${year}`;
          
          // Kiểm tra hôm nay/ngày mai
          if (isSameDay(today, dueDateObj)) {
            installment.isDueToday = true;
            installment.nextPaymentDate = "Hôm nay";
          } else {
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            
            if (isSameDay(tomorrow, dueDateObj)) {
              installment.nextPaymentDate = "Ngày mai";
            }
          }
          
          // Kiểm tra quá hạn
          if (today > dueDateObj) {
            installment.overdueDays = Math.floor((today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
          }
          
          // Cập nhật trạng thái dựa trên payment_due_date
          if (installment.status !== InstallmentStatus.CLOSED && 
              installment.status !== InstallmentStatus.DELETED && 
              installment.status !== InstallmentStatus.FINISHED) {
            if (today > dueDateObj) {
              // Nếu ngày hiện tại > ngày đóng tiền => Quá hạn
              installment.status = InstallmentStatus.LATE_INTEREST;
            } else if (isSameDay(today, dueDateObj)) {
              // Nếu là ngày hôm nay => Đến hạn hôm nay
              installment.status = InstallmentStatus.ON_TIME;
              installment.isDueToday = true;
            } else {
              // Các trường hợp khác => Đúng hạn
              installment.status = InstallmentStatus.ON_TIME;
              
              // Kiểm tra ngày mai
              const tomorrow = new Date(today);
              tomorrow.setDate(today.getDate() + 1);
              
              if (isSameDay(tomorrow, dueDateObj)) {
                installment.status = InstallmentStatus.DUE_TOMORROW;
              }
            }
          }
        } else {
          // Không có payment_due_date => đã hoàn thành
          installment.nextPaymentDate = "Hoàn thành";
          
          // Cập nhật trạng thái nếu chưa phải CLOSED hoặc DELETED
          if (installment.status !== InstallmentStatus.CLOSED && 
              installment.status !== InstallmentStatus.DELETED) {
            installment.status = InstallmentStatus.FINISHED;
          }
        }
      }
      
      // Cập nhật statusInfo sau khi cập nhật status
      for (const installment of enhancedInstallments) {
        // Use calculated status if available, otherwise fallback to statusMap
        const calculatedStatus = calculatedStatuses[installment.id];
        let statusInfo: StatusInfo;
        
        if (calculatedStatus) {
          // Map calculated status to color and use calculated status text
          let color: string;
          switch (calculatedStatus.statusCode) {
            case 'CLOSED':
              color = "bg-blue-100 text-blue-800 border-blue-200";
              break;
            case 'DELETED':
              color = "bg-gray-100 text-gray-800 border-gray-200";
              break;
            case 'FINISHED':
              color = "bg-emerald-100 text-emerald-800 border-emerald-200";
              break;
            case 'BAD_DEBT':
              color = "bg-purple-100 text-purple-800 border-purple-200";
              break;
            case 'OVERDUE':
              color = "bg-red-100 text-red-800 border-red-200";
              break;
            case 'LATE_INTEREST':
              color = "bg-yellow-100 text-yellow-800 border-yellow-200";
              break;
            case 'ACTIVE':
            default:
              color = "bg-green-100 text-green-800 border-green-200";
              break;
          }
          statusInfo = {
            label: calculatedStatus.status,
            color: color
          };
        } else {
          // Fallback to original logic
          statusInfo = statusMap[installment.status] || {
            label: "Không xác định",
            color: "bg-gray-100 text-gray-800",
          };
        }
        
        installment.statusInfo = statusInfo;
      }
      
      setInstallmentsWithStatus(enhancedInstallments);
    } catch (err) {
      console.error("Error loading payment data:", err);
    } finally {
      setLoadingPayments(false);
    }
  }, [installments, currentStore, statusMap]);

  // Nạp dữ liệu thanh toán khi installments thay đổi
  useEffect(() => {
    loadPaymentData();
    
    // Load payment periods info
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
  }, [loadPaymentData, installments, checkHasPaidPaymentPeriods]);

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
      // Since updateInstallmentStatus doesn't support storeId parameter, we'll rely on the 
      // implementation to handle the store context if needed
      const { data, error } = await updateInstallmentStatus(
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
      // Reload data to get updated payment periods and status with fresh payment_due_date
      await loadPaymentData();
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
      const { data, error } = await updateInstallmentPaymentDueDate(installmentId, formattedDate);
      
      if (error) {
        throw error;
      }
      
      // Show success toast
      toast({
        title: "Thành công",
        description: "Đã cập nhật ngày đóng tiền",
      });
      
      // Reload data to get updated payment periods and status with fresh payment_due_date
      await loadPaymentData();
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

  if (isLoading || loadingPayments) {
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
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 table-fixed">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-10">#</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Mã HĐ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-36">Tên KH</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Tiền giao khách</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-16">Tỷ lệ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-20">Thời gian</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Tiền đã đóng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Nợ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền 1 ngày</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Còn phải đóng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Tình trạng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Ngày phải đóng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm w-32">Thao tác</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {installmentsWithStatus.map((installment, index) => {
            const statusInfo = installment.statusInfo || {
              label: "Không xác định",
              color: "bg-gray-100 text-gray-800",
            };

            return (
              <tr 
                key={installment.id} 
                className="hover:bg-gray-50 transition-colors text-sm"
              >
                <td className="py-3 px-3 border-r border-gray-200 text-center">{index + 1}</td>
                <td className="py-3 px-3 border-r border-gray-200 font-medium text-center">
                  <span>
                    {installment.contract_code}
                  </span>
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  <span 
                    className="text-blue-600 cursor-pointer hover:underline" 
                    onClick={() => handleContractCodeClick(installment.id)}
                    title={canEditInstallment ? 'Nhấn để chỉnh sửa hợp đồng' : 'Bạn không có quyền chỉnh sửa hợp đồng'}
                  >
                    {installment.customer?.name || "N/A"}
                  </span>
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {formatCurrency(installment.amount_given)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {calculateRatio(installment)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
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
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {formatCurrency(installment.totalPaid || 0)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  <span className={installment.debt_amount && installment.debt_amount > 0 ? 'text-red-600' : 'text-green-600'}>
                    {formatCurrency((0 - (installment.debt_amount || 0)))}
                  </span>
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {formatCurrency(calculateDailyAmount(installment))}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {formatCurrency(installment.remainingToPay || 0)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  <Badge
                    variant="outline"
                    className={statusInfo.color}
                  >
                    {statusInfo.label}
                  </Badge>
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {installment.status === InstallmentStatus.CLOSED || 
                   installment.nextPaymentDate == "Hoàn thành" || 
                   (installment.remainingToPay ?? 0) <= 0 || 
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
                </td>
                <td className="py-3 px-3 text-center">
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
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
