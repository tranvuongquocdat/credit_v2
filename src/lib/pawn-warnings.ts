import { supabase } from '@/lib/supabase';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { calculateDailyRateForPawn } from '@/lib/interest-calculator';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';

// Enhanced reason filter types
export type PawnReasonFilter = "all" | "today_due" | "tomorrow_due" | "late" | "overdue";

export function categorizePawnReason(reason: string): PawnReasonFilter[] {
  const categories: PawnReasonFilter[] = [];

  if (reason.includes("Hôm nay phải đóng")) categories.push("today_due");
  if (reason.includes("Ngày mai đóng")) categories.push("tomorrow_due");
  if (reason.includes("Phí thuê") && (reason.includes("VND") || reason.includes("₫"))) categories.push("late");
  if (reason.includes("Quá hạn")) categories.push("overdue");

  return categories;
}

/**
 * Calculate unpaid interest amount from first unpaid date to today (inclusive).
 *
 * - HĐ thường (đóng lãi sau): lãi tích lũy theo từng ngày → loan × dailyRate × unpaidDays
 * - HĐ đóng lãi trước (is_advance_payment): khi tới hạn `lastPaid+1`, khách phải trả
 *   lump-sum cho cả kỳ kế tiếp. Nợ là fixed step, mỗi kỳ chưa đóng = lãi 1 kỳ.
 *   → loan × dailyRate × interestPeriod × cyclesUnpaid
 */
