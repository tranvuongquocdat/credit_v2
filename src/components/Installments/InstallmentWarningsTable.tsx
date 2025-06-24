import { InstallmentWithCustomer, InstallmentStatus } from "@/models/installment";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { useEffect, useState } from "react";
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";
import { AlertTriangleIcon } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { useRouter } from "next/navigation";
import { getExpectedMoney } from "@/lib/Installments/get_expected_money";
import { supabase } from "@/lib/supabase";

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

// ================= Helper functions for simplified overdue computation =================
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Trả về số kỳ quá hạn và danh sách số tiền lũy tiến cần đóng cho tối đa 10 kỳ đầu.
 * latePeriods = Math.ceil(unpaidDays / paymentPeriod) nên kỳ cuối (nếu thiếu ngày) vẫn tính.
 */
function getOverdueInfo(
  installment: InstallmentWithCustomer,
  latestPaidDate: Date | null,
  dailyAmounts: number[]
) {
  const paymentPeriod = installment.payment_period || 10;

  // Ngày bắt đầu hợp đồng (index 0 của dailyAmounts)
  const loanStart = new Date(installment.start_date);
  loanStart.setHours(0, 0, 0, 0);

  // Index của ngày đầu tiên CHƯA thanh toán
  const firstUnpaidIdx = latestPaidDate
    ? Math.floor((latestPaidDate.getTime() - loanStart.getTime()) / MS_PER_DAY) + 1
    : 0;

  // Ngày hiệu lực để so sánh (hôm nay hoặc ngày cuối hợp đồng, tuỳ cái nào sớm hơn)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const contractEnd = new Date(loanStart);
  contractEnd.setDate(contractEnd.getDate() + installment.duration - 1);
  contractEnd.setHours(0, 0, 0, 0);
  const effectiveDate = today > contractEnd ? contractEnd : today;

  const lastChkIdx = Math.floor(
    (effectiveDate.getTime() - loanStart.getTime()) / MS_PER_DAY
  );

  // Chưa đến hạn ngày nào
  if (lastChkIdx < firstUnpaidIdx) {
    return { latePeriods: 0, buttonValues: [] as number[] };
  }

  const unpaidDays = lastChkIdx - firstUnpaidIdx + 1;
  const latePeriods = Math.ceil(unpaidDays / paymentPeriod);

  let cumulative = 0;
  const buttonValues: number[] = [];

  for (let p = 0; p < latePeriods && p < 10; p++) {
    const fromIdx = firstUnpaidIdx + p * paymentPeriod;
    const toIdx = Math.min(fromIdx + paymentPeriod - 1, lastChkIdx, dailyAmounts.length - 1);

    if (fromIdx > toIdx) break; // Phòng hờ out-of-range

    const periodAmount = dailyAmounts
      .slice(fromIdx, toIdx + 1)
      .reduce((sum, v) => sum + v, 0);

    cumulative += Math.round(periodAmount);
    buttonValues.push(cumulative);
  }

  return { latePeriods, buttonValues };
}

export function InstallmentWarningsTable({
  installments,
  isLoading,
  onPayment,
  onCustomerClick,
}: InstallmentWarningsTableProps) {
  
  // Debug: Log installments received
  console.log('InstallmentWarningsTable received installments:', installments.length, installments.map(i => i.contract_code));
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
      router.push(`/installments/${warning.contract_code}`);
    }
  };
  
  // Process installments to identify warnings
  useEffect(() => {
    async function processWarnings() {
      if (!installments.length) {
        setWarnings([]); // Clear warnings when no installments
        return;
      }
      
      setLoadingPayments(true);
      setWarnings([]); // Clear old warnings before processing new ones
      
      try {
        const ids = installments.map((i) => i.id);

        /* 1. late periods from overdue stats */
        const { data: lateRows, error: lateErr } = await (supabase as any).rpc('installment_overdue_stats', {
          p_installment_ids: ids,
        });
        if (lateErr) {
          console.error('installment_overdue_stats error:', lateErr);
          return;
        }
        const lateMap = new Map((lateRows as any[]).map((r: any) => [r.installment_id, r.late_periods]));

        /* 2. next unpaid date */
        const { data: nextRows, error: nextErr } = await (supabase as any).rpc('installment_next_unpaid_date', {
          p_installment_ids: ids,
        });
        if (nextErr) {
          console.error('installment_next_unpaid_date error:', nextErr);
          return;
        }
        const nextMap = new Map((nextRows as any[]).map((r: any) => [r.installment_id, r.next_unpaid_date]));

        const warningResults: InstallmentWarning[] = [];
        // Process each installment
        for (const installment of installments) {
          try {
            const nextUnpaidStr = nextMap.get(installment.id) as string | undefined;
            let lastPaidDate: Date | null = null;
            if (nextUnpaidStr) {
              const tmp = new Date(nextUnpaidStr);
              tmp.setDate(tmp.getDate() - 1);
              lastPaidDate = tmp;
            }

            // Calculate daily amount directly instead of querying history
            const dailyAmount = (installment.installment_amount || 0) / installment.duration;

            // Comment out fallback calculation for performance testing
            // const { latePeriods: calcLatePeriods, buttonValues } = getOverdueInfo(
            //   installment,
            //   lastPaidDate,
            //   dailyAmounts
            // );

            const rpcLate = lateMap.get(installment.id) as number | undefined;
            const latePeriods = rpcLate || 0; // Use only RPC result
            
            // Generate button values based on RPC late periods only
            const buttonValues: number[] = [];
            if (latePeriods > 0) {
              const firstUnpaidIdx = lastPaidDate
                ? Math.floor((lastPaidDate.getTime() - new Date(installment.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
                : 0;
              
              const paymentPeriod = installment.payment_period || 10;
              const contractEndIdx = installment.duration - 1; // 0-based index
              let cumulative = 0;
              
              for (let p = 0; p < latePeriods && p < 10; p++) {
                const fromIdx = firstUnpaidIdx + p * paymentPeriod;
                const toIdx = Math.min(fromIdx + paymentPeriod - 1, contractEndIdx);
                
                if (fromIdx <= toIdx && fromIdx <= contractEndIdx) {
                  const daysInPeriod = toIdx - fromIdx + 1;
                  const periodAmount = daysInPeriod * dailyAmount;
                  
                  cumulative += Math.round(periodAmount);
                  buttonValues.push(cumulative);
                }
              }
            }

            if (latePeriods > 0 && buttonValues.length > 0) {
              // Có kỳ quá hạn và có nút thanh toán nhanh
              warningResults.push({
                ...installment,
                payments: [],
                latePeriods,
                buttonValues,
                totalDueAmount: installment.debt_amount || 0
              });
            } else {
              // Chưa đến kỳ phải đóng hoặc đã thanh toán đủ — hiển thị nhưng không có nút
              warningResults.push({
                ...installment,
                payments: [],
                latePeriods: 0,
                buttonValues: [],
                totalDueAmount: 0
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
                  <div className="flex items-center justify-center gap-1">
                    <span 
                      className="text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleCustomerClick(warning)}
                    >
                      {warning.customer?.name || "N/A"}
                    </span>
                    {(warning.customer as any)?.blacklist_reason && (
                      <div className="relative group">
                        <AlertTriangleIcon className="h-4 w-4 text-red-500" />
                        <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                          Khách hàng bị báo xấu
                        </div>
                      </div>
                    )}
                  </div>
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