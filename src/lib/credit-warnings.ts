import { supabase } from "@/lib/supabase";
import { CreditWithCustomer } from "@/models/credit";

/**
 * Count the number of credit contracts that have warnings (overdue or late interest)
 */
export async function countCreditWarnings(storeId: string): Promise<{ count: number; error: any }> {
  try {
    if (!storeId) {
      return { count: 0, error: "Không có cửa hàng" };
    }

    // 1. Lấy tất cả credit id thuộc cửa hàng
    const { data: credits, error: creditsError } = await supabase
      .from('credits')
      .select('id')
      .eq('store_id', storeId);

    if (creditsError) {
      console.error('Error fetching credits for count:', creditsError);
      return { count: 0, error: creditsError };
    }

    const creditIds = (credits || []).map((c: any) => c.id);

    if (creditIds.length === 0) {
      return { count: 0, error: null };
    }

    // 2. Gọi RPC lấy status
    const { data: statuses, error: statusError } = await supabase.rpc('get_credit_statuses', {
      p_credit_ids: creditIds,
    });

    if (statusError) {
      console.error('Error calling get_credit_statuses:', statusError);
      return { count: 0, error: statusError };
    }

    const warningCount = (statuses || []).filter((s: any) =>
      ['OVERDUE', 'LATE_INTEREST'].includes(s.status_code)
    ).length;

    return { count: warningCount, error: null };
  } catch (err) {
    console.error('Error in countCreditWarnings:', err);
    return { count: 0, error: err instanceof Error ? err.message : 'Unknown error' };
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
        error: 'Không có cửa hàng',
        totalItems: 0,
        totalPages: 0,
      };
    }

    // 1. Lấy credits kèm customer theo store (chỉ cần các trường cần hiển thị)
    let creditsQuery = supabase
      .from('credits')
      .select(
        `*,
        customer:customers(*)
      `)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    // Lọc theo tên khách hàng (nếu có)
    if (customerFilter) {
      const { data: matchingCustomers } = await supabase
        .from('customers')
        .select('id')
        .ilike('name', `%${customerFilter}%`);

      if (matchingCustomers && matchingCustomers.length > 0) {
        const customerIds = matchingCustomers.map((c) => c.id);
        creditsQuery = creditsQuery.in('customer_id', customerIds);
      } else {
        // Không có khách khớp ⇒ trả rỗng
        return {
          data: [],
          error: null,
          totalItems: 0,
          totalPages: 0,
        };
      }
    }

    const { data: credits, error: creditsError } = await creditsQuery;

    if (creditsError) {
      console.error('Error fetching credits:', creditsError);
      return { data: [], error: creditsError, totalItems: 0, totalPages: 0 };
    }

    if (!credits || credits.length === 0) {
      return { data: [], error: null, totalItems: 0, totalPages: 0 };
    }

    const creditIds = credits.map((c) => c.id);

    // 2. Lấy status qua RPC
    const { data: statuses, error: statusError } = await supabase.rpc('get_credit_statuses', {
      p_credit_ids: creditIds,
    });

    if (statusError) {
      console.error('Error calling get_credit_statuses:', statusError);
      return { data: [], error: statusError, totalItems: 0, totalPages: 0 };
    }

    const statusMap = new Map<string, string>(
      (statuses || []).map((s: any) => [s.credit_id, s.status_code])
    );

    // 3. Lấy thông tin kỳ kế tiếp để tính số kỳ chậm
    const { data: nextInfos, error: nextError } = await supabase.rpc('get_next_payment_info', {
      p_credit_ids: creditIds,
    });

    if (nextError) {
      console.error('Error calling get_next_payment_info:', nextError);
    }

    const nextMap = new Map<string, any>((nextInfos || []).map((n: any) => [n.credit_id, n]));

    const today = new Date();

    // 4. Lọc những credit cần cảnh báo và tạo reason chi tiết
    const warningCredits: CreditWithCustomer[] = credits
      .filter((c: any) => ['OVERDUE', 'LATE_INTEREST'].includes(statusMap.get(c.id) || ''))
      .map((c: any) => {
        const status = statusMap.get(c.id);
        const nextInfo = nextMap.get(c.id);

        // Overdue days
        const loanDate = new Date(c.loan_date);
        const contractEnd = new Date(loanDate);
        contractEnd.setDate(contractEnd.getDate() + (c.loan_period || 0) - 1);
        const overdueDays = Math.max(0, Math.floor((today.getTime() - contractEnd.getTime()) / (1000 * 60 * 60 * 24)));

        // Late periods
        let latePeriods = 0;
        if (nextInfo && nextInfo.next_date) {
          const nextDate = new Date(nextInfo.next_date);
          const daysLate = Math.max(0, Math.floor((today.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24)));
          const iperiod = c.interest_period || 10;
          if (daysLate >= 0) {
            latePeriods = Math.floor(daysLate / iperiod) + 1;
          }
        }

        const reasonParts: string[] = [];
        if (latePeriods > 0) reasonParts.push(`Chậm ${latePeriods} kỳ`);
        if (overdueDays > 0) reasonParts.push(`Quá hạn ${overdueDays} ngày`);

        return {
          ...c,
          status_code: status,
          reason: reasonParts.join(' + '),
        };
      });

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