export function calculateUnpaidInterestAmount(pawn: any, latestPaidDate: string | null): number {
  // Local date (giờ VN) thay vì UTC để không lệch 1 ngày từ 0h–7h sáng
  const today = format(new Date(), 'yyyy-MM-dd');
  const statusCode = pawn.status_code;

  // Contract end date calculation
  const contractStart = new Date(pawn.loan_date);
  const contractEnd = new Date(contractStart);
  contractEnd.setDate(contractEnd.getDate() + pawn.loan_period - 1);
  const contractEndStr = format(contractEnd, 'yyyy-MM-dd');

  // First unpaid date
  const firstUnpaidDate = latestPaidDate
    ? new Date(new Date(latestPaidDate).getTime() + 24 * 60 * 60 * 1000) // Day after last paid
    : new Date(pawn.loan_date); // If no payments, start from loan date

  // For OVERDUE: calculate late period only until contract end
  // For LATE_INTEREST: calculate until today
  const effectiveEndDate = statusCode === 'OVERDUE'
    ? new Date(contractEndStr)
    : new Date(today);
  effectiveEndDate.setHours(23, 59, 59, 999);

  // Only calculate if there are unpaid days
  if (effectiveEndDate < firstUnpaidDate) {
    return 0;
  }

  const dailyRate = calculateDailyRateForPawn(pawn);

  // HĐ đóng lãi trước: số kỳ chưa đóng × lãi 1 kỳ (fixed step)
  if (pawn.is_advance_payment) {
    const interestPeriod = pawn.interest_period || 30;
    const daysSinceUnpaid = Math.floor(
      (effectiveEndDate.getTime() - firstUnpaidDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceUnpaid < 0) return 0;
    const cyclesUnpaid = Math.floor(daysSinceUnpaid / interestPeriod) + 1;
    const oneCycleInterest = pawn.loan_amount * dailyRate * interestPeriod;
    return Math.round(cyclesUnpaid * oneCycleInterest);
  }

  // HĐ thường: lãi tích lũy theo ngày
  const unpaidDays = Math.floor(
    (effectiveEndDate.getTime() - firstUnpaidDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1; // +1 to include end date

  if (unpaidDays <= 0) {
    return 0;
  }

  return Math.round(pawn.loan_amount * dailyRate * unpaidDays);
}

/**
 * Calculate enhanced pawn reason with late money amount
 */
function calculatePawnReason(pawn: any, latestPaidDate?: string | null): string {
  // Local date (giờ VN) thay vì UTC để không lệch 1 ngày từ 0h–7h sáng
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
  
  // 2. Check for late interest using actual payment history
  // Calculate from last payment date to capture ALL unpaid periods
  if (statusCode === 'LATE_INTEREST' || statusCode === 'OVERDUE') {
    const loanStartDate = new Date(pawn.loan_date);
    
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
      const dailyRate = calculateDailyRateForPawn(pawn);
      let lateAmount = 0;

      if (pawn.is_advance_payment) {
        // HĐ đóng lãi trước: nợ fixed = lãi 1 kỳ × số kỳ chưa đóng
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
        // HĐ thường (đóng lãi sau): lãi tích lũy theo ngày
        const unpaidDays = Math.floor(
          (effectiveEndDate.getTime() - firstUnpaidDate.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;
        if (unpaidDays > 0) {
          lateAmount = Math.round(pawn.loan_amount * dailyRate * unpaidDays);
        }
      }

      if (lateAmount > 0) {
        reasons.push(`Phí thuê ${formatCurrency(lateAmount)}`);
      }
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

/**
 * Count the number of pawn contracts that have warnings (overdue or late interest)
 */
export async function countPawnWarnings(storeId: string): Promise<{ count: number; error: any }> {
  try {
    if (!storeId) {
      return { count: 0, error: "Không có cửa hàng" };
    }

    // Đồng bộ với getPawnWarnings: tính cả ON_TIME sắp đến hạn (next_payment_date <= tomorrow).
    // Nếu chỉ đếm OVERDUE + LATE_INTEREST, badge sẽ lệch với số hợp đồng hiện trong list.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');

    const { data: pawns, error: pawnsError } = await supabase
      .from('pawns_by_store')
      .select('id, status_code')
      .eq('store_id', storeId)
      .or(`status_code.in.(OVERDUE,LATE_INTEREST),and(status_code.eq.ON_TIME,next_payment_date.lte.${tomorrowStr})`);

    if (pawnsError) {
      console.error('Error fetching pawns for count:', pawnsError);
      return { count: 0, error: pawnsError };
    }

    const warningCount = (pawns || []).length;

    return { count: warningCount, error: null };
  } catch (err) {
    console.error('Error in countPawnWarnings:', err);
    return { count: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export async function getPawnWarnings(
  page: number = 1,
  limit: number = 1000, // Fetch all for client-side filtering like credits
  storeId: string,
  customerFilter: string = '',
) {
  try {
    if (!storeId) {
      return {
        data: [],
        error: 'Không có cửa hàng',
        totalItems: 0,
        totalPages: 0,
      };
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');

    let pawns: any[] = [];
    let pawnsError: any = null;

    // Use RPC for Vietnamese unaccented search when customer filter is provided
    if (customerFilter.trim()) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('search_pawns_unaccent', {
        p_customer_name: customerFilter,
        p_contract_code: '',
        p_start_date: undefined,
        p_end_date: undefined,
        p_duration: undefined,
        p_status: undefined, // Get all statuses, filter on client side
        p_store_id: storeId,
        p_limit: limit,
        p_offset: 0
      });

      if (rpcError) {
        pawnsError = rpcError;
      } else {
        // Transform RPC data to match expected format
        pawns = (rpcData || []).map((item: any) => ({
          ...item,
          customer: {
            name: item.customer_name,
            phone: item.customer_phone,
            address: item.customer_address,
            id_number: item.customer_id_number
          },
          collateral_asset: null // RPC doesn't include collateral, but warnings might not need it
        }));

        // Filter to only warning pawns (same logic as original query)
        pawns = pawns.filter((pawn: any) => 
          pawn.status_code === 'OVERDUE' || 
          pawn.status_code === 'LATE_INTEREST' ||
          (pawn.status_code === 'ON_TIME' && pawn.next_payment_date && pawn.next_payment_date <= tomorrowStr)
        );
      }
    } else {
      // Use regular query when no customer filter
      const pawnsQuery = supabase
        .from('pawns_by_store')
        .select(`
          *,
          customer:customers!inner(*),
          collateral_asset:collaterals(*)
        `)
        .eq('store_id', storeId)
        .or(`status_code.in.(OVERDUE,LATE_INTEREST),and(status_code.eq.ON_TIME,next_payment_date.lte.${tomorrowStr})`)
        .order('created_at', { ascending: false });
      
      const { data: queryPawns, error: queryError } = await pawnsQuery;
      pawns = queryPawns || [];
      pawnsError = queryError;
    }

    if (pawnsError) {
      console.error('Error fetching pawns:', pawnsError);
      return { data: [], error: pawnsError, totalItems: 0, totalPages: 0 };
    }

    if (!pawns || pawns.length === 0) {
      return { data: [], error: null, totalItems: 0, totalPages: 0 };
    }

    // Process pawns to add enhanced reasons
    const warningPawns: PawnWithCustomerAndCollateral[] = pawns.map((pawn: any) => ({
      ...pawn,
      reason: calculatePawnReason(pawn, null) // Will be enhanced with actual payment date in frontend
    }));

    // 4. Phân trang
    const totalItems = warningPawns.length;
    const totalPages = Math.ceil(totalItems / limit);
    const offset = (page - 1) * limit;
    const paginated = warningPawns.slice(offset, offset + limit);

    return {
      data: paginated,
      error: null,
      totalItems,
      totalPages,
    };
  } catch (err) {
    console.error('Error in getPawnWarnings:', err);
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Unknown error',
      totalItems: 0,
      totalPages: 0,
    };
  }
} 