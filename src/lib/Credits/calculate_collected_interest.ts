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
    // Xác định khoảng thời gian tính toán
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    
    // Sử dụng phương pháp phân trang để xử lý > 1000 bản ghi
    return await calculateInterestWithPagination(creditId, start, end);
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
    // Xác định khoảng thời gian tính toán
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    
    // Xử lý từng nhóm creditIds để tránh vượt quá giới hạn của IN clause
    const batchSize = 100; // Số lượng ID tối đa trong mỗi nhóm
    let totalInterest = 0;
    
    // Chia creditIds thành các nhóm nhỏ hơn
    for (let i = 0; i < creditIds.length; i += batchSize) {
      const batchIds = creditIds.slice(i, i + batchSize);
      const batchInterest = await calculateBatchInterestWithPagination(batchIds, start, end);
      totalInterest += batchInterest;
    }
    
    return Math.round(totalInterest);
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