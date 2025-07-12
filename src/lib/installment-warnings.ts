import { supabase } from "@/lib/supabase";
import { InstallmentWithCustomer } from "@/models/installment";
import { formatCurrency } from "@/lib/utils";

export type ReasonFilter = 
  | "all" 
  | "today_due" 
  | "tomorrow_due" 
  | "late_periods" 
  | "overdue" 
  | "ending_today";

/**
 * Categorize a reason string into filter categories
 */
export function categorizeReason(reason: string): ReasonFilter[] {
  const categories: ReasonFilter[] = [];
  
  if (reason.includes("Hôm nay phải đóng")) {
    categories.push("today_due");
  }
  if (reason.includes("Ngày mai đóng")) {
    categories.push("tomorrow_due");
  }
  if (reason.includes("Chậm") && reason.includes("kỳ")) {
    categories.push("late_periods");
  }
  if (reason.includes("Quá hạn")) {
    categories.push("overdue");
  }
  if (reason.includes("Hôm nay là kỳ cuối")) {
    categories.push("ending_today");
  }
  
  return categories;
}

/**
 * Calculate reason string for installment warning based on business requirements
 */
export function calculateInstallmentReason(
  installment: InstallmentWithCustomer,
  buttonValues: number[]
): string {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  // Contract end date calculation
  const contractStart = new Date(installment.start_date);
  const contractEnd = new Date(contractStart);
  contractEnd.setDate(contractEnd.getDate() + installment.duration - 1);
  const contractEndStr = contractEnd.toISOString().split('T')[0];
  
  const paymentDueDate = installment.payment_due_date?.split('T')[0]; // Extract date part only
  const paymentPeriod = installment.payment_period || 10;
  
  let reasons: string[] = [];
  
  // SPECIAL CASE: Contract ends today (highest priority - masks all other conditions)
  // Only for ON_TIME contracts
  if (contractEndStr === today && installment.status === 'on_time') {
    return "Hôm nay là kỳ cuối";
  }
  
  // Regular warning cases (only if contract is not ending today)
  
  // 1. Tomorrow due
  if (paymentDueDate === tomorrowStr) {
    reasons.push("Ngày mai đóng");
  }
  
  // 2. Today due  
  else if (paymentDueDate === today) {
    const amount = buttonValues[0] || 0;
    reasons.push(`Hôm nay phải đóng ${formatCurrency(amount)}`);
  }
  
  // 3. Late periods (payment_due_date < today, but only count until contract end)
  else if (paymentDueDate && paymentDueDate < today) {
    // Use the earlier of today or contract end date for late calculation
    const effectiveEndDate = contractEndStr < today ? contractEndStr : today;
    const daysLate = Math.floor(
      (new Date(effectiveEndDate).getTime() - new Date(paymentDueDate).getTime()) 
      / (1000 * 60 * 60 * 24)
    ) + 1; // Add 1 to include today in the count
    
    if (daysLate > 0) {
      const fullPeriods = Math.floor(daysLate / paymentPeriod);
      const remainingDays = daysLate % paymentPeriod;
      
      if (remainingDays > 0) {
        reasons.push(`Chậm ${fullPeriods} kỳ ${remainingDays} ngày`);
      } else if (fullPeriods > 0) {
        reasons.push(`Chậm ${fullPeriods} kỳ`);
      }
    }
  }
  
  // 4. Contract overdue (contract_end < today)
  if (contractEndStr < today) {
    const daysOverdue = Math.floor(
      (new Date(today).getTime() - new Date(contractEndStr).getTime()) 
      / (1000 * 60 * 60 * 24)
    ) + 1; // Add 1 to include today in the count
    reasons.push(`Quá hạn ${daysOverdue} ngày`);
  }
  
  // 5. Join reasons with "và"
  return reasons.join(' và ') || 'Không xác định';
}

