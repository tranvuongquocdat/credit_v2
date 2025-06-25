import { supabase } from '../supabase';
import { PawnStatus } from '@/models/pawn';
import { getLatestPaymentPaidDate } from './get_latest_payment_paid_date';

export interface PawnStatusResult {
  status: string;
  statusCode: 'CLOSED' | 'OVERDUE' | 'LATE_INTEREST' | 'DELETED' | 'ACTIVE';
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
      statusCode: 'ACTIVE',
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
  if (code === 'ACTIVE') {
    return {
      status: 'Đang vay',
      statusCode: 'ACTIVE',
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
    statusCode: 'ACTIVE',
  };
}

/**
 * Tính toán status cho nhiều pawns cùng lúc
 * @param pawnIds - Mảng các ID của pawns cần tính status
 * @returns Promise<Record<string, PawnStatusResult>> - Object với key là pawnId và value là status result
 */
export async function calculateMultiplePawnStatus(pawnIds: string[]): Promise<Record<string, PawnStatusResult>> {
  const results: Record<string, PawnStatusResult> = {};
  
  // Xử lý song song để tăng hiệu suất
  const promises = pawnIds.map(async (pawnId) => {
    try {
      const status = await calculatePawnStatus(pawnId);
      return { pawnId, status };
    } catch (error) {
      console.error(`Error calculating status for pawn ${pawnId}:`, error);
      return {
        pawnId,
        status: {
          status: "Lỗi",
          statusCode: 'ACTIVE' as const,
          description: "Không thể tính toán trạng thái"
        }
      };
    }
  });

  const resolvedResults = await Promise.all(promises);
  
  resolvedResults.forEach(({ pawnId, status }) => {
    results[pawnId] = status;
  });

  return results;
} 