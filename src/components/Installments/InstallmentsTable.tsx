import { InstallmentWithCustomer, InstallmentStatus } from "@/models/installment";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Edit2Icon, MoreVerticalIcon, TrashIcon, AlertTriangleIcon, CalendarIcon, ClockIcon, FileTextIcon, DollarSignIcon, UnlockIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { useEffect, useState } from "react";
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";
import { getInstallmentPaymentPeriods, updateInstallmentStatus } from "@/lib/installmentPayment";
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
import { useStore } from "@/contexts/StoreContext";

// Định nghĩa cấu trúc dữ liệu mở rộng bao gồm thông tin kỳ thanh toán
interface InstallmentWithPayments extends InstallmentWithCustomer {
  payments?: InstallmentPaymentPeriod[];
  totalPaid?: number;
  oldDebt?: number;
  remainingToPay?: number;
  overdueDays?: number;  // Number of days overdue for display
  isDueToday?: boolean;  // Flag for payments due today
  nextPaymentDate?: string; // Next payment date
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
  const [installmentsWithPayments, setInstallmentsWithPayments] = useState<InstallmentWithPayments[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  
  // Get current store from store context
  const { currentStore } = useStore();
  
  // State for unlock confirmation dialog
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);
  const [installmentToUnlock, setInstallmentToUnlock] = useState<InstallmentWithPayments | null>(null);

