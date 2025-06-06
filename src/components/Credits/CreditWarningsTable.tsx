import { CreditWithCustomer, CreditStatus } from "@/models/credit";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { useEffect, useState } from "react";
import { AlertTriangleIcon, DollarSignIcon } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { useRouter } from "next/navigation";
import { getCreditPaymentHistory } from "@/lib/Credits/payment_history";
import { getExpectedMoney } from "@/lib/Credits/get_expected_money";
import { calculateDebtToLatestPaidPeriod } from "@/lib/Credits/calculate_remaining_debt";

// Extended interface with warning-specific fields
interface CreditWarning extends CreditWithCustomer {
  latePeriods: number;
  totalDueAmount: number;
  oldDebt: number;
  interestAmount: number;
  daysPastDue: number;
  reason: string;
}

interface CreditWarningsTableProps {
  credits: CreditWithCustomer[];
  isLoading: boolean;
  onPayment?: (credit: CreditWithCustomer, amount: number) => void;
  onCustomerClick?: (credit: CreditWithCustomer) => void; // Optional callback for customer click
  onShowPaymentHistory?: (credit: CreditWithCustomer) => void;
}

export function CreditWarningsTable({
  credits,
  isLoading,
  onPayment,
  onCustomerClick,
  onShowPaymentHistory,
}: CreditWarningsTableProps) {
  // State for storing processed warnings
  const [warnings, setWarnings] = useState<CreditWarning[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  
  // Get current store from store context
  const { currentStore } = useStore();
  
  // Router for navigation
  const router = useRouter();
  
  // Handle customer name click
  const handleCustomerClick = (warning: CreditWarning) => {
    if (onCustomerClick) {
      // Use callback if provided
      onCustomerClick(warning);
    } else {
      // Default behavior: redirect to credits page with contract filter
      router.push(`/credits?contract=${warning.contract_code}`);
    }
  };
  
  // Process credits to identify warnings
  useEffect(() => {
    async function processWarnings() {
      if (!credits.length) return;
      
      setLoadingPayments(true);
      
      try {
        // Filter credits by current store if available
        const filteredCredits = currentStore ? 
          credits.filter(credit => credit.store_id === currentStore.id) : 
          credits;
        
        const warningResults: CreditWarning[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Process each credit
        for (const credit of filteredCredits) {
          try {
            // Skip closed or deleted contracts
            if (credit.status === CreditStatus.CLOSED || 
                credit.status === CreditStatus.DELETED) {
              continue;
            }
            
            // Calculate contract dates
            const loanDate = new Date(credit.loan_date);
            loanDate.setHours(0, 0, 0, 0);
            const contractEndDate = new Date(loanDate);
            contractEndDate.setDate(loanDate.getDate() + credit.loan_period - 1);
            contractEndDate.setHours(0, 0, 0, 0);

            // Check if contract is overdue (today > contract end date)
            const isContractOverdue = today > contractEndDate;

            // Get payment history for this credit
            const paymentHistory = await getCreditPaymentHistory(credit.id);
            
            // Get expected money (daily amounts)
            const dailyAmounts = await getExpectedMoney(credit.id);
            
            // Calculate old debt using existing function
            const oldDebt = await calculateDebtToLatestPaidPeriod(credit.id);

            let interestAmount = 0;
            let daysPastDue = 0;
            let latePeriods = 0;
            let reason = '';

            // Get interest period (default to 10 days for credits)
            const interestPeriod = credit.interest_period || 10;

            if (!paymentHistory || paymentHistory.length === 0) {
              // No payment history - calculate from loan start to today
              const daysSinceLoan = Math.floor((today.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              
              if (daysSinceLoan > 0) {
                // Calculate total interest owed from start to today
                interestAmount = dailyAmounts.slice(0, daysSinceLoan).reduce((sum, amount) => sum + amount, 0);
                
                // Calculate late periods up to today or contract end date (whichever is earlier)
                const endDateForCalculation = isContractOverdue ? contractEndDate : today;
                const daysForPeriodCalculation = Math.floor((endDateForCalculation.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                
                if (daysForPeriodCalculation > 0) {
                  latePeriods = Math.floor(daysForPeriodCalculation / interestPeriod);
                  
                  if (latePeriods > 0) {
                    reason = `Chậm ${latePeriods} kỳ`;
                  }
                  
                  // Add overdue days if contract has ended
                  if (isContractOverdue) {
                    const contractOverdueDays = Math.floor((today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (contractOverdueDays > 0) {
                      reason += reason ? ` + Quá hạn ${contractOverdueDays} ngày` : `Quá hạn ${contractOverdueDays} ngày`;
                    }
                  }
                }
              }
            } else {
              // Has payment history - find latest payment date
              const sortedPayments = [...paymentHistory].sort((a, b) => 
                new Date(b.effective_date || '').getTime() - new Date(a.effective_date || '').getTime()
              );
              
              const latestPayment = sortedPayments[0];
              const latestPaymentDate = new Date(latestPayment.effective_date || loanDate);
              latestPaymentDate.setHours(0, 0, 0, 0);

              // Calculate days since latest payment to today or contract end date (whichever is earlier)
              const endDateForCalculation = isContractOverdue ? contractEndDate : today;
              const daysSinceLastPayment = Math.floor((endDateForCalculation.getTime() - latestPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
              
              if (daysSinceLastPayment > 0) {
                // Calculate late periods from last payment
                latePeriods = Math.floor(daysSinceLastPayment / interestPeriod);
                
                // Calculate interest from day after last payment to today
                const dayAfterLastPayment = new Date(latestPaymentDate);
                dayAfterLastPayment.setDate(latestPaymentDate.getDate() + 1);
                const daysToCalculate = Math.floor((today.getTime() - dayAfterLastPayment.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                
                if (daysToCalculate > 0 && dailyAmounts.length > 0) {
                  // Use last day's interest rate for calculation beyond contract period
                  const dailyRate = dailyAmounts[dailyAmounts.length - 1] || 0;
                  interestAmount = dailyRate * daysToCalculate;
                }
                
                if (latePeriods > 0) {
                  reason = `Chậm ${latePeriods} kỳ`;
                }
                
                // Add overdue days if contract has ended
                if (isContractOverdue) {
                  const contractOverdueDays = Math.floor((today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24));
                  if (contractOverdueDays > 0) {
                    reason += reason ? ` + Quá hạn ${contractOverdueDays} ngày` : `Quá hạn ${contractOverdueDays} ngày`;
                  }
                }
              }
            }

            // Only add to warnings if there's actually an overdue situation
            if (daysPastDue > 0 || oldDebt > 0 || interestAmount > 0) {
              warningResults.push({
                ...credit,
                latePeriods,
                totalDueAmount: oldDebt + interestAmount,
                oldDebt,
                interestAmount,
                daysPastDue,
                reason: reason || 'Cần kiểm tra'
              });
            }

          } catch (error) {
            console.error(`Error processing credit ${credit.id}:`, error);
          }
        }
        
        // Sort by total due amount (highest first)
        warningResults.sort((a, b) => b.totalDueAmount - a.totalDueAmount);
        
        setWarnings(warningResults);
      } catch (err) {
        console.error("Error processing credit warnings:", err);
      } finally {
        setLoadingPayments(false);
      }
    }
    
    processWarnings();
  }, [credits, currentStore]);

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
        <p className="text-lg font-medium">Không có cảnh báo hợp đồng vay{currentStore ? ` tại ${currentStore.name}` : ''}</p>
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
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền gốc</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền lãi phí</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Lý do</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm">Thao tác</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {warnings.map((warning, index) => (
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
                {warning.address || ""}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {formatCurrency(warning.oldDebt)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {formatCurrency(warning.loan_amount || 0)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {formatCurrency(warning.interestAmount)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                <span className="text-red-600 font-medium">
                  {warning.reason}
                </span>
              </td>
              <td className="py-3 px-3 text-center">
                <div className="flex flex-wrap justify-center gap-1">
                {onShowPaymentHistory && (
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => onShowPaymentHistory(warning)}
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
      </table>
    </div>
  );
} 