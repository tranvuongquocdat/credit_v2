'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { PawnPaymentPeriod } from '@/models/pawn-payment';
import { getPawnPaymentPeriods } from '@/lib/pawn-payment';
import { calculatePawnInterestAmount } from '@/lib/interest-calculator';
import { Button } from '@/components/ui/button';
import { Eye, MessageCircle, FileText } from 'lucide-react';

interface PawnWarning {
  pawn: PawnWithCustomerAndCollateral;
  totalDueAmount: number;
  daysPastDue: number;
  reason: string;
  contractEndDate: Date;
  isOverdueContract: boolean;
}

interface PawnWarningsTableProps {
  pawns: PawnWithCustomerAndCollateral[];
  loading: boolean;
  statusMap: Record<string, { label: string; color: string }>;
  onViewDetail: (pawn: PawnWithCustomerAndCollateral) => void;
}

export function PawnWarningsTable({
  pawns,
  loading,
  statusMap,
  onViewDetail
}: PawnWarningsTableProps) {
  const [warnings, setWarnings] = useState<PawnWarning[]>([]);
  const [processingWarnings, setProcessingWarnings] = useState(false);

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  // Format date
  const formatDate = (date: Date): string => {
    return format(date, 'dd/MM/yyyy', { locale: vi });
  };

  // Calculate warnings for all pawns
  useEffect(() => {
    async function processWarnings() {
      if (!pawns.length) {
        setWarnings([]);
        return;
      }

      setProcessingWarnings(true);
      const warningResults: PawnWarning[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const pawn of pawns) {
        try {
          // Calculate contract end date
          const loanDate = new Date(pawn.loan_date);
          loanDate.setHours(0, 0, 0, 0);
          const contractEndDate = new Date(loanDate);
          contractEndDate.setDate(loanDate.getDate() + pawn.loan_period - 1);
          contractEndDate.setHours(0, 0, 0, 0);

          // Check if contract is overdue (today >= contract end date)
          const isOverdueContract = today >= contractEndDate;

          // Get payment periods for this pawn
          const { data: paymentPeriods, error } = await getPawnPaymentPeriods(pawn.id);
          
          if (error) {
            console.error(`Error fetching payment periods for pawn ${pawn.id}:`, error);
            continue;
          }

          let totalDueAmount = 0;
          let daysPastDue = 0;
          let reason = '';

          if (!paymentPeriods || paymentPeriods.length === 0) {
            // No payment periods - calculate from loan start to today
            const daysSinceLoan = Math.floor((today.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            
            if (daysSinceLoan > 0) {
              // Calculate total interest owed from start to today
              totalDueAmount = calculatePawnInterestAmount(pawn, daysSinceLoan);
              
              // For contracts without payment periods, consider overdue if past interest period
              const interestPeriod = pawn.interest_period || 30;
              if (daysSinceLoan > interestPeriod) {
                daysPastDue = daysSinceLoan - interestPeriod;
                reason = `Tiền lãi và chậm lãi ${daysPastDue} ngày !`;
                
                if (isOverdueContract) {
                  reason += ' (Chậm gốc)';
                }
              } else if (isOverdueContract) {
                daysPastDue = Math.floor((today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24));
                reason = `Tiền lãi và chậm gốc ${daysPastDue} ngày !`;
              }
            }
          } else {
            // Has payment periods - calculate based on unpaid periods and overdue amounts
            let totalExpected = 0;
            let totalPaid = 0;
            let latestPeriodEndDate = loanDate;

            // Calculate total expected vs paid from all periods
            for (const period of paymentPeriods) {
              totalExpected += period.expected_amount || 0;
              totalPaid += period.actual_amount || 0;
              
              const periodEndDate = new Date(period.end_date);
              if (periodEndDate > latestPeriodEndDate) {
                latestPeriodEndDate = periodEndDate;
              }
            }

            // Calculate unpaid amount from periods
            const unpaidFromPeriods = Math.max(0, totalExpected - totalPaid);

            // Calculate additional interest from after last period to today
            let additionalInterest = 0;
            const dayAfterLastPeriod = new Date(latestPeriodEndDate);
            dayAfterLastPeriod.setDate(latestPeriodEndDate.getDate() + 1);
            dayAfterLastPeriod.setHours(0, 0, 0, 0);

            if (today >= dayAfterLastPeriod) {
              const daysAfterLastPeriod = Math.floor((today.getTime() - dayAfterLastPeriod.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              if (daysAfterLastPeriod > 0) {
                additionalInterest = calculatePawnInterestAmount(pawn, daysAfterLastPeriod);
              }
            }

            totalDueAmount = unpaidFromPeriods + additionalInterest;

            // Determine if there are overdue payments
            const hasOverduePayments = paymentPeriods.some(period => {
              const periodEndDate = new Date(period.end_date);
              periodEndDate.setHours(0, 0, 0, 0);
              const isPaid = (period.actual_amount || 0) >= (period.expected_amount || 0);
              return !isPaid && today > periodEndDate;
            });

            // Calculate days past due
            if (hasOverduePayments || additionalInterest > 0) {
              // Find the earliest overdue period
              let earliestOverdueDate = today;
              
              for (const period of paymentPeriods) {
                const periodEndDate = new Date(period.end_date);
                periodEndDate.setHours(0, 0, 0, 0);
                const isPaid = (period.actual_amount || 0) >= (period.expected_amount || 0);
                
                if (!isPaid && today > periodEndDate && periodEndDate < earliestOverdueDate) {
                  earliestOverdueDate = periodEndDate;
                }
              }

              // If no overdue periods but additional interest, use day after last period
              if (earliestOverdueDate === today && additionalInterest > 0) {
                earliestOverdueDate = dayAfterLastPeriod;
              }

              daysPastDue = Math.floor((today.getTime() - earliestOverdueDate.getTime()) / (1000 * 60 * 60 * 24));
              
              if (daysPastDue > 0) {
                reason = `Tiền lãi và chậm lãi ${daysPastDue} ngày !`;
                
                if (isOverdueContract) {
                  reason += ' (Chậm gốc)';
                }
              }
            } else if (isOverdueContract) {
              // Contract is overdue but no late interest
              daysPastDue = Math.floor((today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24));
              reason = `Chậm gốc ${daysPastDue} ngày !`;
            }
          }

          // Only add to warnings if there's actually an amount due or contract is overdue
          if (totalDueAmount > 0 || isOverdueContract) {
            warningResults.push({
              pawn,
              totalDueAmount,
              daysPastDue,
              reason: reason || 'Cần kiểm tra',
              contractEndDate,
              isOverdueContract
            });
          }

        } catch (error) {
          console.error(`Error processing pawn ${pawn.id}:`, error);
        }
      }

      // Sort by total due amount (highest first)
      warningResults.sort((a, b) => b.totalDueAmount - a.totalDueAmount);
      
      setWarnings(warningResults);
      setProcessingWarnings(false);
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
      <div className="text-center py-10">
        <p className="text-gray-500">Không có hợp đồng cầm đồ nào cần cảnh báo</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Summary row */}
      <div className="bg-yellow-50 p-3 border-b">
        <div className="flex justify-between items-center">
          <span className="font-medium">Tổng Tiền</span>
          <div className="flex gap-8">
            <span className="text-red-600 font-medium">
              {formatCurrency(warnings.reduce((sum, w) => sum + w.totalDueAmount, 0))}
            </span>
            <span className="text-green-600 font-medium">0</span>
          </div>
        </div>
      </div>

      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-100">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-12 text-center">#</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Mã HĐ</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Tên khách hàng</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Số điện thoại</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Địa chỉ</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Mã tài sản</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Tên tài sản</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nợ cũ</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Tiền lãi phí</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Tiền gốc</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Tổng tiền</th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Lý do</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {warnings.map((warning, index) => (
            <tr key={warning.pawn.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-700 text-center">{index + 1}</td>
              <td className="px-4 py-3 text-sm text-gray-700">
                <span className="text-blue-600 font-medium">
                  {warning.pawn.contract_code || 'N/A'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                <span className="text-red-600 font-medium">
                  {warning.pawn.customer?.name || 'N/A'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {warning.pawn.phone || warning.pawn.customer?.phone || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {warning.pawn.address || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {warning.pawn.collateral_asset?.code || 'N/A'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {warning.pawn.collateral_asset?.name || warning.pawn.collateral_detail || 'N/A'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 text-right">0</td>
              <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                {formatCurrency(warning.totalDueAmount)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                {formatCurrency(warning.pawn.loan_amount)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                {formatCurrency(warning.totalDueAmount + warning.pawn.loan_amount)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-red-600">{warning.reason}</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewDetail(warning.pawn)}
                      className="h-6 w-6 p-0"
                      title="Xem chi tiết"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0"
                      title="Gửi tin nhắn"
                    >
                      <MessageCircle className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0"
                      title="In hợp đồng"
                    >
                      <FileText className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 