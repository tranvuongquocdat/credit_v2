import { supabase } from "@/lib/supabase";
import { CreditWithCustomer } from "@/models/credit";
import { calculateDailyRateForCredit } from "@/lib/interest-calculator";
import { formatCurrency } from "@/lib/utils";

// Enhanced reason filter types
export type CreditReasonFilter = "all" | "today_due" | "tomorrow_due" | "late" | "overdue" | "end_today";

export function categorizeCreditReason(reason: string): CreditReasonFilter[] {
  const categories: CreditReasonFilter[] = [];
  
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
export function calculateUnpaidInterestAmount(credit: any, latestPaidDate: string | null): number {
  const today = new Date().toISOString().split('T')[0];
  const statusCode = credit.status_code;
  
  // Contract end date calculation
  const contractStart = new Date(credit.loan_date);
  const contractEnd = new Date(contractStart);
  contractEnd.setDate(contractEnd.getDate() + credit.loan_period - 1);
  const contractEndStr = contractEnd.toISOString().split('T')[0];
  
  // First unpaid date
  const firstUnpaidDate = latestPaidDate 
    ? new Date(new Date(latestPaidDate).getTime() + 24 * 60 * 60 * 1000) // Day after last paid
    : new Date(credit.loan_date); // If no payments, start from loan date
  
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
  const dailyRate = calculateDailyRateForCredit(credit);
  const totalUnpaidInterest = Math.round(credit.loan_amount * dailyRate * unpaidDays);
  
  return totalUnpaidInterest;
}

/**
 * Calculate enhanced credit reason with late money amount
 */
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
  // Calculate from last payment date to capture ALL unpaid periods
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

/**
 * Count the number of credit contracts that have warnings (overdue or late interest)
 */
export async function countCreditWarnings(storeId: string): Promise<{ count: number; error: any }> {
  try {
    if (!storeId) {
      return { count: 0, error: "Không có cửa hàng" };
    }

    // Use credits_by_store view to get status_code directly
    const { data: credits, error: creditsError } = await supabase
      .from('credits_by_store')
      .select('id, status_code')
      .eq('store_id', storeId)
      .in('status_code', ['OVERDUE', 'LATE_INTEREST']);

    if (creditsError) {
      console.error('Error fetching credits for count:', creditsError);
      return { count: 0, error: creditsError };
    }

    const warningCount = (credits || []).length;

    return { count: warningCount, error: null };
  } catch (err) {
    console.error('Error in countCreditWarnings:', err);
    return { count: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function getCreditWarnings(
  page: number = 1,
  limit: number = 1000, // Fetch all for client-side filtering like installments
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

    let credits: any[] = [];
    let creditsError: any = null;

    // Use RPC for Vietnamese unaccented search when customer filter is provided
    if (customerFilter.trim()) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('search_credits_unaccent', {
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
        creditsError = rpcError;
      } else {
        // Transform RPC data to match expected format
        credits = (rpcData || []).map((item: any) => ({
          ...item,
          customer: {
            name: item.customer_name,
            phone: item.customer_phone,
            address: item.customer_address,
            id_number: item.customer_id_number
          }
        }));

        // Filter to only warning credits (same logic as original query)
        credits = credits.filter((credit: any) => 
          credit.status_code === 'OVERDUE' || 
          credit.status_code === 'LATE_INTEREST' ||
          (credit.status_code === 'ON_TIME' && credit.next_payment_date && credit.next_payment_date <= tomorrowStr)
        );
      }
    } else {
      // Use regular query when no customer filter
      const creditsQuery = supabase
        .from('credits_by_store')
        .select(`
          *,
          customer:customers!inner(*)
        `)
        .eq('store_id', storeId)
        .or(`status_code.in.(OVERDUE,LATE_INTEREST),and(status_code.eq.ON_TIME,next_payment_date.lte.${tomorrowStr})`)
        .order('created_at', { ascending: false });
      
      const { data: queryCredits, error: queryError } = await creditsQuery;
      credits = queryCredits || [];
      creditsError = queryError;
    }

    if (creditsError) {
      console.error('Error fetching credits:', creditsError);
      return { data: [], error: creditsError, totalItems: 0, totalPages: 0 };
    }

    if (!credits || credits.length === 0) {
      return { data: [], error: null, totalItems: 0, totalPages: 0 };
    }

    // Process credits to add enhanced reasons
    const warningCredits: CreditWithCustomer[] = credits.map((credit: any) => ({
      ...credit,
      reason: calculateCreditReason(credit, null) // Will be enhanced with actual payment date in frontend
    }));

    // 4. Phân trang
    const totalItems = warningCredits.length;
    const totalPages = Math.ceil(totalItems / limit);
    const offset = (page - 1) * limit;
    const paginated = warningCredits.slice(offset, offset + limit);

    return {
      data: paginated,
      error: null,
      totalItems,
      totalPages,
    };
  } catch (err) {
    console.error('Error in getCreditWarnings:', err);
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Unknown error',
      totalItems: 0,
      totalPages: 0,
    };
  }
} 