export async function getInstallmentWarnings(
  page: number = 1,
  limit: number = 10,
  storeId: string,
  customerFilter: string = '',
  contractCodeFilter: string = '',
  employeeId: string = '',
  reasonFilter: ReasonFilter = 'all'
) {
  try {
    if (!storeId) {
      return { 
        data: [], 
        error: "Không có cửa hàng", 
        totalItems: 0,
        totalPages: 0
      };
    }

    const today = new Date().toISOString().split('T')[0]; // Use date only for comparison
    
    // Expand query scope to include tomorrow's contracts
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    // Query 1: Contracts with payment warnings (payment due today/tomorrow)
    let paymentQuery = supabase
      .from('installments_by_store')
      .select(`
        *,
        customer:customers!inner(*)
      `)
      .eq('status', 'on_time')
      .eq('store_id', storeId)
      .lte('payment_due_date', tomorrowStr)
      .order('payment_due_date', { ascending: true });
    
    // Query 2: Contracts ending today (loan_date + loan_period - 1 = today)
    // First, get the actual maximum loan period from database for this store
    const { data: maxPeriodResult } = await supabase
      .from('installments_by_store')
      .select('loan_period')
      .eq('store_id', storeId)
      .eq('status', 'on_time')
      .order('loan_period', { ascending: false })
      .limit(1);
    
    const maxLoanPeriod = maxPeriodResult?.[0]?.loan_period || 180; // Fallback to 180 days
    const earliestPossibleStart = new Date();
    earliestPossibleStart.setDate(earliestPossibleStart.getDate() - (maxLoanPeriod - 1));
    const earliestStartStr = earliestPossibleStart.toISOString().split('T')[0];
    
    let endingQuery = supabase
      .from('installments_by_store')
      .select(`
        *,
        customer:customers!inner(*)
      `)
      .eq('status', 'on_time')
      .eq('store_id', storeId)
      .gte('loan_date', earliestStartStr)
      .lte('loan_date', today);
    
    // Apply filters to both queries
    if (customerFilter) {
      paymentQuery = paymentQuery.ilike('customers.name', `%${customerFilter}%`);
      endingQuery = endingQuery.ilike('customers.name', `%${customerFilter}%`);
    }
    
    if (contractCodeFilter) {
      paymentQuery = paymentQuery.eq('contract_code', contractCodeFilter);
      endingQuery = endingQuery.eq('contract_code', contractCodeFilter);
    }
    
    if (employeeId) {
      paymentQuery = paymentQuery.eq('employee_id', employeeId);
      endingQuery = endingQuery.eq('employee_id', employeeId);
    }
    
    // Execute both queries in parallel
    const [paymentResult, endingResult] = await Promise.all([
      paymentQuery,
      endingQuery
    ]);
    
    if (paymentResult.error) throw paymentResult.error;
    if (endingResult.error) throw endingResult.error;
    
    // Merge results and remove duplicates (by contract ID)
    const paymentInstallments = paymentResult.data || [];
    const endingInstallments = (endingResult.data || []).filter(item => {
      // Only include contracts that actually end today
      if (!item.loan_date || !item.loan_period) return false;
      
      const contractStart = new Date(item.loan_date);
      const contractEnd = new Date(contractStart);
      contractEnd.setDate(contractEnd.getDate() + item.loan_period - 1);
      const contractEndStr = contractEnd.toISOString().split('T')[0];
      return contractEndStr === today;
    });
    
    // Create a Set of IDs from payment query to avoid duplicates
    const paymentIds = new Set(paymentInstallments.map(item => item.id));
    const uniqueEndingInstallments = endingInstallments.filter(item => !paymentIds.has(item.id));
    
    // Combine results
    const allInstallments = [...paymentInstallments, ...uniqueEndingInstallments];
    const totalCount = allInstallments.length;
    
    // Map database model to UI model
    const mappedInstallments = allInstallments?.map((item: any): InstallmentWithCustomer => ({
      id: item.id,
      contract_code: item.contract_code || '',
      customer_id: item.customer_id,
      employee_id: item.employee_id,
      
      // UI-specific fields
      amount_given: item.down_payment || 0,
      duration: item.loan_period || 0,
      payment_period: item.payment_period || 0,
      
      // Calculated fields
      amount_paid: 0,
      old_debt: item.debt_amount || 0,
      daily_amount: item.installment_amount ? 
        (item.installment_amount / (item.payment_period || 1)) : 0,
      remaining_amount: 0,
      
      status: item.status,
      due_date: item.payment_due_date || '',
      start_date: item.loan_date || '',
      payment_due_date: item.payment_due_date,
      
      notes: item.notes,
      store_id: item.store_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      
      // Additional fields
      down_payment: item.down_payment,
      installment_amount: item.installment_amount,
      loan_period: item.loan_period,
      loan_date: item.loan_date,
      debt_amount: item.debt_amount,
      
      // Customer info
      customer: item.customer,
    })) || [];
    
    return { 
      data: mappedInstallments, 
      error: null, 
      totalItems: totalCount,
      totalPages: Math.ceil(totalCount / limit)
    };
  } catch (err) {
    console.error("Error in getInstallmentWarnings:", err);
    return { 
      data: [], 
      error: err instanceof Error ? err.message : "Unknown error", 
      totalItems: 0,
      totalPages: 0
    };
  }
} 