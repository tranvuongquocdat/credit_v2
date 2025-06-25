import { supabase } from '@/lib/supabase';

/**
 * Tính toán lãi phí đã thu từ một hợp đồng cầm đồ
 * Có thể dùng cho cả hợp đồng đang hoạt động và đã đóng
 * 
 * @param pawnId - ID của hợp đồng cầm đồ
 * @param startDate - Ngày bắt đầu tính (mặc định: đầu tháng hiện tại)
 * @param endDate - Ngày kết thúc tính (mặc định: cuối tháng hiện tại)
 * @returns Tổng lãi phí đã thu
 */
export async function calculateCollectedInterest(
  pawnId: string,
  startDate?: Date,
  endDate?: Date
): Promise<number> {
  try {
    // Xác định khoảng thời gian tính toán
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    
    // Gọi function đã tạo trong DB (trả về 1-hàng với trường paid_interest)
    const { data, error } = await supabase.rpc('get_pawn_paid_interest', {
      p_pawn_ids: [pawnId],
      p_start_date: start.toISOString(),
      p_end_date  : end.toISOString(),
    });

    if (error) {
      console.error('get_pawn_paid_interest RPC error:', error);
      // Fallback: dùng cách cũ (hiếm khi xảy ra)
      return 0;
    }

    // Hàm trả về array ⟨pawn_id, paid_interest⟩
    const paid = Array.isArray(data) && data[0]?.paid_interest
      ? Number(data[0].paid_interest)
      : 0;

    return Math.round(paid);
  } catch (error) {
    console.error(`Error calculating collected interest for pawn ${pawnId}:`, error);
    return 0;
  }
}
