'use client';

import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { AlertTriangleIcon, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useStore } from '@/contexts/StoreContext';
import { useRouter } from 'next/navigation';
import { calculateUnpaidInterestAmount } from '@/lib/pawn-warnings';
import { calculateDailyRateForPawn } from '@/lib/interest-calculator';
import Spinner from '@/components/ui/spinner';
import { format } from 'date-fns';

// Import the enhanced reason calculation
// overrideLateAmount: nếu được truyền, dùng để in "Phí thuê N" thay vì tự tính theo công thức
// đơn giản (loan × dailyRate × số ngày). Mục đích: khớp với giá trị cột "Tiền phí thuê".
function calculatePawnReason(pawn: any, latestPaidDate?: string | null, overrideLateAmount?: number): string {
  // Dùng local date (giờ VN) thay vì toISOString() (UTC) để tránh lệch 1 ngày từ 0h–7h sáng
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');

  // Contract end date calculation
  const contractStart = new Date(pawn.loan_date);
  const contractEnd = new Date(contractStart);
  contractEnd.setDate(contractEnd.getDate() + pawn.loan_period - 1);
  const contractEndStr = format(contractEnd, 'yyyy-MM-dd');
  
  const nextPaymentDate = pawn.next_payment_date;
  const statusCode = pawn.status_code;
  
  let reasons: string[] = [];

  // 1. Check due dates (pawn không có "kết thúc HĐ" thực sự — chỉ có hết kỳ lãi)
  if (nextPaymentDate === tomorrowStr) {
    reasons.push("Ngày mai đóng lãi");
  } else if (nextPaymentDate === today) {
    reasons.push("Hôm nay phải đóng lãi");
  }
  
  // 2. Phí thuê còn nợ: ưu tiên dùng overrideLateAmount (= cột Tiền phí thuê) để khớp.
  // Fallback về công thức đơn giản nếu chưa có (data chưa load).
  if (statusCode === 'LATE_INTEREST' || statusCode === 'OVERDUE') {
    let lateAmount = overrideLateAmount ?? 0;

    if (overrideLateAmount === undefined) {
      const loanStartDate = new Date(pawn.loan_date);
      const firstUnpaidDate = latestPaidDate
        ? new Date(new Date(latestPaidDate).getTime() + 24 * 60 * 60 * 1000)
        : loanStartDate;
      const effectiveEndDate = statusCode === 'OVERDUE'
        ? new Date(contractEndStr)
        : new Date(today);
      effectiveEndDate.setHours(23, 59, 59, 999);

      if (effectiveEndDate >= firstUnpaidDate) {
        const dailyRate = calculateDailyRateForPawn(pawn);

        if (pawn.is_advance_payment) {
          const interestPeriod = pawn.interest_period || 30;
          const daysSinceUnpaid = Math.floor(
            (effectiveEndDate.getTime() - firstUnpaidDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceUnpaid >= 0) {
            const cyclesUnpaid = Math.floor(daysSinceUnpaid / interestPeriod) + 1;
            const oneCycleInterest = pawn.loan_amount * dailyRate * interestPeriod;
            lateAmount = Math.round(cyclesUnpaid * oneCycleInterest);
          }
        } else {
          const unpaidDays = Math.floor(
            (effectiveEndDate.getTime() - firstUnpaidDate.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1;
          if (unpaidDays > 0) {
            lateAmount = Math.round(pawn.loan_amount * dailyRate * unpaidDays);
          }
        }
      }
    }

    if (lateAmount > 0) {
      reasons.push(`Phí thuê ${formatCurrency(lateAmount)}`);
    }
  }
  
  // 3. Add status-specific reasons
  switch (statusCode) {
    case 'OVERDUE':
      // Quá hạn = số ngày từ kỳ lãi cuối đã đóng (hoặc ngày vay) tới hôm nay,
      // khớp với "(N ngày)" subtitle bên cột Phí thuê đến hôm nay trang Pawn.
      const startRef = latestPaidDate ? new Date(latestPaidDate) : new Date(pawn.loan_date);
      startRef.setHours(0, 0, 0, 0);
      const todayMid = new Date(today);
      todayMid.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor(
        (todayMid.getTime() - startRef.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysOverdue > 0) {
        reasons.push(`Quá hạn ${daysOverdue} ngày`);
      }
      break;
      
    case 'LATE_INTEREST':
      // Late interest reason already added above
      break;
      
    case 'ON_TIME':
      // Only add if no other reasons were found
      if (reasons.length === 0) {
        return 'Đang cầm';
      }
      break;
  }
  
  return reasons.join(' và ') || 'Đang cầm';
}

// Extended interface with warning-specific fields
interface PawnWarning extends PawnWithCustomerAndCollateral {
  reason: string;
  totalInterest: number; // From interest calculation
}

interface PawnWarningsTableProps {
  pawns: PawnWithCustomerAndCollateral[];
  isLoading: boolean;
  onViewDetail: (pawn: PawnWithCustomerAndCollateral) => void;
  onCustomerClick?: (pawn: PawnWithCustomerAndCollateral) => void;
  pawnCalculations?: Record<string, any>; // From usePawnCalculations
  currentPage?: number; // Add pagination props
  itemsPerPage?: number;
}

export function PawnWarningsTable({
  pawns,
  isLoading,
  onViewDetail,
  onCustomerClick,
  pawnCalculations,
  currentPage = 1,
  itemsPerPage = 30,
}: PawnWarningsTableProps) {
  const { currentStore } = useStore();
  const router = useRouter();
  
  // Calculate interest for each pawn
  const enhancedPawns: PawnWarning[] = pawns.map(pawn => {
    const pawnDetails = pawnCalculations?.[pawn.id];
    const latestPaidDate = pawnDetails?.latestPaidDate || null;

    // ON_TIME (mai đóng / hôm nay đóng) là nhắc — chưa nợ, hiện 0đ.
    // LATE_INTEREST / OVERDUE mới có phí thuê còn nợ (= interestToday − paidInterest).
    const isReminderOnly = pawn.status_code === 'ON_TIME';
    const totalInterest = isReminderOnly
      ? 0
      : pawnDetails
        ? Math.max(0, (pawnDetails.interestToday ?? 0) - (pawnDetails.paidInterest ?? 0))
        : calculateUnpaidInterestAmount(pawn, latestPaidDate);

    // Truyền totalInterest vào để "Phí thuê N" trong Lý do khớp với cột Tiền phí thuê
    const enhancedReason = calculatePawnReason(
      pawn,
      latestPaidDate,
      pawnDetails ? totalInterest : undefined
    );

    return {
      ...pawn,
      totalInterest,
      reason: enhancedReason
    };
  });
  
  // Handle customer name click
  const handleCustomerClick = (pawn: PawnWarning) => {
    if (onCustomerClick) {
      // Use callback if provided
      onCustomerClick(pawn);
    } else {
      // Redirect to pawns page with path parameter
      router.push(`/pawns/${pawn.contract_code}`);
    }
  };

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (enhancedPawns.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500">
        <AlertTriangleIcon size={40} className="mb-2 text-green-500" />
        <p className="text-lg font-medium">Không có cảnh báo hợp đồng cầm đồ{currentStore ? ` tại ${currentStore.name}` : ''}</p>
        <p className="text-sm">Tất cả các hợp đồng đều đang được thanh toán đúng hạn.</p>
      </div>
    );
  }

  // Calculate totals
  const totals = enhancedPawns.reduce((acc, pawn) => {
    acc.totalPrincipal += pawn.loan_amount || 0;
    acc.totalInterest += pawn.totalInterest || 0;
    acc.totalAmount += (pawn.loan_amount || 0) + (pawn.totalInterest || 0);
    return acc;
  }, {
    totalPrincipal: 0,
    totalInterest: 0,
    totalAmount: 0
  });

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto max-w-full">
        <table className="border-collapse min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-2 px-1 sm:px-3 text-center font-medium text-gray-500 text-xs sm:text-sm border-r border-gray-200 w-6 sm:w-8">#</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28 hidden lg:table-cell">Mã hợp đồng</th>
            <th className="py-2 px-1 sm:px-3 text-center font-medium text-gray-500 text-xs sm:text-sm border-r border-gray-200 w-24 sm:w-28">Tên KH</th>
            <th className="py-3 px-2 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24 hidden lg:table-cell">SĐT</th>
            <th className="py-3 px-2 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28 hidden lg:table-cell">Địa chỉ</th>
            <th className="py-2 px-1 text-center font-medium text-gray-500 text-xs sm:text-sm border-r border-gray-200 w-10 sm:w-12">SL</th>
            <th className="py-2 px-1 sm:px-3 text-center font-medium text-gray-500 text-xs sm:text-sm border-r border-gray-200 w-20 sm:w-24">Tên TS</th>
            <th className="py-2 px-1 sm:px-3 text-center font-medium text-gray-500 text-xs sm:text-sm border-r border-gray-200 w-14 sm:w-16">Tiền gốc</th>
            <th className="py-2 px-1 sm:px-3 text-center font-medium text-gray-500 text-xs sm:text-sm border-r border-gray-200 w-14 sm:w-16">Tiền phí thuê</th>
            <th className="py-2 px-1 sm:px-3 text-center font-medium text-gray-500 text-xs sm:text-sm border-r border-gray-200 w-16 sm:w-20">Tổng tiền</th>
            <th className="py-2 px-1 sm:px-3 text-center font-medium text-gray-500 text-xs sm:text-sm border-r border-gray-200 w-36 sm:w-44">Lý do</th>
            <th className="py-2 px-1 sm:px-3 text-center font-medium text-gray-500 text-xs sm:text-sm w-12 sm:w-16">Thao tác</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {enhancedPawns.map((pawn, index) => (
            <tr key={pawn.id} className="hover:bg-gray-50 transition-colors text-sm">
              <td className="py-2 px-1 sm:px-3 border-r border-gray-200 text-center text-xs">{(currentPage - 1) * itemsPerPage + index + 1}</td>
              <td className="py-3 px-3 border-r border-gray-200 font-medium text-center hidden lg:table-cell">
                {pawn.contract_code}
              </td>
              <td className="py-2 px-1 sm:px-3 border-r border-gray-200 text-center">
                <span 
                  className="text-blue-600 cursor-pointer hover:underline text-xs sm:text-sm"
                  onClick={() => handleCustomerClick(pawn)}
                >
                  {pawn.customer?.name || "N/A"}
                </span>
              </td>
              <td className="py-3 px-2 border-r border-gray-200 text-center hidden lg:table-cell text-xs truncate" title={pawn.customer?.phone || ""}>
                {pawn.customer?.phone || ""}
              </td>
              <td className="py-3 px-2 border-r border-gray-200 text-center hidden lg:table-cell text-xs truncate" title={pawn.customer?.address || ""}>
                {pawn.customer?.address || ""}
              </td>
              {(() => {
                let detail: { name?: string | null; quantity?: number | null } | null = null;
                const raw = pawn.collateral_detail;
                if (raw) {
                  if (typeof raw === 'string') {
                    try { detail = JSON.parse(raw); } catch { detail = { name: raw }; }
                  } else if (typeof raw === 'object') {
                    detail = raw as any;
                  }
                }
                const qty = detail?.quantity && detail.quantity > 0 ? detail.quantity : (detail?.name ? 1 : null);
                const name = detail?.name || pawn.collateral_asset?.name || 'N/A';
                return (
                  <>
                    <td className="py-2 px-1 border-r border-gray-200 text-center text-xs sm:text-sm">
                      {qty ?? 'N/A'}
                    </td>
                    <td className="py-2 px-1 sm:px-3 border-r border-gray-200 text-center text-xs sm:text-sm">
                      {name}
                    </td>
                  </>
                );
              })()}
              <td className="py-2 px-1 sm:px-3 border-r border-gray-200 text-center text-xs sm:text-sm">
                {formatCurrency(pawn.loan_amount || 0)}
              </td>
              <td className="py-2 px-1 sm:px-3 border-r border-gray-200 text-center text-xs sm:text-sm">
                {formatCurrency(pawn.totalInterest || 0)}
              </td>
              <td className="py-2 px-1 sm:px-3 border-r border-gray-200 text-center">
                <span className="font-medium text-red-600 text-xs sm:text-sm">
                  {formatCurrency((pawn.loan_amount || 0) + (pawn.totalInterest || 0))}
                </span>
              </td>
              <td className="py-2 px-1 sm:px-3 border-r border-gray-200 text-center">
                <span className="text-orange-600 font-medium text-xs sm:text-sm">
                  {pawn.reason}
                </span>
              </td>
              <td className="py-2 px-1 sm:px-3 text-center">
                <div className="flex flex-wrap justify-center gap-1">
                  <Button 
                    variant="ghost" 
                    className="h-6 w-6 sm:h-8 sm:w-8 p-0" 
                    onClick={() => onViewDetail(pawn)}
                    title="Xem chi tiết"
                  >
                    <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-yellow-200 font-semibold">
          <tr>
            <td colSpan={7} className="py-2 px-1 sm:px-3 text-center font-bold border-r border-t border-gray-200 hidden lg:table-cell text-xs sm:text-sm">
              Tổng
            </td>
            <td colSpan={4} className="py-2 px-1 sm:px-3 text-center font-bold border-r border-t border-gray-200 lg:hidden text-xs sm:text-sm">
              Tổng
            </td>
            <td className="py-2 px-1 sm:px-3 text-center font-bold border-r border-t border-gray-200 text-xs sm:text-sm">
              <span className="text-rose-600">
                {formatCurrency(totals.totalPrincipal)}
              </span>
            </td>
            <td className="py-2 px-1 sm:px-3 text-center font-bold border-r border-t border-gray-200 text-xs sm:text-sm">
              <span className="text-rose-600">
                {formatCurrency(totals.totalInterest)}
              </span>
            </td>
            <td className="py-2 px-1 sm:px-3 text-center font-bold border-r border-t border-gray-200 text-xs sm:text-sm">
              <span className="text-red-600 font-bold">
                {formatCurrency(totals.totalAmount)}
              </span>
            </td>
            <td colSpan={2} className="py-2 px-1 sm:px-3 text-center border-t border-gray-200">
              <span className="text-gray-600 font-medium">
                {enhancedPawns.length} hợp đồng
              </span>
            </td>
          </tr>
        </tfoot>
        </table>
      </div>
    </div>
  );
}