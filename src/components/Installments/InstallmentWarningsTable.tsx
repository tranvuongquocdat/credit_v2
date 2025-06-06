import { InstallmentWithCustomer, InstallmentStatus } from "@/models/installment";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { useEffect, useState } from "react";
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";
import { getInstallmentPaymentPeriods } from "@/lib/installmentPayment";
import { AlertTriangleIcon } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { useRouter } from "next/navigation";
import { calculateRemainingToPay } from "@/lib/installmentCalculations";
import { getLatestPaymentPaidDate } from '@/lib/Installments/get_latest_payment_paid_date';
import { getinstallmentPaymentHistory } from "@/lib/Installments/payment_history";

// Extended interface with warning-specific fields
interface InstallmentWarning extends InstallmentWithCustomer {
  payments?: InstallmentPaymentPeriod[];
  latestPeriod?: InstallmentPaymentPeriod;
  latePeriods: number;
  totalDueAmount: number;
  buttonValues: number[];
}

interface InstallmentWarningsTableProps {
  installments: InstallmentWithCustomer[];
  isLoading: boolean;
  onPayment?: (installment: InstallmentWithCustomer, amount: number) => void;
  onCustomerClick?: (installment: InstallmentWithCustomer) => void; // Optional callback for customer click
}

export function InstallmentWarningsTable({
  installments,
  isLoading,
  onPayment,
  onCustomerClick,
}: InstallmentWarningsTableProps) {
  // State for storing processed warnings
  const [warnings, setWarnings] = useState<InstallmentWarning[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  
  // Get current store from store context
  const { currentStore } = useStore();
  
  // Router for navigation
  const router = useRouter();
  
  // Handle customer name click
  const handleCustomerClick = (warning: InstallmentWarning) => {
    if (onCustomerClick) {
      // Use callback if provided
      onCustomerClick(warning);
    } else {
      // Default behavior: redirect to installments page with contract filter
      router.push(`/installments?contract=${warning.contract_code}`);
    }
  };
  
  // Process installments to identify warnings
  useEffect(() => {
    async function processWarnings() {
      if (!installments.length) return;
      
      setLoadingPayments(true);
      
      try {
        
        const warningResults: InstallmentWarning[] = [];
        // Process each installment
        for (const installment of installments) {
          try {
            // Sử dụng getLatestPaymentPaidDate thay vì getInstallmentPaymentPeriods
            const latestPaymentDate = await getLatestPaymentPaidDate(installment.id);
            
            // Tính tổng số tiền đã thanh toán từ history
            const paymentHistory = await getinstallmentPaymentHistory(installment.id);
            const totalPaid = paymentHistory.reduce((acc, curr) => acc + (curr.credit_amount || 0), 0);
            
            // Tính số tiền còn phải trả
            const remainingAmount = Math.max(0, (installment.installment_amount || 0) - totalPaid);
            
            // Kiểm tra xem có quá hạn không
            const startDate = new Date(installment.start_date);
            startDate.setHours(0, 0, 0, 0);
            const contractEndDate = new Date(startDate);
            contractEndDate.setDate(startDate.getDate() + installment.duration - 1);
            contractEndDate.setHours(0, 0, 0, 0);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Use the earlier date between contract end date and today
            const effectiveDate = today > contractEndDate ? contractEndDate : today;
            
            // Nếu có thanh toán gần nhất, tính từ ngày đó
            let checkDate = startDate;
            checkDate.setDate(checkDate.getDate() - 1);
            if (latestPaymentDate) {
              checkDate = new Date(latestPaymentDate);
            }
            checkDate.setHours(0, 0, 0, 0);
            
            // Kiểm tra xem có quá hạn hay không
            const paymentPeriod = installment.payment_period || 10;
            const daysSinceLastPayment = Math.floor((effectiveDate.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysSinceLastPayment >= paymentPeriod && remainingAmount > 0) {
              const latePeriods = Math.floor(daysSinceLastPayment / paymentPeriod);
              
              // Tạo button values
              const buttonValues: number[] = [];
              const amountPerPeriod = remainingAmount / Math.ceil(daysSinceLastPayment / paymentPeriod);
              
              for (let i = 1; i <= Math.min(latePeriods, 10); i++) {
                buttonValues.push(amountPerPeriod * i);
              }
              
              // Add to warnings
              warningResults.push({
                ...installment,
                payments: [],
                latePeriods,
                buttonValues,
                totalDueAmount: installment.debt_amount || 0 // Sử dụng debt_amount từ installment
              });
            }
            
          } catch (error) {
            console.error(`Error processing installment ${installment.id}:`, error);
            continue;
          }
        }
        
        setWarnings(warningResults);
      } catch (err) {
        console.error("Error processing installment warnings:", err);
      } finally {
        setLoadingPayments(false);
      }
    }
    
    processWarnings();
  }, [installments, currentStore]);

  if (isLoading || loadingPayments) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (warnings.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500">
        <AlertTriangleIcon size={40} className="mb-2 text-green-500" />
        <p className="text-lg font-medium">Không có cảnh báo trả góp{currentStore ? ` tại ${currentStore.name}` : ''}</p>
        <p className="text-sm">Tất cả các hợp đồng đều đang được thanh toán đúng hạn.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-10">#</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Mã hợp đồng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-36">Tên khách hàng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Số điện thoại</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-48">Địa chỉ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Nợ cũ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Số tiền</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Lý do</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm">
              <div className="flex flex-col">
                <span>Đóng tiền nhanh</span>
                <span className="text-xs text-gray-400">(đơn vị ngàn VND)</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {warnings.map((warning, index) => {
            // Generate quick payment buttons (max 10)
            const maxButtons = Math.min(10, warning.buttonValues.length);
            const quickPayButtons = [];
            
            // Tính tổng số tiền cần thanh toán - lấy phần tử cuối cùng trong mảng buttonValues
            const totalAmountToDisplay = warning.buttonValues.length > 0 
              ? warning.buttonValues[warning.buttonValues.length - 1] 
              : 0;
            
            for (let i = 0; i < maxButtons; i++) {
              // Lấy giá trị từ mảng buttonValues đã được tính toán
              const buttonAmount = Math.round(warning.buttonValues[i] / 1000); // Convert to thousands
              
              quickPayButtons.push(
                <Button
                  key={i}
                  variant="outline" 
                  size="sm"
                  className="mx-1 bg-green-100 hover:bg-green-200 text-green-800 border-green-300"
                  onClick={() => onPayment && onPayment(warning, warning.buttonValues[i])}
                >
                  {buttonAmount}
                </Button>
              );
            }

            return (
              <tr key={warning.id} className="hover:bg-gray-50 transition-colors text-sm">
                <td className="py-3 px-3 border-r border-gray-200 text-center">{index + 1}</td>
                <td className="py-3 px-3 border-r border-gray-200 font-medium text-center">
                  {warning.contract_code}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  <span 
                    className="text-blue-600 cursor-pointer hover:underline"
                    onClick={() => handleCustomerClick(warning)}
                  >
                    {warning.customer?.name || "N/A"}
                  </span>
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {warning.customer?.phone || ""}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {warning.customer?.address || ""}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {warning.payments && warning.payments.length > 0 
                    ? formatCurrency(warning.totalDueAmount)
                    : formatCurrency(0)
                  }
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {formatCurrency(totalAmountToDisplay)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  <span className="text-red-600 font-medium">
                    Chậm {warning.latePeriods} kỳ !
                  </span>
                </td>
                <td className="py-3 px-3 text-center">
                  <div className="flex flex-wrap justify-center gap-1">
                    {quickPayButtons}
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