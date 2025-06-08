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
  try {
    // Lấy thông tin pawn
    const { data: pawn, error: pawnError } = await supabase
      .from('pawns')
      .select('id, status, loan_date, loan_period, interest_period')
      .eq('id', pawnId)
      .single();

    if (pawnError) {
      throw pawnError;
    }

    if (!pawn) {
      throw new Error("Pawn not found");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Kiểm tra nếu hợp đồng đã đóng
    if (pawn.status === PawnStatus.CLOSED) {
      return {
        status: "Đã đóng",
        statusCode: 'CLOSED',
        description: "Hợp đồng đã được đóng"
      };
    }

    // 2. Kiểm tra nếu hợp đồng đã xóa
    if (pawn.status === PawnStatus.DELETED) {
      return {
        status: "Đã xóa",
        statusCode: 'DELETED',
        description: "Hợp đồng đã bị xóa"
      };
    }

    // 3. Kiểm tra nếu trạng thái là ON_TIME
    if (pawn.status === PawnStatus.ON_TIME) {
      // Tính ngày kết thúc hợp đồng
      const loanDate = new Date(pawn.loan_date);
      loanDate.setHours(0, 0, 0, 0);
      const contractEndDate = new Date(loanDate);
      contractEndDate.setDate(loanDate.getDate() + pawn.loan_period - 1);
      contractEndDate.setHours(0, 0, 0, 0);

      // 3a. Kiểm tra nếu hợp đồng quá hạn (ngày kết thúc < hôm nay)
      if (contractEndDate < today) {
        const overdueDays = Math.floor((today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          status: "Quá hạn",
          statusCode: 'OVERDUE',
          description: `Quá hạn ${overdueDays} ngày`
        };
      }

      // 3b. Kiểm tra chậm lãi
      try {
        const latestPaymentDate = await getLatestPaymentPaidDate(pawnId);
        
        if (latestPaymentDate) {
          // Có lịch sử thanh toán - tính từ ngày thanh toán cuối
          const lastPaymentDate = new Date(latestPaymentDate);
          lastPaymentDate.setHours(0, 0, 0, 0);
          
          // Tính ngày cuối phải đóng lãi tiếp theo
          const interestPeriod = pawn.interest_period || 30;
          const nextInterestDueDate = new Date(lastPaymentDate);
          nextInterestDueDate.setDate(lastPaymentDate.getDate() + interestPeriod);
          nextInterestDueDate.setHours(0, 0, 0, 0);
          
          // Nếu ngày cuối đóng lãi <= hôm nay => chậm lãi
          if (nextInterestDueDate <= today) {
            const lateDays = Math.floor((today.getTime() - nextInterestDueDate.getTime()) / (1000 * 60 * 60 * 24));
            return {
              status: "Chậm lãi",
              statusCode: 'LATE_INTEREST',
              description: `Chậm lãi ${lateDays} ngày`
            };
          }
        } else {
          // Chưa có lịch sử thanh toán - tính từ ngày vay
          const interestPeriod = pawn.interest_period || 30;
          const firstInterestDueDate = new Date(loanDate);
          firstInterestDueDate.setDate(loanDate.getDate() + interestPeriod);
          firstInterestDueDate.setHours(0, 0, 0, 0);
          
          // Nếu ngày cuối đóng lãi đầu tiên <= hôm nay => chậm lãi
          if (firstInterestDueDate <= today) {
            const lateDays = Math.floor((today.getTime() - firstInterestDueDate.getTime()) / (1000 * 60 * 60 * 24));
            return {
              status: "Chậm lãi",
              statusCode: 'LATE_INTEREST',
              description: `Chậm lãi ${lateDays} ngày`
            };
          }
        }
      } catch (error) {
        console.error('Error checking payment history:', error);
        // Nếu có lỗi khi kiểm tra lịch sử thanh toán, vẫn tiếp tục với logic khác
      }
    }

    // 4. Trường hợp mặc định - đang vay bình thường
    return {
      status: "Đang vay",
      statusCode: 'ACTIVE',
      description: "Hợp đồng đang hoạt động bình thường"
    };

  } catch (error) {
    console.error('Error calculating pawn status:', error);
    throw error;
  }
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