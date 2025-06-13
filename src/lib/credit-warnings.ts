import { supabase } from "@/lib/supabase";
import { CreditWithCustomer } from "@/models/credit";
import { getLatestPaymentPaidDate } from "@/lib/Credits/get_latest_payment_paid_date";

/**
 * Count the number of credit contracts that have warnings (overdue or late interest)
 */
export async function countCreditWarnings(storeId: string): Promise<{ count: number; error: any }> {
  try {
    if (!storeId) {
      return { count: 0, error: "Không có cửa hàng" };
    }
    
    // Sử dụng stored function để lấy credits với ngày thanh toán mới nhất trong một truy vấn
    const { data: creditsWithPayments, error: creditsError } = await (supabase as any)
      .rpc('get_credits_with_latest_payments', {
        store_id: storeId
      });
    
    if (creditsError) {
      console.error("Error fetching credits with payments:", creditsError);
      // Fallback to original method if RPC fails
      return await countCreditWarningsOriginal(storeId);
    }
    
    if (!creditsWithPayments || !Array.isArray(creditsWithPayments) || creditsWithPayments.length === 0) {
      return { count: 0, error: null };
    }
    
    // Đếm số lượng credits cần cảnh báo
    const today = new Date();
    let warningCount = 0;
    
    // Process each credit to check if it needs a warning
    for (const creditData of creditsWithPayments as any[]) {
      try {
        const credit = {
          id: creditData.credit_id,
          loan_date: creditData.loan_date,
          loan_period: creditData.loan_period,
          interest_period: creditData.interest_period
        };
        
        // Ngày thanh toán mới nhất đã có sẵn từ query (hoặc null)
        const latestPaymentDate = creditData.latest_payment_date;
        
        // Calculate contract end date
        const loanDate = new Date(credit.loan_date || '');
        const contractEndDate = new Date(loanDate);
        contractEndDate.setDate(loanDate.getDate() + (credit.loan_period || 0) - 1);
        
        // Is contract overdue?
        const isOverdue = today > contractEndDate;
        
        // Check warning conditions
        let needsWarning = false;
        
        if (latestPaymentDate) {
          // Has payment history - check days since last payment
          const latestPaymentDateTime = new Date(latestPaymentDate);
          
          // Tính số ngày từ lần thanh toán cuối đến hôm nay (hoặc ngày kết thúc hợp đồng nếu đã quá hạn)
          // Đây là sửa đổi chính: sử dụng Math.min để đảm bảo chỉ tính đến ngày kết thúc hợp đồng
          const endDateForCalculation = isOverdue ? contractEndDate : today;
          const daysSinceLastPayment = Math.floor(
            (endDateForCalculation.getTime() - latestPaymentDateTime.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          // Calculate late periods
          const interestPeriod = credit.interest_period || 10;
          const latePeriods = Math.floor(daysSinceLastPayment / interestPeriod);
          
          // If late by one or more periods, it needs warning
          if (latePeriods > 0) {
            needsWarning = true;
          }
        } else {
          // No payments yet - check days since loan date
          // Chỉ tính đến ngày kết thúc hợp đồng nếu đã quá hạn
          const endDateForCalculation = isOverdue ? contractEndDate : today;
          const daysSinceLoan = Math.floor(
            (endDateForCalculation.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24) + 1
          );
          
          // Calculate late periods
          const interestPeriod = credit.interest_period || 10;
          const latePeriods = Math.floor(daysSinceLoan / interestPeriod);
          
          // If late by one or more periods, it needs warning
          if (latePeriods > 0) {
            needsWarning = true;
          }
        }
        
        // Add to warning count if needs warning or is overdue
        if (needsWarning || isOverdue) {
          warningCount++;
        }
      } catch (err) {
        console.error(`Error processing credit ${creditData.credit_id} for count:`, err);
        // Continue with other credits even if this one fails
      }
    }
    
    return { count: warningCount, error: null };
  } catch (err) {
    console.error("Error in countCreditWarnings:", err);
    return { count: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// Fallback to original method if RPC fails
async function countCreditWarningsOriginal(storeId: string): Promise<{ count: number; error: any }> {
  try {
    // Lấy tất cả credits với trạng thái on_time thuộc store
    const { data: credits, error: creditsError } = await supabase
      .from('credits')
      .select(`
        id,
        loan_date,
        loan_period,
        interest_period
      `)
      .eq('status', 'on_time')
      .eq('store_id', storeId);
    
    if (creditsError) {
      console.error("Error fetching credits for counting:", creditsError);
      return { count: 0, error: creditsError };
    }
    
    if (!credits || credits.length === 0) {
      return { count: 0, error: null };
    }
    
    // Đếm số lượng credits cần cảnh báo
    const today = new Date();
    let warningCount = 0;
    
    // Process each credit to check if it needs a warning
    for (const credit of credits) {
      try {
        // Get latest payment date
        const latestPaymentDate = await getLatestPaymentPaidDate(credit.id);
        
        // Calculate contract end date
        const loanDate = new Date(credit.loan_date || '');
        const contractEndDate = new Date(loanDate);
        contractEndDate.setDate(loanDate.getDate() + (credit.loan_period || 0) - 1);
        
        // Is contract overdue?
        const isOverdue = today > contractEndDate;
        
        // Check warning conditions
        let needsWarning = false;
        
        if (latestPaymentDate) {
          // Has payment history - check days since last payment
          const latestPaymentDateTime = new Date(latestPaymentDate);
          
          // Tính số ngày từ lần thanh toán cuối đến hôm nay (hoặc ngày kết thúc hợp đồng nếu đã quá hạn)
          // Đây là sửa đổi chính: sử dụng Math.min để đảm bảo chỉ tính đến ngày kết thúc hợp đồng
          const endDateForCalculation = isOverdue ? contractEndDate : today;
          const daysSinceLastPayment = Math.floor(
            (endDateForCalculation.getTime() - latestPaymentDateTime.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          // Calculate late periods
          const interestPeriod = credit.interest_period || 10;
          const latePeriods = Math.floor(daysSinceLastPayment / interestPeriod);
          
          // If late by one or more periods, it needs warning
          if (latePeriods > 0) {
            needsWarning = true;
          }
        } else {
          // No payments yet - check days since loan date
          // Chỉ tính đến ngày kết thúc hợp đồng nếu đã quá hạn
          const endDateForCalculation = isOverdue ? contractEndDate : today;
          const daysSinceLoan = Math.floor(
            (endDateForCalculation.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24) + 1
          );
          
          // Calculate late periods
          const interestPeriod = credit.interest_period || 10;
          const latePeriods = Math.floor(daysSinceLoan / interestPeriod);
          
          // If late by one or more periods, it needs warning
          if (latePeriods > 0) {
            needsWarning = true;
          }
        }
        
        // Add to warning count if needs warning or is overdue
        if (needsWarning || isOverdue) {
          warningCount++;
        }
      } catch (err) {
        console.error(`Error processing credit ${credit.id} for count:`, err);
        // Continue with other credits even if this one fails
      }
    }
    
    return { count: warningCount, error: null };
  } catch (err) {
    console.error("Error in countCreditWarningsOriginal:", err);
    return { count: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function getCreditWarnings(
  page: number = 1,
  limit: number = 10,
  storeId: string,
  customerFilter: string = ''
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

    console.log("Executing credit warnings query with:", { page, limit, storeId, customerFilter });
    
    // Lấy tất cả credits với trạng thái 'on_time' thuộc store
    let creditsQuery = supabase
      .from('credits')
      .select(`
        *,
        customer:customers(*)
      `)
      .eq('status', 'on_time')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
      
    // Áp dụng filter theo tên khách hàng nếu có
    if (customerFilter) {
      // First apply other filters, then fetch customer IDs manually and apply a second filter
      const queryWithoutCustomerFilter = creditsQuery;
      
      // Get all customer IDs whose names match the filter
      const { data: matchingCustomers } = await supabase
        .from('customers')
        .select('id')
        .ilike('name', `%${customerFilter}%`);
      
      if (matchingCustomers && matchingCustomers.length > 0) {
        // Extract customer IDs
        const customerIds = matchingCustomers.map(c => c.id);
        // Apply in filter to original query
        creditsQuery = queryWithoutCustomerFilter.in('customer_id', customerIds);
      } else {
        // No matching customers, return empty result
        creditsQuery = queryWithoutCustomerFilter.eq('id', '00000000-0000-0000-0000-000000000000'); // Non-existent ID
      }
    }
    
    // Fetch all credits matching our filters (no pagination yet)
    const { data: allCredits, error: creditsError } = await creditsQuery;
    
    if (creditsError) {
      console.error("Error fetching credits:", creditsError);
      throw creditsError;
    }
    
    if (!allCredits || allCredits.length === 0) {
      return { 
        data: [], 
        error: null, 
        totalItems: 0,
        totalPages: 0
      };
    }
    
    // Process credits to check for warnings
    const today = new Date();
    const processedCredits = await Promise.all(
      allCredits.map(async (credit) => {
        try {
          // Sử dụng hàm có sẵn để lấy ngày thanh toán cuối cùng
          const latestPaymentDate = await getLatestPaymentPaidDate(credit.id);
          
          // Calculate contract end date
          const loanDate = new Date(credit.loan_date || '');
          const contractEndDate = new Date(loanDate);
          contractEndDate.setDate(loanDate.getDate() + (credit.loan_period || 0) - 1);
          
          // Is contract overdue?
          const isOverdue = today > contractEndDate;
          
          // Check if needs warning:
          // 1. If has latest payment, check if it's before today
          // 2. If no payment, check if loan date is before today
          let needsWarning = false;
          let reason = '';
          
          if (latestPaymentDate) {
            const latestPaymentDateTime = new Date(latestPaymentDate);
            
            // Tính số ngày từ lần thanh toán cuối đến hôm nay (hoặc ngày kết thúc hợp đồng nếu đã quá hạn)
            // Đây là sửa đổi chính: chỉ tính đến ngày kết thúc hợp đồng
            const endDateForCalculation = isOverdue ? contractEndDate : today;
            const daysSinceLastPayment = Math.floor(
              (endDateForCalculation.getTime() - latestPaymentDateTime.getTime()) / (1000 * 60 * 60 * 24)
            );
            
            // Tính số kỳ chậm (mặc định 10 ngày/kỳ hoặc theo interest_period)
            const interestPeriod = credit.interest_period || 10;
            const latePeriods = Math.floor(daysSinceLastPayment / interestPeriod);
            
            if (latePeriods > 0) {
              needsWarning = true;
              reason = `Chậm ${latePeriods} kỳ`;
              
              // Add overdue info if applicable
              if (isOverdue) {
                const overdueDays = Math.floor(
                  (today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                if (overdueDays > 0) {
                  reason += reason ? ` + Quá hạn ${overdueDays} ngày` : `Quá hạn ${overdueDays} ngày`;
                }
              }
            }
          } else {
            // No payments yet - check if loan date is before today
            // Chỉ tính đến ngày kết thúc hợp đồng nếu đã quá hạn
            const endDateForCalculation = isOverdue ? contractEndDate : today;
            const daysSinceLoan = Math.floor(
              (endDateForCalculation.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24) + 1
            );
            const interestPeriod = credit.interest_period || 10;
            const latePeriods = Math.floor(daysSinceLoan / interestPeriod);
            if (latePeriods > 0) {
              needsWarning = true;
              
              reason = `Chậm ${latePeriods} kỳ`;
              
              // Add overdue info if applicable
              if (isOverdue) {
                const overdueDays = Math.floor(
                  (today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                if (overdueDays > 0) {
                  reason += reason ? ` + Quá hạn ${overdueDays} ngày` : `Quá hạn ${overdueDays} ngày`;
                }
              }
            }
          }
          
          // Return credit with warning info if needed
          if (needsWarning) {
            return {
              ...credit,
              latestPaymentDate,
              reason,
              needsWarning: true
            };
          }
          
          return null; // Not a warning
        } catch (err) {
          console.error(`Error processing credit ${credit.id}:`, err);
          return null;
        }
      })
    );
    
    // Filter out nulls and sort by loan date (oldest first)
    const warningCredits = processedCredits
      .filter(credit => credit !== null)
      .sort((a, b) => {
        const dateA = a?.loan_date ? new Date(a.loan_date).getTime() : 0;
        const dateB = b?.loan_date ? new Date(b.loan_date).getTime() : 0;
        return dateA - dateB;
      }) as CreditWithCustomer[];
    
    // Apply pagination manually
    const offset = (page - 1) * limit;
    const paginatedCredits = warningCredits.slice(offset, offset + limit);
    
    // Calculate total pages
    const totalItems = warningCredits.length;
    const totalPages = Math.ceil(totalItems / limit);
    
    console.log(`Credit warnings result: ${paginatedCredits.length} items, total: ${totalItems}, pages: ${totalPages}`);
    
    return { 
      data: paginatedCredits, 
      error: null, 
      totalItems,
      totalPages
    };
  } catch (err) {
    console.error("Error in getCreditWarnings:", err);
    return { 
      data: [], 
      error: err instanceof Error ? err.message : "Unknown error", 
      totalItems: 0,
      totalPages: 0
    };
  }
} 