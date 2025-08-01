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
  
  // SPECIAL CASE 1: Contract ends today (can combine with other conditions)
  // Show regardless of payment status as this is most critical info
  if (contractEndStr === today) {
    reasons.push("Hôm nay là kỳ cuối");
  }
  
  // Check payment timing (tomorrow/today due) first
  if (paymentDueDate === tomorrowStr) {
    reasons.push("Ngày mai đóng");
  } else if (paymentDueDate === today) {
    const amount = buttonValues[0] || 0;
    reasons.push(`Hôm nay phải đóng ${formatCurrency(amount)}`);
  }
  
  // Add overdue status if contract is expired
  if (installment.status_code === 'OVERDUE') {
    const daysOverdue = Math.floor(
      (new Date(today).getTime() - new Date(contractEndStr).getTime()) 
      / (1000 * 60 * 60 * 24)
    ) + 1; // Add 1 to include today in the count
    reasons.push(`Quá hạn ${daysOverdue} ngày`);
  }
  
  // Add late periods if there are missed payments (can coexist with overdue)
  if ((installment.status_code === 'LATE_INTEREST' || installment.status_code === 'OVERDUE') 
      && paymentDueDate && paymentDueDate < today) {
    // For overdue contracts, only calculate late periods up to contract end date
    // For late_interest contracts, calculate up to today
    const effectiveEndDate = installment.status_code === 'OVERDUE' 
      ? contractEndStr 
      : (contractEndStr < today ? contractEndStr : today);
    
    const daysLate = Math.floor(
      (new Date(effectiveEndDate).getTime() - new Date(paymentDueDate).getTime()) 
      / (1000 * 60 * 60 * 24)
    ) + 1;
    
    if (daysLate > 0) {
      const fullPeriods = Math.floor(daysLate / paymentPeriod);
      const remainingDays = daysLate % paymentPeriod;
      
      if (remainingDays > 0) {
        reasons.push(`Chậm ${fullPeriods} kỳ ${remainingDays} ngày`);
      } else if (fullPeriods > 0) {
        reasons.push(`Chậm ${fullPeriods} kỳ`);
      }
    }
  } else if (paymentDueDate && paymentDueDate < today) {
    // Handle late periods for ON_TIME contracts (not covered by status_code)
    const effectiveEndDate = contractEndStr < today ? contractEndStr : today;
    const daysLate = Math.floor(
      (new Date(effectiveEndDate).getTime() - new Date(paymentDueDate).getTime()) 
      / (1000 * 60 * 60 * 24)
    ) + 1;
    
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
  
  // Join reasons with "và" to support mixed scenarios
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
    
    let installments: any[] = [];
    let error: any = null;
    let count: number = 0;

    // Use RPC for Vietnamese unaccented search when customer filter is provided
    if (customerFilter.trim()) {
      const { data: rpcData, error: rpcError, count: rpcCount } = await supabase
        .rpc('search_installments_unaccent', {
          p_customer_name: customerFilter,
          p_contract_code: contractCodeFilter || '',
          p_start_date: undefined,
          p_end_date: undefined,
          p_duration: undefined,
          p_status: undefined, // Get all statuses, filter on client side
          p_store_id: storeId,
          p_limit: limit,
          p_offset: 0
        }, { count: 'exact' });

      if (rpcError) {
        error = rpcError;
      } else {
        // Transform RPC data to match expected format
        installments = (rpcData || []).map((item: any) => ({
          ...item,
          customer: {
            name: item.customer_name,
            phone: item.customer_phone,
            address: item.customer_address,
            id_number: item.customer_id_number
          },
          debt_amount: item.down_payment || 0 // Map debt_amount from down_payment for consistency
        }));

        // Filter to only warning installments (same logic as original query)
        installments = installments.filter((installment: any) => 
          (installment.status_code === 'ON_TIME' || 
           installment.status_code === 'OVERDUE' || 
           installment.status_code === 'LATE_INTEREST') &&
          (installment.payment_due_date && installment.payment_due_date.split('T')[0] <= tomorrowStr ||
           installment.status_code === 'OVERDUE' ||
           installment.status_code === 'LATE_INTEREST')
        );

        // Apply additional filters if provided
        if (employeeId) {
          installments = installments.filter((inst: any) => inst.employee_id === employeeId);
        }

        count = installments.length;
      }
    } else {
      // Use regular query when no customer filter
      let query = supabase
        .from('installments_by_store')
        .select(`
          *,
          customer:customers!inner(*)
        `, { count: 'exact' })
        .eq('store_id', storeId)
        .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST']) // Include all warning statuses
        .or(`payment_due_date.lte.${tomorrowStr},status_code.eq.OVERDUE,status_code.eq.LATE_INTEREST`)
      
      if (contractCodeFilter) {
        query = query.eq('contract_code', contractCodeFilter);
      }
      
      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }
      
      // Execute query
      const { data: queryInstallments, error: queryError, count: queryCount } = await query;
      installments = queryInstallments || [];
      error = queryError;
      count = queryCount || 0;
    }
    
    if (error) throw error;
    
    const allInstallments = installments || [];
    const totalCount = count || 0;


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
      status_code: item.status_code, // Include calculated status from database view
      
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