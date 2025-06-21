import { supabase } from '@/lib/supabase';

/**
 * Tính toán lãi phí đã thu từ một hợp đồng tín dụng
 * Có thể dùng cho cả hợp đồng đang hoạt động và đã đóng
 * 
 * @param creditId - ID của hợp đồng tín dụng
 * @param startDate - Ngày bắt đầu tính (mặc định: đầu tháng hiện tại)
 * @param endDate - Ngày kết thúc tính (mặc định: cuối tháng hiện tại)
 * @returns Tổng lãi phí đã thu
 */
export async function calculateCollectedInterest(
  creditId: string,
  startDate?: Date,
  endDate?: Date
): Promise<number> {
  try {
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end   = endDate   || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    console.log('calculateCollectedInterest', creditId, start, end);
    // Gọi function đã tạo trong DB (trả về 1-hàng với trường paid_interest)
    const { data, error } = await supabase.rpc('get_paid_interest', {
      p_credit_ids: [creditId],
      p_start_date: start.toISOString(),
      p_end_date  : end.toISOString(),
    });

    if (error) {
      console.error('get_paid_interest RPC error:', error);
      // Fallback: dùng cách cũ (hiếm khi xảy ra)
      return await calculateInterestWithPagination(creditId, start, end);
    }

    // Hàm trả về array ⟨credit_id, paid_interest⟩
    const paid = Array.isArray(data) && data[0]?.paid_interest
      ? Number(data[0].paid_interest)
      : 0;

    return Math.round(paid);
  } catch (error) {
    console.error(`Error calculating collected interest for credit ${creditId}:`, error);
    return 0;
  }
}

/**
 * Tính toán lãi phí đã thu bằng phương pháp phân trang để xử lý > 1000 bản ghi
 */
async function calculateInterestWithPagination(
  creditId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  let totalInterest = 0;
  let hasMoreData = true;
  let lastId: string | null = null;
  const pageSize = 1000; // Kích thước trang tối đa
  while (hasMoreData) {
    let query = supabase
      .from('credit_history')
      .select('id, credit_amount')
      .eq('credit_id', creditId)
      .eq('is_deleted', false)
      .eq('transaction_type', 'payment')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('id', { ascending: true })
      .limit(pageSize);
    
    // Nếu có lastId, thêm điều kiện để lấy bản ghi tiếp theo
    if (lastId) {
      query = query.gt('id', lastId);
    }
    
    const { data: pageData, error } = await query;
    
    if (error) {
      console.error(`Error fetching credit history page:`, error);
      break;
    }
    
    if (!pageData || pageData.length === 0) {
      hasMoreData = false;
      continue;
    }
    
    // Tính tổng lãi phí cho trang hiện tại
    const pageSum = pageData.reduce((sum, record) => sum + (record.credit_amount || 0), 0);
    totalInterest += pageSum;
    
    // Kiểm tra xem còn dữ liệu không
    if (pageData.length < pageSize) {
      hasMoreData = false;
    } else {
      // Lưu ID cuối cùng để lấy trang tiếp theo
      lastId = pageData[pageData.length - 1].id;
    }
  }
  
  return Math.round(totalInterest);
}

/**
 * Tính toán tổng lãi phí đã thu từ nhiều hợp đồng tín dụng
 * 
 * @param creditIds - Mảng ID của các hợp đồng tín dụng
 * @param startDate - Ngày bắt đầu tính (mặc định: đầu tháng hiện tại)
 * @param endDate - Ngày kết thúc tính (mặc định: cuối tháng hiện tại)
 * @returns Tổng lãi phí đã thu từ tất cả hợp đồng
 */
export async function calculateTotalCollectedInterest(
  creditIds: string[],
  startDate?: Date,
  endDate?: Date
): Promise<number> {
  try {
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end   = endDate   || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    if (creditIds.length === 0) return 0;

    const { data, error } = await supabase.rpc('get_paid_interest', {
      p_credit_ids: creditIds,
      p_start_date: start.toISOString(),
      p_end_date  : end.toISOString(),
    });

    if (error) {
      console.error('get_paid_interest RPC error:', error);
      // Fallback: tính theo từng batch cách cũ
      const batchSize = 100;
      let total = 0;
      for (let i = 0; i < creditIds.length; i += batchSize) {
        const slice = creditIds.slice(i, i + batchSize);
        total += await calculateBatchInterestWithPagination(slice, start, end);
      }
      return Math.round(total);
    }

    // data = array các hàng {credit_id, paid_interest}
    const total = (data as any[]).reduce(
      (sum, row) => sum + Number(row.paid_interest || 0),
      0
    );
    return Math.round(total);
  } catch (error) {
    console.error(`Error calculating total collected interest:`, error);
    return 0;
  }
}

/**
 * Tính toán lãi phí đã thu cho một nhóm credits với phân trang
 */
async function calculateBatchInterestWithPagination(
  creditIds: string[],
  startDate: Date,
  endDate: Date
): Promise<number> {
  let totalInterest = 0;
  let hasMoreData = true;
  let lastId: string | null = null;
  const pageSize = 1000; // Kích thước trang tối đa
  
  while (hasMoreData) {
    let query = supabase
      .from('credit_history')
      .select('id, credit_amount')
      .in('credit_id', creditIds)
      .eq('is_deleted', false)
      .eq('transaction_type', 'payment')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('id', { ascending: true })
      .limit(pageSize);
    
    // Nếu có lastId, thêm điều kiện để lấy bản ghi tiếp theo
    if (lastId) {
      query = query.gt('id', lastId);
    }
    
    const { data: pageData, error } = await query;
    
    if (error) {
      console.error(`Error fetching credit history batch page:`, error);
      break;
    }
    
    if (!pageData || pageData.length === 0) {
      hasMoreData = false;
      continue;
    }
    
    // Tính tổng lãi phí cho trang hiện tại
    const pageSum = pageData.reduce((sum, record) => sum + (record.credit_amount || 0), 0);
    totalInterest += pageSum;
    
    // Kiểm tra xem còn dữ liệu không
    if (pageData.length < pageSize) {
      hasMoreData = false;
    } else {
      // Lưu ID cuối cùng để lấy trang tiếp theo
      lastId = pageData[pageData.length - 1].id;
    }
  }
  
  return totalInterest;
} 