  // Nạp dữ liệu thanh toán khi installments thay đổi
  useEffect(() => {
    async function loadPaymentData() {
      if (!installments.length) return;
      
      setLoadingPayments(true);
      
      try {
        // Tạo bản sao dữ liệu ban đầu
        const enhancedInstallments: InstallmentWithPayments[] = [...installments];
        // Filter installments by store_id if currentStore is available
        const filteredInstallments = currentStore ? 
          enhancedInstallments.filter(installment => installment.store_id === currentStore.id) : 
          enhancedInstallments;
        
        // Nạp dữ liệu thanh toán cho từng hợp đồng
        for (let i = 0; i < filteredInstallments.length; i++) {
          const installment = filteredInstallments[i];
          
          // Lấy dữ liệu kỳ thanh toán từ API
          const { data, error } = await getInstallmentPaymentPeriods(installment.id);
          
          if (error) {
            console.error(`Error loading payment data for installment ${installment.id}:`, error);
            continue;
          }
          
          // Lưu dữ liệu kỳ thanh toán
          installment.payments = data || [];
          
          // Tính tổng tiền đã đóng (tổng của actual_amount)
          installment.totalPaid = installment.payments.reduce(
            (sum, period) => sum + (period.actualAmount || 0), 
            0
          );
          
          // Tính tổng nợ cũ (chênh lệch giữa actual_amount và expected_amount)
          const totalExpected = installment.payments.reduce(
            (sum, period) => sum + period.expectedAmount, 
            0
          );
          installment.oldDebt = installment.totalPaid - totalExpected;
          
          // Tính còn phải đóng
          // Ưu tiên dùng installment_amount nếu có, nếu không tính dựa trên amount_given và interest_rate
          const installmentAmount = installment.installment_amount || 
            (installment.amount_given);
          
          // Adjust remaining calculation based on oldDebt
          // If oldDebt is negative (customer owes more), add it to remaining amount
          // If oldDebt is positive (customer has overpaid), subtract it from remaining
          installment.remainingToPay = installmentAmount - (installment.totalPaid || 0);
          if (installment.oldDebt && installment.oldDebt < 0) {
            // If there's negative oldDebt (customer owes more), add the absolute value
            installment.remainingToPay += Math.abs(installment.oldDebt);
          }
          console.log('installment.payments', installment.payments);
          // Find next payment date based on payment periods
          if (installment.payments && installment.payments.length > 0) {
            console.log('Calculating next payment date using same logic as payment history modal');
            
            // Lấy dữ liệu cần thiết từ installment
            const loanPeriod = installment.duration || 0; // Thời gian vay (ngày)
            const paymentPeriod = installment.payment_period || 10; // Thời gian mỗi kỳ (ngày)
            const totalPeriods = Math.ceil(loanPeriod / paymentPeriod); // Tổng số kỳ
            const startDate = new Date(installment.start_date);
            
            console.log('Contract params:', { loanPeriod, paymentPeriod, totalPeriods, startDate: installment.start_date });
            
            // Sắp xếp payment periods theo periodNumber và lấy cái cao nhất
            const sortedPeriods = [...installment.payments].sort((a, b) => a.periodNumber - b.periodNumber);
            const maxPeriodNumber = Math.max(...sortedPeriods.map(p => p.periodNumber));
            
            console.log('Max period number in data:', maxPeriodNumber);
            
            // Hàm tính ngày của kỳ cụ thể
            const calculatePeriodDates = (periodNumber: number) => {
              // Cần tính toán chính xác ngày bắt đầu và kết thúc của kỳ
              // Dựa trên ngày bắt đầu của hợp đồng và thời gian của mỗi kỳ
              let currentDate = new Date(startDate);
              let periodDays = paymentPeriod;
              
              for (let i = 0; i < periodNumber; i++) {
                if (i === periodNumber - 1) {
                  // Kỳ cuối cùng có thể ngắn hơn
                  if (i === totalPeriods - 1) {
                    const totalDays = loanPeriod;
                    const previousDays = i * periodDays;
                    periodDays = Math.max(1, totalDays - previousDays);
                  }
                }
                
                // Nếu không phải kỳ cuối cùng, cập nhật ngày cho kỳ tiếp theo
                if (i < periodNumber - 1) {
                  currentDate.setDate(currentDate.getDate() + periodDays);
                }
              }
              
              // Tính ngày kết thúc kỳ
              const endDate = new Date(currentDate);
              endDate.setDate(endDate.getDate() + periodDays - 1);
              
              return {
                startDate: currentDate,
                endDate: endDate,
                periodDays: periodDays
              };
            };
            
            // Tính ngày cho kỳ tiếp theo
            const nextPeriodNumber = maxPeriodNumber + 1;
            
            // Chỉ tính kỳ tiếp theo nếu chưa đạt đến tổng số kỳ
            if (nextPeriodNumber <= totalPeriods) {
              const { startDate: nextPeriodStartDate } = calculatePeriodDates(nextPeriodNumber);
              
              // Format in DD/MM/YYYY
              const day = nextPeriodStartDate.getDate().toString().padStart(2, '0');
              const month = (nextPeriodStartDate.getMonth() + 1).toString().padStart(2, '0');
              const year = nextPeriodStartDate.getFullYear();
              const nextPaymentDate = `${day}/${month}/${year}`;
              
              console.log('Calculated next payment date for period', nextPeriodNumber, ':', nextPaymentDate);
              
              // Store the next payment date
              installment.nextPaymentDate = nextPaymentDate;
            } else {
              // Nếu đã đạt đến tổng số kỳ, tính ngày dựa trên kỳ cuối cùng + payment_period
              const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
              let lastDueDate: Date;
              
              if (lastPeriod.dueDate.includes('/')) {
                // Format: DD/MM/YYYY
                const [day, month, year] = lastPeriod.dueDate.split('/').map(Number);
                lastDueDate = new Date(year, month - 1, day);
              } else {
                // ISO format
                lastDueDate = new Date(lastPeriod.dueDate);
              }
              
              // Tính ngày kết thúc của kỳ cuối
              const { endDate: lastPeriodEndDate } = calculatePeriodDates(maxPeriodNumber);
              
              // Ngày bắt đầu kỳ tiếp theo là ngày sau ngày kết thúc kỳ cuối
              const nextDate = new Date(lastPeriodEndDate);
              nextDate.setDate(nextDate.getDate() + 1);
              
              // Format in DD/MM/YYYY
              const day = nextDate.getDate().toString().padStart(2, '0');
              const month = (nextDate.getMonth() + 1).toString().padStart(2, '0');
              const year = nextDate.getFullYear();
              const nextPaymentDate = `${day}/${month}/${year}`;
              
              console.log('Calculated next payment date after max periods:', nextPaymentDate);
              
              // Store the next payment date
              installment.nextPaymentDate = nextPaymentDate;
            }
            
          } else {
            // If no payment periods, use the contract start date
            console.log('No payment periods found, using start_date:', installment.start_date);
            installment.nextPaymentDate = installment.start_date;
          }
        }
        
        setInstallmentsWithPayments(filteredInstallments);
      } catch (err) {
        console.error("Error loading payment data:", err);
      } finally {
        setLoadingPayments(false);
      }
    }
    
    loadPaymentData();
  }, [installments, currentStore]);

