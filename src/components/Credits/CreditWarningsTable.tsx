import { CreditWithCustomer, CreditStatus } from "@/models/credit";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { AlertTriangleIcon, DollarSignIcon } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { useRouter } from "next/navigation";
import { calculateUnpaidInterestAmount } from "@/lib/credit-warnings";
import { calculateDailyRateForCredit } from "@/lib/interest-calculator";

// Import the enhanced reason calculation
function calculateCreditReason(credit: any, latestPaidDate?: string | null): string {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  // Contract end date calculation
  const contractStart = new Date(credit.loan_date);
  const contractEnd = new Date(contractStart);
  contractEnd.setDate(contractEnd.getDate() + credit.loan_period - 1);
  const contractEndStr = contractEnd.toISOString().split('T')[0];
  
  const nextPaymentDate = credit.next_payment_date;
  const statusCode = credit.status_code;
  
  let reasons: string[] = [];
  
  // 1. Check due dates first (can combine with status)
  if (contractEndStr === today) {
    reasons.push("Hợp đồng kết thúc hôm nay");
  }
  
  if (nextPaymentDate === tomorrowStr) {
    reasons.push("Ngày mai đóng lãi");
  } else if (nextPaymentDate === today) {
    reasons.push("Hôm nay phải đóng lãi");
  }
  
  // 2. Check for late interest using actual payment history
  if (statusCode === 'LATE_INTEREST' || statusCode === 'OVERDUE') {
    const loanStartDate = new Date(credit.loan_date);
    
    // First unpaid date: day after last payment OR loan start if no payments
    const firstUnpaidDate = latestPaidDate 
      ? new Date(new Date(latestPaidDate).getTime() + 24 * 60 * 60 * 1000)
      : loanStartDate;
    
    // For OVERDUE: calculate late period only until contract end
    // For LATE_INTEREST: calculate until today
    const effectiveEndDate = statusCode === 'OVERDUE' 
      ? new Date(contractEndStr) 
      : new Date(today);
    effectiveEndDate.setHours(23, 59, 59, 999);
    
    // Only calculate if there are unpaid days
    if (effectiveEndDate >= firstUnpaidDate) {
      const unpaidDays = Math.floor(
        (effectiveEndDate.getTime() - firstUnpaidDate.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1; // +1 to include end date
      
      if (unpaidDays > 0) {
        // Use existing interest calculator for accurate calculation
        const dailyRate = calculateDailyRateForCredit(credit);
        const lateAmount = Math.round(credit.loan_amount * dailyRate * unpaidDays);
        
        reasons.push(`Chậm ${formatCurrency(lateAmount)}`);
      }
    }
  }
  
  // 3. Add status-specific reasons
  switch (statusCode) {
    case 'OVERDUE':
      // Contract completely expired
      const daysOverdue = Math.floor(
        (new Date(today).getTime() - new Date(contractEndStr).getTime()) 
        / (1000 * 60 * 60 * 24)
      );
      reasons.push(`Quá hạn ${daysOverdue} ngày`);
      break;
      
    case 'LATE_INTEREST':
      // Late interest reason already added above
      break;
      
    case 'ON_TIME':
      // Only add if no other reasons were found
      if (reasons.length === 0) {
        return 'Đang vay';
      }
      break;
  }
  
  return reasons.join(' và ') || 'Đang vay';
}

// Extended interface with warning-specific fields
interface CreditWarning extends CreditWithCustomer {
  reason: string;
  totalInterest: number; // From interest calculation
}

interface CreditWarningsTableProps {
  credits: CreditWithCustomer[];
  isLoading: boolean;
  onCustomerClick?: (credit: CreditWithCustomer) => void;
  onShowPaymentHistory?: (credit: CreditWithCustomer) => void;
  creditCalculations?: Record<string, any>; // From useCreditCalculations
}

export function CreditWarningsTable({
  credits,
  isLoading,
  onCustomerClick,
  onShowPaymentHistory,
  creditCalculations,
}: CreditWarningsTableProps) {
  const { currentStore } = useStore();
  const router = useRouter();
  
  // Calculate interest for each credit
  const enhancedCredits: CreditWarning[] = credits.map(credit => {
    const creditDetails = creditCalculations?.[credit.id];
    const latestPaidDate = creditDetails?.latestPaidDate || null;
    
    const totalInterest = calculateUnpaidInterestAmount(credit, latestPaidDate);
    const enhancedReason = calculateCreditReason(credit, latestPaidDate);
    
    return {
      ...credit,
      totalInterest,
      reason: enhancedReason
    };
  });
  
  // Handle customer name click
  const handleCustomerClick = (credit: CreditWarning) => {
    if (onCustomerClick) {
      // Use callback if provided
      onCustomerClick(credit);
    } else {
      // Redirect to credits page with path parameter
      router.push(`/credits/${credit.contract_code}`);
    }
  };

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (enhancedCredits.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500">
        <AlertTriangleIcon size={40} className="mb-2 text-green-500" />
        <p className="text-lg font-medium">Không có cảnh báo hợp đồng vay{currentStore ? ` tại ${currentStore.name}` : ''}</p>
        <p className="text-sm">Tất cả các hợp đồng đều đang được thanh toán đúng hạn.</p>
      </div>
    );
  }

  // Calculate totals
  const totals = enhancedCredits.reduce((acc, credit) => {
    acc.totalPrincipal += credit.loan_amount || 0;
    acc.totalInterest += credit.totalInterest || 0;
    acc.totalAmount += (credit.loan_amount || 0) + (credit.totalInterest || 0);
    return acc;
  }, {
    totalPrincipal: 0,
    totalInterest: 0,
    totalAmount: 0
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-10 hidden lg:table-cell">#</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28 hidden lg:table-cell">Mã hợp đồng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-36">Tên khách hàng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28 hidden lg:table-cell">Số điện thoại</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-48 hidden lg:table-cell">Địa chỉ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền gốc</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tổng tiền lãi</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tổng tiền</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Lý do</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm">Thao tác</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {enhancedCredits.map((credit, index) => (
            <tr key={credit.id} className="hover:bg-gray-50 transition-colors text-sm">
              <td className="py-3 px-3 border-r border-gray-200 text-center hidden lg:table-cell">{index + 1}</td>
              <td className="py-3 px-3 border-r border-gray-200 font-medium text-center hidden lg:table-cell">
                {credit.contract_code}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                <span 
                  className="text-blue-600 cursor-pointer hover:underline"
                  onClick={() => handleCustomerClick(credit)}
                >
                  {credit.customer?.name || "N/A"}
                </span>
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center hidden lg:table-cell">
                {credit.customer?.phone || ""}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center hidden lg:table-cell">
                {credit.address || ""}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {formatCurrency(credit.loan_amount || 0)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {formatCurrency(credit.totalInterest || 0)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                <span className="font-medium text-red-600">
                  {formatCurrency((credit.loan_amount || 0) + (credit.totalInterest || 0))}
                </span>
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                <span className="text-orange-600 font-medium">
                  {credit.reason}
                </span>
              </td>
              <td className="py-3 px-3 text-center">
                <div className="flex flex-wrap justify-center gap-1">
                {onShowPaymentHistory && (
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => onShowPaymentHistory(credit)}
                      title="Lịch sử thanh toán"
                    >
                      <DollarSignIcon className="h-4 w-4 text-gray-500" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-yellow-200 font-semibold">
          <tr>
            <td colSpan={5} className="py-2 px-3 text-center font-bold border-r border-t border-gray-200 hidden lg:table-cell">
              Tổng
            </td>
            <td className="py-2 px-3 text-center font-bold border-r border-t border-gray-200 lg:hidden">
              Tổng
            </td>
            <td className="py-2 px-3 text-center font-bold border-r border-t border-gray-200">
              <span className="text-rose-600">
                {formatCurrency(totals.totalPrincipal)}
              </span>
            </td>
            <td className="py-2 px-3 text-center font-bold border-r border-t border-gray-200">
              <span className="text-rose-600">
                {formatCurrency(totals.totalInterest)}
              </span>
            </td>
            <td className="py-2 px-3 text-center font-bold border-r border-t border-gray-200">
              <span className="text-red-600 font-bold">
                {formatCurrency(totals.totalAmount)}
              </span>
            </td>
            <td colSpan={2} className="py-2 px-3 text-center border-t border-gray-200">
              <span className="text-gray-600 font-medium">
                {enhancedCredits.length} hợp đồng
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
} 