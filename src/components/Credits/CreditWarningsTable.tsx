import { CreditWithCustomer, CreditStatus } from "@/models/credit";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { useEffect, useState } from "react";
import { CreditPaymentPeriod } from "@/models/credit-payment";
import { getCreditPaymentPeriods } from "@/lib/credit-payment";
import { AlertTriangleIcon } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";

// Extended interface with warning-specific fields
interface CreditWarning extends CreditWithCustomer {
  payments?: CreditPaymentPeriod[];
  latestPeriod?: CreditPaymentPeriod;
  latePeriods: number;
  totalDueAmount: number;
  buttonValues: number[];
}

interface CreditWarningsTableProps {
  credits: CreditWithCustomer[];
  isLoading: boolean;
  onPayment?: (credit: CreditWithCustomer, amount: number) => void;
}

export function CreditWarningsTable({
  credits,
  isLoading,
  onPayment,
}: CreditWarningsTableProps) {
  // State for storing processed warnings
  const [warnings, setWarnings] = useState<CreditWarning[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  
  // Get current store from store context
  const { currentStore } = useStore();
  
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
        
        // Process each credit
        for (const credit of filteredCredits) {
          // Skip closed or deleted contracts
          if (credit.status === CreditStatus.CLOSED || 
              credit.status === CreditStatus.DELETED) {
            continue;
          }
          
          // Get payment periods for this credit
          const { data, error } = await getCreditPaymentPeriods(credit.id);
          
          if (error) {
            console.error(`Error loading payment data for credit ${credit.id}:`, error);
            continue;
          }
          
          // Check if there are no payment periods recorded
          if (!data || data.length === 0) {
            // For contracts with no payment records, check if they're past due based on start date
            const loanDate = new Date(credit.loan_date);
            // Reset time part of loanDate to 00:00:00
            loanDate.setHours(0, 0, 0, 0);
            const loanEndDate = new Date(credit.loan_date);
            loanEndDate.setDate(loanEndDate.getDate() + credit.loan_period - 1);
            loanEndDate.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Get interest period (default to 10 if not set)
            const interestPeriod = credit.interest_period || 10;
            
            // If the loan date is in the future, skip this contract
            if (loanDate > today) {
              continue;
            }
            
            // Calculate days since loan date to today
            const daysSinceStart = loanEndDate > today ? Math.floor((today.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24) + 1) : Math.floor((loanEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) + 1);
            
            // If at least one interest period has passed
            if (daysSinceStart >= interestPeriod) {
              // Calculate number of late periods
              const latePeriods = Math.floor(daysSinceStart / interestPeriod);
              
              // Calculate interest per period based on loan amount and interest value
              let interestPerPeriod = 0;
              
              // Using different calculation based on interest_ui_type and interest_notation
              if (credit.interest_ui_type === 'daily' && credit.interest_notation === 'k_per_million') {
                // daily interest in k per million
                interestPerPeriod = (credit.loan_amount / 1000000) * credit.interest_value * interestPeriod;
              } else if (credit.interest_ui_type === 'monthly_30' || credit.interest_ui_type === 'monthly_custom') {
                // monthly interest in percentage
                interestPerPeriod = (credit.loan_amount * credit.interest_value / 100) * (interestPeriod / 30);
              } else if (credit.interest_ui_type === 'weekly_percent') {
                // weekly interest in percentage
                interestPerPeriod = (credit.loan_amount * credit.interest_value / 100) * (interestPeriod / 7);
              } else if (credit.interest_ui_type === 'weekly_k') {
                // fixed weekly amount in k
                interestPerPeriod = credit.interest_value * 1000 * (interestPeriod / 7);
              }
              
              // Calculate button values for quick payment
              const buttonValues: number[] = [];
              let periodAmount = 0;
              
              for (let i = 0; i < latePeriods; i++) {
                periodAmount += interestPerPeriod;
                buttonValues.push(periodAmount);
              }
              
              // Add to warnings - using contract start date
              warningResults.push({
                ...credit,
                payments: [],
                latePeriods,
                buttonValues,
                totalDueAmount: 0 // No old debt for new contracts
              });
            }
            
            // Skip to next credit
            continue;
          }
          
          // Process credits that have payment periods
          // Find the latest period (highest period number)
          const sortedData = [...data].sort((a, b) => b.period_number - a.period_number);
          const latestPeriod = sortedData[0];
          
          // Parse the end date (format could be YYYY-MM-DD or DD/MM/YYYY)
          let endDate: Date;
          if (latestPeriod.end_date.includes('-')) {
            // Parse YYYY-MM-DD format
            endDate = new Date(latestPeriod.end_date);
          } else if (latestPeriod.end_date.includes('/')) {
            // Parse DD/MM/YYYY format
            const [day, month, year] = latestPeriod.end_date.split('/').map(Number);
            endDate = new Date(year, month - 1, day);
          } else {
            // Fallback to today
            endDate = new Date();
          }
          
          // Check if this period is overdue
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (endDate < today) {
            // Calculate the day after the end date
            const nextDay = new Date(endDate);
            nextDay.setDate(endDate.getDate() + 1);
            
            // Calculate days between next day and today
            const daysDifference = Math.floor((today.getTime() - nextDay.getTime()) / (1000 * 60 * 60 * 24) + 1);
            
            // Get interest period (default to 10 if not set)
            const interestPeriod = credit.interest_period || 10;
            
            // Calculate interest per period based on loan amount and interest value
            let interestPerPeriod = 0;
            
            // Using different calculation based on interest_ui_type and interest_notation
            if (credit.interest_ui_type === 'daily' && credit.interest_notation === 'k_per_million') {
              // daily interest in k per million
              interestPerPeriod = (credit.loan_amount / 1000000) * credit.interest_value * interestPeriod;
            } else if (credit.interest_ui_type === 'monthly_30' || credit.interest_ui_type === 'monthly_custom') {
              // monthly interest in percentage
              interestPerPeriod = (credit.loan_amount * credit.interest_value / 100) * (interestPeriod / 30);
            } else if (credit.interest_ui_type === 'weekly_percent') {
              // weekly interest in percentage
              interestPerPeriod = (credit.loan_amount * credit.interest_value / 100) * (interestPeriod / 7);
            } else if (credit.interest_ui_type === 'weekly_k') {
              // fixed weekly amount in k
              interestPerPeriod = credit.interest_value * 1000 * (interestPeriod / 7);
            }
            
            // Calculate number of late periods
            const latePeriods = Math.ceil(daysDifference / interestPeriod);
            
            // Calculate button values for quick payment
            const buttonValues: number[] = [];
            let periodAmount = 0;
            
            for (let i = 0; i < latePeriods; i++) {
              periodAmount += interestPerPeriod;
              buttonValues.push(periodAmount);
            }
            
            // Calculate total due amount from previous periods
            let totalDueAmount = 0;
            
            data.forEach(period => {
              const expectedAmount = period.expected_amount || 0;
              const actualAmount = period.actual_amount || 0;
              const difference = expectedAmount - actualAmount;
              
              // Only add positive differences (where expected > actual)
              if (difference > 0) {
                totalDueAmount += difference;
              }
            });
            
            // Add to warnings
            warningResults.push({
              ...credit,
              payments: data,
              latestPeriod,
              latePeriods,
              buttonValues,
              totalDueAmount
            });
          }
        }
        
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
                  <span className="text-blue-600 cursor-pointer hover:underline">
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