  // Show confirmation dialog before unlocking
  const confirmUnlockInstallment = (installment: InstallmentWithPayments) => {
    setInstallmentToUnlock(installment);
    setUnlockConfirmOpen(true);
  };

  // Add function to handle unlocking a closed installment
  const handleUnlockInstallment = async (installment: InstallmentWithPayments) => {
    // Close the dialog
    setUnlockConfirmOpen(false);
    
    try {
      // Since updateInstallmentStatus doesn't support storeId parameter, we'll rely on the 
      // implementation to handle the store context if needed
      const { data, error } = await updateInstallmentStatus(
        installment.id, 
        InstallmentStatus.FINISHED
      );
      
      if (error) {
        console.error("Error unlocking installment:", error);
        return;
      }
      
      // Update the status in the local state
      const updatedInstallments = installmentsWithPayments.map(item => {
        if (item.id === installment.id) {
          return {
            ...item,
            status: InstallmentStatus.FINISHED
          };
        }
        return item;
      });
      
      setInstallmentsWithPayments(updatedInstallments);
    } catch (err) {
      console.error("Error unlocking installment:", err);
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
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Nợ cũ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền 1 ngày</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Còn phải đóng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Tình trạng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Ngày phải đóng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm w-32">Thao tác</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {installmentsWithPayments.map((installment, index) => {
            const statusInfo = statusMap[installment.status] || {
              label: "Không xác định",
              color: "bg-gray-100 text-gray-800",
            };

            // Auto-determine status based on payment data
            if (installment.payments && installment.payments.length > 0) {
              // Calculate if all expected payments have been made
              const allPaid = installment.payments.every(payment => payment.actualAmount && payment.actualAmount >= payment.expectedAmount);
              
              // Check if there are any overdue payments (past due date without full payment)
              const today = new Date();
              const hasOverduePayments = installment.payments.some(payment => {
                const dueDate = new Date(payment.dueDate);
                return dueDate < today && (!payment.actualAmount || payment.actualAmount < payment.expectedAmount);
              });
              
              // Tomorrow's date
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              const tomorrowString = tomorrow.toISOString().split('T')[0];
              
              // Check if any payment is due tomorrow
              const dueTomorrow = installment.payments.some(payment => 
                payment.dueDate.startsWith(tomorrowString) && 
                (!payment.actualAmount || payment.actualAmount < payment.expectedAmount)
              );

              // Check if today has any payments due
              const todayString = today.toISOString().split('T')[0];
              const dueToday = installment.payments.some(payment => 
                payment.dueDate.startsWith(todayString) && 
                (!payment.actualAmount || payment.actualAmount < payment.expectedAmount)
              );
              
              // Find the longest overdue payment to determine if it's BAD_DEBT
              let longestOverdueDays = 0;
              let mostOverduePeriod = null;
              
              if (hasOverduePayments) {
                installment.payments.forEach(payment => {
                  const dueDate = new Date(payment.dueDate);
                  if (dueDate < today && (!payment.actualAmount || payment.actualAmount < payment.expectedAmount)) {
                    const overdueDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (overdueDays > longestOverdueDays) {
                      longestOverdueDays = overdueDays;
                      mostOverduePeriod = payment;
                    }
                  }
                });
              }
              
              // Store the overdue days for display
              installment.overdueDays = longestOverdueDays > 0 ? longestOverdueDays : undefined;
              
              // Update status based on payment data
              if (installment.status === InstallmentStatus.CLOSED) {
                // Keep CLOSED status if it's already set in the database
                // Do nothing, keep it CLOSED
              } else if (installment.status === InstallmentStatus.DELETED) {
                // Keep DELETED status if it was set manually
                // Do nothing, keep it DELETED
              } else if (installment.status === InstallmentStatus.FINISHED) {
                // Keep FINISHED status if it was set via unlock contract
                // Do nothing, keep it FINISHED
              } else if (longestOverdueDays >= 60) { // More than 60 days overdue = BAD_DEBT
                installment.status = InstallmentStatus.BAD_DEBT;
              } else if (hasOverduePayments) {
                // Find the latest payment period
                const latestPeriod = installment.payments
                  .filter(p => p.actualAmount && p.actualAmount > 0)
                  .sort((a, b) => b.periodNumber - a.periodNumber)[0];
                
                if (latestPeriod && latestPeriod.paymentStartDate) {
                  // Convert paymentStartDate string (DD/MM/YYYY) to Date object
                  const [day, month, year] = latestPeriod.paymentStartDate.split('/').map(Number);
                  const latestPaymentDate = new Date(year, month - 1, day); // month is 0-indexed in JS Date
                  
                  // If payment was made but too late, mark as LATE_INTEREST
                  const dueDateParts = latestPeriod.dueDate.split('/').map(Number);
                  const dueDate = new Date(dueDateParts[2], dueDateParts[1] - 1, dueDateParts[0]);
                  
                  if (latestPaymentDate > dueDate) {
                    installment.status = InstallmentStatus.LATE_INTEREST;
                  } else {
                    installment.status = InstallmentStatus.ON_TIME;
                  }
                } else {
                  installment.status = InstallmentStatus.OVERDUE;
                }
              } else if (dueToday) {
                // Due today is treated as ON_TIME but we'll mark it specially in the UI
                installment.status = InstallmentStatus.ON_TIME;
                installment.isDueToday = true;
              } else if (dueTomorrow) {
                installment.status = InstallmentStatus.DUE_TOMORROW;
              } else {
                installment.status = InstallmentStatus.ON_TIME;
              }
              
              // Update statusInfo after status update
              statusInfo.label = statusMap[installment.status]?.label || statusInfo.label;
              statusInfo.color = statusMap[installment.status]?.color || statusInfo.color;
            }

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
                    onClick={() => onEdit(installment.id)}
                  >
                    {installment.customer?.name || "N/A"}
                  </span>
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {formatCurrency(installment.amount_given)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {(() => {
                    try {
                      // Get the values
                      const installmentAmount = 
                        installment.installment_amount ? 
                        installment.installment_amount : 
                        (installment.daily_amount * installment.payment_period);
                      
                      const downAmount = installment.amount_given;
                      
                      // Calculate ratio: if installment is 10, what is the down payment value
                      const ratio = 10 / installmentAmount * downAmount;
                      
                      // Format to remove decimal if it's a whole number
                      const formatValue = (value: number) => 
                        Math.abs(value % 1) < 0.05 ? Math.round(value).toString() : value.toFixed(1);
                      
                      return `10 ăn ${formatValue(ratio)}`;
                    } catch (error) {
                      // Fallback to showing percentage
                      return `-`;
                    }
                  })()}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {(() => {
                    // Calculate end date based on start date and duration
                    try {
                      const startDate = new Date(installment.start_date);
                      const endDate = new Date(startDate);
                      endDate.setDate(startDate.getDate() + installment.duration);
                      
                      // Format dates in Vietnamese format
                      const formatDate = (date: Date) => {
                        // Format as DD/MM (Day/Month) without year
                        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                      };
                      
                      return (
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-gray-500">
                            {formatDate(startDate)} → {formatDate(endDate)}
                          </span>
                          <span className="font-medium mt-1">
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
                  <span className={installment.oldDebt && installment.oldDebt > 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatCurrency(Math.abs(installment.oldDebt || 0))}
                  </span>
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {formatCurrency(
                    // Calculate daily amount as installment_amount / duration
                    (() => {
                      // Get installment_amount, either directly or calculate it
                      const installmentAmount = installment.installment_amount || 
                        (installment.daily_amount * installment.payment_period);
                      
                      // Calculate daily amount based on duration (loan_period)
                      return installment.duration > 0 ? 
                        installmentAmount / installment.duration : 
                        installment.daily_amount;
                    })()
                  )}
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
                    {installment.overdueDays ? ` (${installment.overdueDays} ngày)` : ''}
                  </Badge>
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  <div className={`flex items-center justify-center gap-1 ${installment.overdueDays ? 'text-red-500 font-medium' : installment.isDueToday ? 'text-amber-500 font-medium' : ''}`}>
                    {(() => {
                      // If remaining amount is 0 or less, show "Hoàn thành"
                      if (installment.remainingToPay !== undefined && installment.remainingToPay <= 0) {
                        return (
                          <span className="text-green-600 font-medium">
                            Hoàn thành
                          </span>
                        );
                      }
                      
                      // Format the next payment date for display
                      if (installment.nextPaymentDate) {
                        // Handle both date formats (DD/MM/YYYY and ISO)
                        let displayDate: Date;
                        if (installment.nextPaymentDate.includes('/')) {
                          const [day, month, year] = installment.nextPaymentDate.split('/').map(Number);
                          displayDate = new Date(year, month - 1, day);
                        } else {
                          displayDate = new Date(installment.nextPaymentDate);
                        }
                        return displayDate.toLocaleDateString('vi-VN');
                      } else {
                        return new Date(installment.due_date).toLocaleDateString('vi-VN');
                      }
                    })()}
                    {installment.overdueDays && installment.overdueDays > 0 && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        quá hạn
                      </span>
                    )}
                    {installment.isDueToday && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        hôm nay
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-3 text-center">
                  <div className="inline-flex items-center justify-center gap-1">
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
                    {installment.status === InstallmentStatus.CLOSED ? (
                      <Button 
                        variant="ghost" 
                        className="h-8 w-8 p-0" 
                        onClick={() => confirmUnlockInstallment(installment)}
                        title="Mở khoá hợp đồng"
                      >
                        <UnlockIcon className="h-4 w-4 text-amber-500" />
                      </Button>
                    ) : onShowPaymentActions && (
                      <Button 
                        variant="ghost" 
                        className="h-8 w-8 p-0" 
                        onClick={() => onShowPaymentActions(installment)}
                        title="Thao tác thanh toán"
                      >
                        <DollarSignIcon className="h-4 w-4 text-gray-500" />
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => onDelete(installment)}
                      title="Xóa hợp đồng"
                    >
                      <TrashIcon className="h-4 w-4 text-gray-500" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Mở menu</span>
                          <MoreVerticalIcon className="h-4 w-4 text-gray-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onUpdateStatus(installment)}>
                          Cập nhật trạng thái
                        </DropdownMenuItem>
                        {onShowPaymentHistory && (
                          <DropdownMenuItem onClick={() => onShowPaymentHistory(installment)}>
                            Lịch sử thanh toán
                          </DropdownMenuItem>
                        )}
                        {installment.status === InstallmentStatus.CLOSED ? (
                          <DropdownMenuItem onClick={() => confirmUnlockInstallment(installment)}>
                            Mở khoá hợp đồng
                          </DropdownMenuItem>
                        ) : onShowPaymentActions && (
                          <DropdownMenuItem onClick={() => onShowPaymentActions(installment)}>
                            Thao tác thanh toán
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(installment)} className="text-red-600">
                          Xóa hợp đồng
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
