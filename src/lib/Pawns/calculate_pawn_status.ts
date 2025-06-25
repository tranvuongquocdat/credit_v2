import { supabase } from '../supabase';

export interface PawnStatusResult {
  status: string;
  statusCode: 'CLOSED' | 'OVERDUE' | 'LATE_INTEREST' | 'DELETED' | 'ON_TIME';
  description?: string;
}

/**
 * Tính toán status hiển thị cho pawn dựa trên các điều kiện nghiệp vụ
 * @param pawnId - ID của pawn cần tính status
 * @returns Promise<PawnStatusResult> - Kết quả status và mô tả
 */
export async function calculatePawnStatus(pawnId: string): Promise<PawnStatusResult> {
  const { data: pawn, error } = await supabase.rpc('get_pawn_statuses', {
    p_pawn_ids: [pawnId],
  });

  if (error) {
    console.error('Error calculating credit status:', error);
    return {
      status: 'Đang vay',
      statusCode: 'ON_TIME',
    };
  }

  const code = pawn?.[0]?.status_code;
  if (code === 'CLOSED') {
    return {
      status: 'Đã đóng',
      statusCode: 'CLOSED',
    };
  }
  if (code === 'OVERDUE') { 
    return {
      status: 'Quá hạn',
      statusCode: 'OVERDUE',
    };
  }
  if (code === 'LATE_INTEREST') {
    return {
      status: 'Chậm lãi',
      statusCode: 'LATE_INTEREST',
    };
  }
  if (code === 'ON_TIME') {
    return {
      status: 'Đang vay',
      statusCode: 'ON_TIME',
    };
  }
  if (code === 'DELETED') { 
    return {
        status: 'Đã xóa',
        statusCode: 'DELETED',
      };
  }
  return {
    status: 'Đang vay',
    statusCode: 'ON_TIME',
  };
}