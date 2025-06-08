'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { Eye, MessageCircle, FileText, AlertTriangleIcon, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { getPawnPaymentHistory } from '@/lib/Pawns/payment_history';
import { getExpectedMoney } from '@/lib/Pawns/get_expected_money';
import { calculateDebtToLatestPaidPeriod } from '@/lib/Pawns/calculate_remaining_debt';
import { calculateActualLoanAmount } from '@/lib/Pawns/calculate_actual_loan_amount';

interface PawnWarning extends PawnWithCustomerAndCollateral {
  latePeriods: number;
  totalDueAmount: number;
  oldDebt: number;
  interestAmount: number;
  daysPastDue: number;
  reason: string;
  actualLoanAmount: number;
}

interface PawnWarningsTableProps {
  pawns: PawnWithCustomerAndCollateral[];
  loading: boolean;
  statusMap: Record<string, { label: string; color: string }>;
  onViewDetail: (pawn: PawnWithCustomerAndCollateral) => void;
  onCustomerClick?: (pawn: PawnWithCustomerAndCollateral) => void;
}

export function PawnWarningsTable({
  pawns,
  loading,
  statusMap,
  onViewDetail,
  onCustomerClick
}: PawnWarningsTableProps) {
  const [warnings, setWarnings] = useState<PawnWarning[]>([]);
  const [processingWarnings, setProcessingWarnings] = useState(false);

  // Process pawns to identify warnings
  useEffect(() => {
    async function processWarnings() {
      if (!pawns.length) {
        setWarnings([]);
        return;
      }

      setProcessingWarnings(true);
      
      try {
        const warningResults: PawnWarning[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const pawn of pawns) {
          try {
            // Skip closed or deleted contracts
            if (pawn.status === PawnStatus.CLOSED || pawn.status === PawnStatus.DELETED) {
              continue;
            }

            // Calculate contract dates
            const loanDate = new Date(pawn.loan_date);
            loanDate.setHours(0, 0, 0, 0);
            const contractEndDate = new Date(loanDate);
            contractEndDate.setDate(loanDate.getDate() + pawn.loan_period - 1);
            contractEndDate.setHours(0, 0, 0, 0);

            // Check if contract is overdue (today > contract end date)
            const isContractOverdue = today > contractEndDate;

            // Get payment history for this pawn
            const paymentHistory = await getPawnPaymentHistory(pawn.id, false);
            
            // Get expected money (daily amounts)
            const dailyAmounts = await getExpectedMoney(pawn.id);
            
            // Calculate old debt using existing function
            const oldDebt = await calculateDebtToLatestPaidPeriod(pawn.id);
            
            // Calculate actual loan amount
            const actualLoanAmount = await calculateActualLoanAmount(pawn.id);

            let interestAmount = 0;
            let daysPastDue = 0;
            let latePeriods = 0;
            let reason = '';

            if (!paymentHistory || paymentHistory.length === 0) {
              // No payment history - calculate from loan start to today
              const daysSinceLoan = Math.floor((today.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              
              if (daysSinceLoan > 0) {
                // Calculate total interest owed from start to today
                interestAmount = dailyAmounts.slice(0, daysSinceLoan).reduce((sum, amount) => sum + amount, 0);
                
                // Get interest period (default to 30 days)
                const interestPeriod = pawn.interest_period || 30;
                
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

              // Get interest period
              const interestPeriod = pawn.interest_period || 30;
              
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
            if (latePeriods > 0 || isContractOverdue || oldDebt > 0) {
              warningResults.push({
                ...pawn,
                latePeriods,
                totalDueAmount: oldDebt + interestAmount,
                oldDebt,
                interestAmount,
                daysPastDue: 0, // Not used in new logic
                reason: reason || 'Cần kiểm tra',
                actualLoanAmount
              });
            }

          } catch (error) {
            console.error(`Error processing pawn ${pawn.id}:`, error);
          }
        }

        // Sort by total due amount (highest first)
        warningResults.sort((a, b) => b.totalDueAmount - a.totalDueAmount);
        
        setWarnings(warningResults);
      } catch (error) {
        console.error('Error processing pawn warnings:', error);
      } finally {
        setProcessingWarnings(false);
      }
    }

    processWarnings();
  }, [pawns]);

  if (loading || processingWarnings) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
      </div>
    );
  }

  if (warnings.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500">
        <AlertTriangleIcon size={40} className="mb-2 text-green-500" />
        <p className="text-lg font-medium">Không có cảnh báo hợp đồng cầm đồ</p>
        <p className="text-sm">Tất cả các hợp đồng đều đang được thanh toán đúng hạn.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Summary row */}
      <div className="bg-yellow-50 p-3 border-b mb-4 rounded-t-md">
        <div className="flex justify-between items-center">
          <span className="font-medium">Tổng số hợp đồng cảnh báo: {warnings.length}</span>
          <div className="flex gap-8">
            <span className="text-red-600 font-medium">
              Tổng nợ: {formatCurrency(warnings.reduce((sum, w) => sum + w.totalDueAmount, 0))}
            </span>
            <span className="text-blue-600 font-medium">
              Tổng gốc: {formatCurrency(warnings.reduce((sum, w) => sum + w.actualLoanAmount, 0))}
            </span>
          </div>
        </div>
      </div>

      <table className="min-w-full divide-y divide-gray-200 border rounded-md">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-10">#</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Mã HĐ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-36">Tên khách hàng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Số điện thoại</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-48">Địa chỉ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Mã tài sản</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Tên tài sản</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Nợ cũ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền lãi phí</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền gốc</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Tổng tiền</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Lý do</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm w-24">Thao tác</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {warnings.map((warning, index) => (
            <tr key={warning.id} className="hover:bg-gray-50 transition-colors text-sm">
              <td className="py-3 px-3 border-r border-gray-200 text-center">{index + 1}</td>
              <td className="py-3 px-3 border-r border-gray-200 font-medium text-center text-blue-600">
                {warning.contract_code || 'N/A'}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                <span 
                  className="text-red-600 font-medium cursor-pointer hover:text-red-800 hover:underline"
                  onClick={() => onCustomerClick?.(warning)}
                  title="Click để xem chi tiết hợp đồng"
                >
                  {warning.customer?.name || 'N/A'}
                </span>
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {warning.customer?.phone || '-'}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {warning.address || '-'}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {warning.collateral_asset?.code || 'N/A'}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {warning.collateral_asset?.name || 
                 (warning.collateral_detail && typeof warning.collateral_detail === 'object' 
                   ? warning.collateral_detail.name 
                   : warning.collateral_detail) || 'N/A'}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center text-red-600">
                {formatCurrency(warning.oldDebt)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center text-red-600">
                {formatCurrency(warning.interestAmount)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center text-red-600">
                {formatCurrency(warning.actualLoanAmount)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center text-red-600 font-medium">
                {formatCurrency(warning.totalDueAmount + warning.actualLoanAmount)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                <span className="text-red-600 font-medium">{warning.reason}</span>
              </td>
              <td className="py-3 px-3 text-center">
                <div className="flex justify-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewDetail(warning)}
                    className="h-8 w-8 p-0"
                    title="Xem chi tiết"
                  >
                    <DollarSign className="h-4 w-4 text-gray-500" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 