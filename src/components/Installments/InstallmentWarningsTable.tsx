import { InstallmentWithCustomer, InstallmentStatus } from "@/models/installment";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { useEffect, useState } from "react";
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";
import { getInstallmentPaymentPeriods } from "@/lib/installmentPayment";
import { AlertTriangleIcon } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";

// Extended interface with warning-specific fields
interface InstallmentWarning extends InstallmentWithCustomer {
  payments?: InstallmentPaymentPeriod[];
  latestPeriod?: InstallmentPaymentPeriod;
  latePeriods: number;
  amountPerPeriod: number;
  totalDueAmount: number;
}

interface InstallmentWarningsTableProps {
  installments: InstallmentWithCustomer[];
  isLoading: boolean;
  onPayment?: (installment: InstallmentWithCustomer, amount: number) => void;
}

export function InstallmentWarningsTable({
  installments,
  isLoading,
  onPayment,
}: InstallmentWarningsTableProps) {
  // State for storing processed warnings
  const [warnings, setWarnings] = useState<InstallmentWarning[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  
  // Get current store from store context
  const { currentStore } = useStore();
  
  // Process installments to identify warnings
  useEffect(() => {
    async function processWarnings() {
      if (!installments.length) return;
      
      setLoadingPayments(true);
      
      try {
        // Filter installments by current store if available
        const filteredInstallments = currentStore ? 
          installments.filter(installment => installment.store_id === currentStore.id) : 
          installments;
        
        const warningResults: InstallmentWarning[] = [];
        
        // Process each installment
        for (const installment of filteredInstallments) {
          // Skip closed or deleted contracts
          if (installment.status === InstallmentStatus.CLOSED || 
              installment.status === InstallmentStatus.DELETED) {
            continue;
          }
          
          // Get payment periods for this installment
          const { data, error } = await getInstallmentPaymentPeriods(installment.id);
          
          if (error) {
            console.error(`Error loading payment data for installment ${installment.id}:`, error);
            continue;
          }
          
          // Check if there are no payment periods recorded
          if (!data || data.length === 0) {
            // For contracts with no payment records, check if they're past due based on start date
            const startDate = new Date(installment.start_date);
            // Reset time part of startDate to 00:00:00
            startDate.setHours(0, 0, 0, 0);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Get payment period (default to 10 if not set)
            const paymentPeriod = installment.payment_period || 10;
            
            // If the start date is in the future, skip this contract
            if (startDate > today) {
              continue;
            }
            
            // Calculate days since start date
            const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            
            // If at least one payment period has passed
            if (daysSinceStart >= paymentPeriod) {
              // Calculate number of late periods
              const latePeriods = Math.ceil(daysSinceStart / paymentPeriod);
              
              // Calculate amount per period
              const amountPerPeriod = installment.installment_amount ? installment.installment_amount / (installment.duration) * paymentPeriod : 0;
              
              // Add to warnings - using a dummy "first period" based on contract start date
              warningResults.push({
                ...installment,
                payments: [],
                latePeriods,
                amountPerPeriod,
                totalDueAmount: amountPerPeriod * latePeriods
              });
            }
            
            // Skip to next installment
            continue;
          }
          
          // Process installments that have payment periods
          // Find the latest period (highest period number)
          const latestPeriod = [...data].sort((a, b) => b.periodNumber - a.periodNumber)[0];
          
          // Parse the end date (format DD/MM/YYYY)
          let endDate: Date;
          if (latestPeriod.endDate && latestPeriod.endDate.includes('/')) {
            const [day, month, year] = latestPeriod.endDate.split('/').map(Number);
            endDate = new Date(year, month - 1, day);
          } else {
            // Fallback to due date
            const [day, month, year] = latestPeriod.dueDate.split('/').map(Number);
            endDate = new Date(year, month - 1, day);
          }
          
          // Check if this period is overdue
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (endDate < today) {
            // Calculate the day after the end date
            const nextDay = new Date(endDate);
            nextDay.setDate(endDate.getDate() + 1);
            
            // Calculate days between next day and today
            const daysDifference = Math.floor((today.getTime() - nextDay.getTime()) / (1000 * 60 * 60 * 24));
            
            // Get payment period (default to 10 if not set)
            const paymentPeriod = installment.payment_period || 10;
            
            // Calculate number of late periods
            const latePeriods = Math.ceil(daysDifference / paymentPeriod);
            
            if (latePeriods > 0) {
              // Calculate amount per period
              const amountPerPeriod = installment.daily_amount * paymentPeriod;
              
              // Add to warnings
              warningResults.push({
                ...installment,
                payments: data,
                latestPeriod,
                latePeriods,
                amountPerPeriod,
                totalDueAmount: amountPerPeriod * latePeriods
              });
            }
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
            const maxButtons = Math.min(10, warning.latePeriods);
            const quickPayButtons = [];
            
            for (let i = 1; i <= maxButtons; i++) {
              const paymentAmount = Math.round(warning.amountPerPeriod * i / 1000); // Convert to thousands
              quickPayButtons.push(
                <Button
                  key={i}
                  variant="outline" 
                  size="sm"
                  className="mx-1 bg-green-100 hover:bg-green-200 text-green-800 border-green-300"
                  onClick={() => onPayment && onPayment(warning, warning.amountPerPeriod * i)}
                >
                  {paymentAmount}
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
                  <span className="text-blue-600 cursor-pointer hover:underline">
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
                  {formatCurrency(warning.totalDueAmount)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-center">
                  {formatCurrency(warning.amountPerPeriod)}
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