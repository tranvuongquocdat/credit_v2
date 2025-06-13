import { supabase } from '@/lib/supabase';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { getLatestPaymentPaidDate } from '@/lib/Pawns/get_latest_payment_paid_date';
import { calculateActualLoanAmount } from '@/lib/Pawns/calculate_actual_loan_amount';

/**
 * Count the number of pawn contracts that have warnings (overdue or late interest)
 */
export async function countPawnWarnings(storeId: string): Promise<{ count: number; error: any }> {
  try {
    if (!storeId) {
      return { count: 0, error: "Không có cửa hàng" };
    }
    
    // Sử dụng stored function để lấy pawns với ngày thanh toán mới nhất trong một truy vấn
    const { data: pawnsWithPayments, error: pawnsError } = await (supabase as any)
      .rpc('get_pawns_with_latest_payments', {
        store_id: storeId
      });
    
    if (pawnsError) {
      console.error("Error fetching pawns with payments:", pawnsError);
      // Fallback to original method if RPC fails
      return await countPawnWarningsOriginal(storeId);
    }
    
    if (!pawnsWithPayments || !Array.isArray(pawnsWithPayments) || pawnsWithPayments.length === 0) {
      return { count: 0, error: null };
    }
    
    // Đếm số lượng pawns cần cảnh báo
    const today = new Date();
    let warningCount = 0;
    
    // Process each pawn to check if it needs a warning
    for (const pawnData of pawnsWithPayments as any[]) {
      try {
        const pawn = {
          id: pawnData.pawn_id,
          loan_date: pawnData.loan_date,
          loan_period: pawnData.loan_period,
          interest_period: pawnData.interest_period
        };
        
        // Ngày thanh toán mới nhất đã có sẵn từ query (hoặc null)
        const latestPaymentDate = pawnData.latest_payment_date;
        
        // Calculate contract end date
        const loanDate = new Date(pawn.loan_date || '');
        const contractEndDate = new Date(loanDate);
        contractEndDate.setDate(loanDate.getDate() + (pawn.loan_period || 0) - 1);
        
        // Is contract overdue?
        const isOverdue = today > contractEndDate;
        
        // Check warning conditions
        let needsWarning = false;
        
        if (latestPaymentDate) {
          // Has payment history - check days since last payment
          const latestPaymentDateTime = new Date(latestPaymentDate);
          
          // Tính số ngày từ lần thanh toán cuối đến ngày kết thúc hợp đồng (nếu đã quá hạn) hoặc đến hôm nay
          const endDateForCalculation = isOverdue ? contractEndDate : today;
          const daysSinceLastPayment = Math.floor(
            (endDateForCalculation.getTime() - latestPaymentDateTime.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          // Calculate late periods
          const interestPeriod = pawn.interest_period || 30;
          const latePeriods = Math.floor(daysSinceLastPayment / interestPeriod);
          
          // If late by one or more periods, it needs warning
          if (latePeriods > 0) {
            needsWarning = true;
          }
        } else {
          // No payments yet - check days since loan date
          // Tính số ngày từ ngày vay đến ngày kết thúc hợp đồng (nếu đã quá hạn) hoặc đến hôm nay
          const endDateForCalculation = isOverdue ? contractEndDate : today;
          const daysSinceLoan = Math.floor(
            (endDateForCalculation.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24) + 1
          );
          
          // Calculate late periods
          const interestPeriod = pawn.interest_period || 30;
          const latePeriods = Math.floor(daysSinceLoan / interestPeriod);
          
          // If late by one or more periods, it needs warning
          if (latePeriods > 0) {
            needsWarning = true;
          }
        }
        
        // If overdue or needs warning, increment counter
        if (isOverdue || needsWarning) {
          warningCount++;
        }
      } catch (err) {
        console.error(`Error processing pawn ${pawnData.pawn_id} for count:`, err);
        // Continue with other pawns even if this one fails
      }
    }
    
    return { count: warningCount, error: null };
  } catch (err) {
    console.error("Error in countPawnWarnings:", err);
    return { count: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// Fallback to original method if RPC fails
async function countPawnWarningsOriginal(storeId: string): Promise<{ count: number; error: any }> {
  try {
    // Lấy tất cả pawns với trạng thái không phải CLOSED hoặc DELETED
    const { data: pawns, error: pawnsError } = await supabase
      .from('pawns')
      .select(`
        id,
        loan_date,
        loan_period,
        interest_period
      `)
      .not('status', 'in', `(${PawnStatus.CLOSED},${PawnStatus.DELETED})`)
      .eq('store_id', storeId);
    
    if (pawnsError) {
      console.error("Error fetching pawns for counting:", pawnsError);
      return { count: 0, error: pawnsError };
    }
    
    if (!pawns || pawns.length === 0) {
      return { count: 0, error: null };
    }
    
    // Đếm số lượng pawns cần cảnh báo
    const today = new Date();
    let warningCount = 0;
    
    // Process each pawn to check if it needs a warning
    for (const pawn of pawns) {
      try {
        // Get latest payment date
        const latestPaymentDate = await getLatestPaymentPaidDate(pawn.id);
        
        // Calculate contract end date
        const loanDate = new Date(pawn.loan_date || '');
        const contractEndDate = new Date(loanDate);
        contractEndDate.setDate(loanDate.getDate() + (pawn.loan_period || 0) - 1);
        
        // Is contract overdue?
        const isOverdue = today > contractEndDate;
        
        // Check warning conditions
        let needsWarning = false;
        
        if (latestPaymentDate) {
          // Has payment history - check days since last payment
          const latestPaymentDateTime = new Date(latestPaymentDate);
          
          // Tính số ngày từ lần thanh toán cuối đến ngày kết thúc hợp đồng (nếu đã quá hạn) hoặc đến hôm nay
          const endDateForCalculation = isOverdue ? contractEndDate : today;
          const daysSinceLastPayment = Math.floor(
            (endDateForCalculation.getTime() - latestPaymentDateTime.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          // Calculate late periods
          const interestPeriod = pawn.interest_period || 30;
          const latePeriods = Math.floor(daysSinceLastPayment / interestPeriod);
          
          // If late by one or more periods, it needs warning
          if (latePeriods > 0) {
            needsWarning = true;
          }
        } else {
          // No payments yet - check days since loan date
          // Tính số ngày từ ngày vay đến ngày kết thúc hợp đồng (nếu đã quá hạn) hoặc đến hôm nay
          const endDateForCalculation = isOverdue ? contractEndDate : today;
          const daysSinceLoan = Math.floor(
            (endDateForCalculation.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24) + 1
          );
          
          // Calculate late periods
          const interestPeriod = pawn.interest_period || 30;
          const latePeriods = Math.floor(daysSinceLoan / interestPeriod);
          
          // If late by one or more periods, it needs warning
          if (latePeriods > 0) {
            needsWarning = true;
          }
        }
        
        // If overdue or needs warning, increment counter
        if (isOverdue || needsWarning) {
          warningCount++;
        }
      } catch (err) {
        console.error(`Error processing pawn ${pawn.id} for count:`, err);
        // Continue with other pawns even if this one fails
      }
    }
    
    return { count: warningCount, error: null };
  } catch (err) {
    console.error("Error in countPawnWarningsOriginal:", err);
    return { count: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function getPawnWarnings(
  page: number = 1,
  limit: number = 10,
  storeId: string,
  customerFilter: string = '',
  statusFilter: PawnStatus | 'all' = 'all'
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

    console.log("Executing pawn warnings query with:", { page, limit, storeId, customerFilter, statusFilter });
    
    // Lấy tất cả pawns với trạng thái không phải CLOSED hoặc DELETED
    let pawnsQuery = supabase
      .from('pawns')
      .select(`
        *,
        customer:customers(*),
        collateral_asset:collaterals(*)
      `)
      .not('status', 'in', `(${PawnStatus.CLOSED},${PawnStatus.DELETED})`)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
      
    // Apply status filter if specified
    if (statusFilter !== 'all') {
      pawnsQuery = pawnsQuery.eq('status', statusFilter);
    }
      
    // Áp dụng filter theo tên khách hàng nếu có
    if (customerFilter) {
      // First apply other filters, then fetch customer IDs manually and apply a second filter
      const queryWithoutCustomerFilter = pawnsQuery;
      
      // Get all customer IDs whose names match the filter
      const { data: matchingCustomers } = await supabase
        .from('customers')
        .select('id')
        .ilike('name', `%${customerFilter}%`);
      
      if (matchingCustomers && matchingCustomers.length > 0) {
        // Extract customer IDs
        const customerIds = matchingCustomers.map(c => c.id);
        // Apply in filter to original query
        pawnsQuery = queryWithoutCustomerFilter.in('customer_id', customerIds);
      } else {
        // No matching customers, return empty result
        pawnsQuery = queryWithoutCustomerFilter.eq('id', '00000000-0000-0000-0000-000000000000'); // Non-existent ID
      }
    }
    
    // Fetch all pawns matching our filters (no pagination yet)
    const { data: allPawns, error: pawnsError } = await pawnsQuery;
    
    if (pawnsError) {
      console.error("Error fetching pawns:", pawnsError);
      throw pawnsError;
    }
    
    if (!allPawns || allPawns.length === 0) {
      return { 
        data: [], 
        error: null, 
        totalItems: 0,
        totalPages: 0
      };
    }
    
    // Process pawns to check for warnings
    const today = new Date();
    const processedPawns = await Promise.all(
      allPawns.map(async (pawn) => {
        try {
          // Sử dụng hàm có sẵn để lấy ngày thanh toán cuối cùng
          const latestPaymentDate = await getLatestPaymentPaidDate(pawn.id);
          
          // Calculate contract end date
          const loanDate = new Date(pawn.loan_date || '');
          const contractEndDate = new Date(loanDate);
          contractEndDate.setDate(loanDate.getDate() + (pawn.loan_period || 0) - 1);
          
          // Is contract overdue?
          const isOverdue = today > contractEndDate;
          
          // Calculate actual loan amount
          const actualLoanAmount = await calculateActualLoanAmount(pawn.id);
          
          // Check if needs warning:
          // 1. If has latest payment, check if it's before today
          // 2. If no payment, check if loan date is before today
          let needsWarning = false;
          let reason = '';
          let oldDebt = 0;
          let interestAmount = 0;
          
          if (latestPaymentDate) {
            const latestPaymentDateTime = new Date(latestPaymentDate);
            
            // Tính số ngày từ lần thanh toán cuối đến ngày kết thúc hợp đồng (nếu đã quá hạn) hoặc đến hôm nay
            const endDateForCalculation = isOverdue ? contractEndDate : today;
            const daysSinceLastPayment = Math.floor(
              (endDateForCalculation.getTime() - latestPaymentDateTime.getTime()) / (1000 * 60 * 60 * 24)
            );
            
            // Tính số kỳ chậm (mặc định 30 ngày/kỳ hoặc theo interest_period)
            const interestPeriod = pawn.interest_period || 30;
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
            // No payments yet - check days since loan date
            // Tính số ngày từ ngày vay đến ngày kết thúc hợp đồng (nếu đã quá hạn) hoặc đến hôm nay
            const endDateForCalculation = isOverdue ? contractEndDate : today;
            const daysSinceLoan = Math.floor(
              (endDateForCalculation.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24) + 1
            );
            const interestPeriod = pawn.interest_period || 30;
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
          
          // Return pawn with warning info if needed
          // Always return the pawn for display, even if there's no warning
          // This allows flexible filtering by the UI
          return {
            ...pawn,
            latestPaymentDate,
            reason: reason,
            needsWarning: needsWarning,
            actualLoanAmount: actualLoanAmount || pawn.loan_amount,
            oldDebt: oldDebt,
            interestAmount: interestAmount,
            totalDueAmount: oldDebt + interestAmount
          };
        } catch (err) {
          console.error(`Error processing pawn ${pawn.id}:`, err);
          return null;
        }
      })
    );
    
    // Filter out nulls and only include warnings if needed
    const warningPawns = processedPawns
      .filter(pawn => pawn?.needsWarning) as PawnWithCustomerAndCollateral[];
    
    // Sort by loan date (oldest first)
    warningPawns.sort((a, b) => {
      const dateA = a?.loan_date ? new Date(a.loan_date).getTime() : 0;
      const dateB = b?.loan_date ? new Date(b.loan_date).getTime() : 0;
      return dateA - dateB;
    });
    
    // Apply pagination manually
    const offset = (page - 1) * limit;
    const paginatedPawns = warningPawns.slice(offset, offset + limit);
    
    // Calculate total pages
    const totalItems = warningPawns.length;
    const totalPages = Math.ceil(totalItems / limit);
    
    // Calculate grand totals for summary
    const grandTotalLoanAmount = warningPawns.reduce((sum, pawn) => sum + (pawn.actualLoanAmount || 0), 0);
    const grandTotalDueAmount = warningPawns.reduce((sum, pawn) => sum + (pawn.totalDueAmount || 0), 0);
    
    console.log(`Pawn warnings result: ${paginatedPawns.length} items, total: ${totalItems}, pages: ${totalPages}`);
    
    return { 
      data: paginatedPawns, 
      error: null, 
      totalItems,
      totalPages,
      summary: {
        totalLoanAmount: grandTotalLoanAmount,
        totalDueAmount: grandTotalDueAmount
      }
    };
  } catch (err) {
    console.error("Error in getPawnWarnings:", err);
    return { 
      data: [], 
      error: err instanceof Error ? err.message : "Unknown error", 
      totalItems: 0,
      totalPages: 0,
      summary: {
        totalLoanAmount: 0,
        totalDueAmount: 0
      }
    };
  }
} 