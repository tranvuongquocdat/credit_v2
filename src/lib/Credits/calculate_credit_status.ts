import { supabase } from '../supabase';
import { CreditStatus } from '@/models/credit';
import { getLatestPaymentPaidDate } from './get_latest_payment_paid_date';

export interface CreditStatusResult {
  status: string;
  statusCode: 'CLOSED' | 'OVERDUE' | 'LATE_INTEREST' | 'BAD_DEBT' | 'DELETED' | 'FINISHED' | 'ACTIVE';
  description?: string;
}

/**
 * Tính toán status hiển thị cho credit dựa trên các điều kiện nghiệp vụ
 * @param creditId - ID của credit cần tính status
 * @returns Promise<CreditStatusResult> - Kết quả status và mô tả
 */
export async function calculateCreditStatus(creditId: string): Promise<CreditStatusResult> {
  try {
    // Lấy thông tin credit
    const { data: credit, error: creditError } = await supabase
      .from('credits')
      .select('id, status, loan_date, loan_period, interest_period')
      .eq('id', creditId)
      .single();

    if (creditError) {
      throw creditError;
    }

    if (!credit) {
      throw new Error("Credit not found");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Kiểm tra nếu hợp đồng đã đóng
    if (credit.status === CreditStatus.CLOSED) {
      return {
        status: "Đã đóng",
        statusCode: 'CLOSED',
        description: "Hợp đồng đã được đóng"
      };
    }

    // 2. Kiểm tra nếu hợp đồng đã xóa
    if (credit.status === CreditStatus.DELETED) {
      return {
        status: "Đã xóa",
        statusCode: 'DELETED',
        description: "Hợp đồng đã bị xóa"
      };
    }

    // 3. Kiểm tra nếu hợp đồng là nợ xấu
    if (credit.status === CreditStatus.BAD_DEBT) {
      return {
        status: "Nợ xấu",
        statusCode: 'BAD_DEBT',
        description: "Hợp đồng đã được đánh dấu là nợ xấu"
      };
    }

    // 4. Kiểm tra nếu trạng thái là ON_TIME
    if (credit.status === CreditStatus.ON_TIME) {
      // Tính ngày kết thúc hợp đồng
      const loanDate = new Date(credit.loan_date);
      loanDate.setHours(0, 0, 0, 0);
      const contractEndDate = new Date(loanDate);
      contractEndDate.setDate(loanDate.getDate() + credit.loan_period - 1);
      contractEndDate.setHours(0, 0, 0, 0);

      // 4a. Kiểm tra nếu hợp đồng quá hạn (ngày kết thúc < hôm nay)
      if (contractEndDate < today) {
        const overdueDays = Math.floor((today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          status: "Quá hạn",
          statusCode: 'OVERDUE',
          description: `Quá hạn ${overdueDays} ngày`
        };
      }

      // 4b. Kiểm tra hoàn thành và chậm lãi
      try {
        const latestPaymentDate = await getLatestPaymentPaidDate(creditId);
        
        // Kiểm tra nếu ngày thanh toán cuối = ngày kết thúc hợp đồng => Hoàn thành
        if (latestPaymentDate) {
          const lastPaymentDate = new Date(latestPaymentDate);
          lastPaymentDate.setHours(0, 0, 0, 0);
          
          if (lastPaymentDate.getTime() === contractEndDate.getTime()) {
            return {
              status: "Hoàn thành",
              statusCode: 'FINISHED',
              description: "Hợp đồng đã hoàn thành"
            };
          }
        }
        
        if (latestPaymentDate) {
          // Có lịch sử thanh toán - tính từ ngày thanh toán cuối
          const lastPaymentDate = new Date(latestPaymentDate);
          lastPaymentDate.setHours(0, 0, 0, 0);
          
          // Tính ngày cuối phải đóng lãi tiếp theo
          const interestPeriod = credit.interest_period || 30;
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
          const interestPeriod = credit.interest_period || 30;
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

    // 5. Trường hợp mặc định - đang vay bình thường
    return {
      status: "Đang vay",
      statusCode: 'ACTIVE',
      description: "Hợp đồng đang hoạt động bình thường"
    };

  } catch (error) {
    console.error('Error calculating credit status:', error);
    throw error;
  }
}

/**
 * Tính toán status cho nhiều credits cùng lúc
 * @param creditIds - Mảng các ID của credits cần tính status
 * @returns Promise<Record<string, CreditStatusResult>> - Object với key là creditId và value là status result
 */
export async function calculateMultipleCreditStatus(creditIds: string[]): Promise<Record<string, CreditStatusResult>> {
  const results: Record<string, CreditStatusResult> = {};
  
  // Xử lý song song để tăng hiệu suất
  const promises = creditIds.map(async (creditId) => {
    try {
      const status = await calculateCreditStatus(creditId);
      return { creditId, status };
    } catch (error) {
      console.error(`Error calculating status for credit ${creditId}:`, error);
      return {
        creditId,
        status: {
          status: "Lỗi",
          statusCode: 'ACTIVE' as const,
          description: "Không thể tính toán trạng thái"
        }
      };
    }
  });

  const resolvedResults = await Promise.all(promises);
  
  resolvedResults.forEach(({ creditId, status }) => {
    results[creditId] = status;
  });

  return results;
} 