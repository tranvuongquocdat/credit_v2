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
      return 0;
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