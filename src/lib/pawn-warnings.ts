import { supabase } from '@/lib/supabase';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { calculateDailyRateForPawn } from '@/lib/interest-calculator';
import { formatCurrency } from '@/lib/utils';

// Enhanced reason filter types
export type PawnReasonFilter = "all" | "today_due" | "tomorrow_due" | "late" | "overdue" | "end_today";

export function categorizePawnReason(reason: string): PawnReasonFilter[] {
  const categories: PawnReasonFilter[] = [];
  
  if (reason.includes("Hôm nay phải đóng")) categories.push("today_due");
  if (reason.includes("Ngày mai đóng")) categories.push("tomorrow_due");
  if (reason.includes("Chậm") && (reason.includes("VND") || reason.includes("₫"))) categories.push("late");
  if (reason.includes("Quá hạn")) categories.push("overdue");
  if (reason.includes("kết thúc hôm nay")) categories.push("end_today");
  
  return categories;
}

/**
 * Calculate unpaid interest amount from first unpaid date to today (inclusive)
 */
export function calculateUnpaidInterestAmount(pawn: any, latestPaidDate: string | null): number {
  const today = new Date().toISOString().split('T')[0];
  const statusCode = pawn.status_code;
  
  // Contract end date calculation
  const contractStart = new Date(pawn.loan_date);
  const contractEnd = new Date(contractStart);
  contractEnd.setDate(contractEnd.getDate() + pawn.loan_period - 1);
  const contractEndStr = contractEnd.toISOString().split('T')[0];
  
  // First unpaid date
  const firstUnpaidDate = latestPaidDate 
    ? new Date(new Date(latestPaidDate).getTime() + 24 * 60 * 60 * 1000) // Day after last paid
    : new Date(pawn.loan_date); // If no payments, start from loan date
  
  // Use same logic as "Lý do" column:
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
  
  const unpaidDays = Math.floor(
    (effectiveEndDate.getTime() - firstUnpaidDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1; // +1 to include end date
  
  if (unpaidDays <= 0) {
    return 0;
  }
  
  // Use the existing interest calculator
  const dailyRate = calculateDailyRateForPawn(pawn);
  const totalUnpaidInterest = Math.round(pawn.loan_amount * dailyRate * unpaidDays);
  
  return totalUnpaidInterest;
}

/**
 * Calculate enhanced pawn reason with late money amount
 */
function calculatePawnReason(pawn: any, latestPaidDate?: string | null): string {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  // Contract end date calculation
  const contractStart = new Date(pawn.loan_date);
  const contractEnd = new Date(contractStart);
  contractEnd.setDate(contractEnd.getDate() + pawn.loan_period - 1);
  const contractEndStr = contractEnd.toISOString().split('T')[0];
  
  const nextPaymentDate = pawn.next_payment_date;
  const statusCode = pawn.status_code;
  
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
      const unpaidDays = Math.floor(
        (effectiveEndDate.getTime() - firstUnpaidDate.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1; // +1 to include end date
      
      if (unpaidDays > 0) {
        // Use existing interest calculator for accurate calculation
        const dailyRate = calculateDailyRateForPawn(pawn);
        const lateAmount = Math.round(pawn.loan_amount * dailyRate * unpaidDays);
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

    // Use pawns_by_store view to get status_code directly
    const { data: pawns, error: pawnsError } = await supabase
      .from('pawns_by_store')
      .select('id, status_code')
      .eq('store_id', storeId)
      .in('status_code', ['OVERDUE', 'LATE_INTEREST']);

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

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    let pawns: any[] = [];
    let pawnsError: any = null;

    // Use RPC for Vietnamese unaccented search when customer filter is provided
    if (customerFilter.trim()) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('search_pawns_unaccent', {
        p_customer_name: customerFilter,
        p_contract_code: '',
        p_start_date: null,
        p_end_date: null,
        p_duration: null,
        p_status: null, // Get all statuses, filter on client side
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