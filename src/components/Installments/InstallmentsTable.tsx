import { InstallmentWithCustomer } from "@/models/installment";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Edit2Icon, MoreVerticalIcon, TrashIcon, AlertTriangleIcon, CalendarIcon, ClockIcon, FileTextIcon, DollarSignIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { useEffect, useState } from "react";
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";
import { getInstallmentPaymentPeriods } from "@/lib/installmentPayment";
import { InstallmentStatus } from "@/models/installment";

// Định nghĩa cấu trúc dữ liệu mở rộng bao gồm thông tin kỳ thanh toán
interface InstallmentWithPayments extends InstallmentWithCustomer {
  payments?: InstallmentPaymentPeriod[];
  totalPaid?: number;
  oldDebt?: number;
  remainingToPay?: number;
  overdueDays?: number;  // Number of days overdue for display
  isDueToday?: boolean;  // Flag for payments due today
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

  // Nạp dữ liệu thanh toán khi installments thay đổi
  useEffect(() => {
    async function loadPaymentData() {
      if (!installments.length) return;
      
      setLoadingPayments(true);
      
      try {
        // Tạo bản sao dữ liệu ban đầu
        const enhancedInstallments: InstallmentWithPayments[] = [...installments];
        
        // Nạp dữ liệu thanh toán cho từng hợp đồng
        for (let i = 0; i < enhancedInstallments.length; i++) {
          const installment = enhancedInstallments[i];
          
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
            (installment.amount_given * (1 + installment.interest_rate / 100));
          
          // Adjust remaining calculation based on oldDebt
          // If oldDebt is negative (customer owes more), add it to remaining amount
          // If oldDebt is positive (customer has overpaid), subtract it from remaining
          installment.remainingToPay = installmentAmount - (installment.totalPaid || 0);
          if (installment.oldDebt && installment.oldDebt < 0) {
            // If there's negative oldDebt (customer owes more), add the absolute value
            installment.remainingToPay += Math.abs(installment.oldDebt);
          }
        }
        
        setInstallmentsWithPayments(enhancedInstallments);
      } catch (err) {
        console.error("Error loading payment data:", err);
      } finally {
        setLoadingPayments(false);
      }
    }
    
    loadPaymentData();
  }, [installments]);

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
        <p className="text-lg font-medium">Không tìm thấy hợp đồng nào</p>
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
              
              // Calculate the percentage of the total amount that has been paid
              const totalPaid = installment.totalPaid || 0;
              const totalAmount = installment.installment_amount || 
                (installment.amount_given * (1 + installment.interest_rate / 100));
              const paymentPercentage = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;
              
              // Update status based on payment data
              if (allPaid) {
                installment.status = InstallmentStatus.CLOSED;
              } else if (installment.status === InstallmentStatus.DELETED) {
                // Keep DELETED status if it was set manually
              } else if (longestOverdueDays >= 60) { // More than 60 days overdue = BAD_DEBT
                installment.status = InstallmentStatus.BAD_DEBT;
              } else if (hasOverduePayments) {
                // If overdue and has paid more than 70%, consider it LATE_INTEREST
                // Otherwise, it's OVERDUE
                if (paymentPercentage > 70) {
                  installment.status = InstallmentStatus.LATE_INTEREST;
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
                  <span 
                    className="text-blue-600 cursor-pointer hover:underline" 
                    onClick={() => onEdit(installment.id)}
                  >
                    {installment.contract_code}
                  </span>
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">{installment.customer?.name || "N/A"}</td>
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
                      
                      // Handle edge cases
                      if (!installmentAmount || installmentAmount <= 0) {
                        return `${installment.interest_rate}%`;
                      }
                      
                      // Calculate ratio: if installment is 10, what is the down payment value
                      const ratio = 10 / installmentAmount * downAmount;
                      
                      // Format to remove decimal if it's a whole number
                      const formatValue = (value: number) => 
                        Math.abs(value % 1) < 0.05 ? Math.round(value).toString() : value.toFixed(1);
                      
                      return `10 ăn ${formatValue(ratio)}`;
                    } catch (error) {
                      // Fallback to showing percentage
                      return `${installment.interest_rate}%`;
                    }
                  })()}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">{installment.duration} ngày</td>
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
                    {new Date(installment.due_date).toLocaleDateString('vi-VN')}
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
                    {onShowPaymentActions && (
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
                        {onShowPaymentActions && (
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
    </div>
  );
}
