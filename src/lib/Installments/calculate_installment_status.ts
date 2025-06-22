import { supabase } from '../supabase';
import { InstallmentStatus } from '@/models/installment';
import { getLatestPaymentPaidDate } from './get_latest_payment_paid_date';

export interface InstallmentStatusResult {
  status: string;
  statusCode: string;
  description?: string;
}

/**
 * Tính toán status hiển thị cho installment dựa trên các điều kiện nghiệp vụ
 * @param installmentId - ID của installment cần tính status
 * @returns Promise<InstallmentStatusResult> - Kết quả status và mô tả
 */
export async function calculateInstallmentStatus(installmentId: string): Promise<InstallmentStatusResult> {
  try {
    // Lấy thông tin installment
    const { data: installment, error: installmentError } = await supabase
      .from('installments')
      .select('id, status, loan_date, loan_period, payment_period, payment_due_date')
      .eq('id', installmentId)
      .single();

    if (installmentError) {
      throw installmentError;
    }

    if (!installment) {
      throw new Error("Installment not found");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Kiểm tra nếu hợp đồng đã đóng
    if (installment.status === InstallmentStatus.CLOSED) {
      return {
        status: "Đã đóng",
        statusCode: 'CLOSED',
        description: "Hợp đồng đã được đóng"
      };
    }

    // 2. Kiểm tra nếu hợp đồng đã xóa
    if (installment.status === InstallmentStatus.DELETED) {
      return {
        status: "Đã xóa",
        statusCode: 'DELETED',
        description: "Hợp đồng đã bị xóa"
      };
    }

    // 3. Kiểm tra nếu hợp đồng đã hoàn thành
    if (installment.status === InstallmentStatus.FINISHED || installment.payment_due_date === null) {
      return {
        status: "Hoàn thành",
        statusCode: 'FINISHED',
        description: "Hợp đồng đã hoàn thành"
      };
    }

    // 4. Kiểm tra nếu hợp đồng là nợ xấu
    if (installment.status === InstallmentStatus.BAD_DEBT) {
      return {
        status: "Nợ xấu",
        statusCode: 'BAD_DEBT',
        description: "Hợp đồng đã được đánh dấu là nợ xấu"
      };
    }

    // 5. Kiểm tra nếu trạng thái là ON_TIME
    if (installment.status === InstallmentStatus.ON_TIME) {
      // Tính ngày kết thúc hợp đồng
      const loanDate = new Date(installment.loan_date);
      loanDate.setHours(0, 0, 0, 0);
      const contractEndDate = new Date(loanDate);
      contractEndDate.setDate(loanDate.getDate() + installment.loan_period - 1);
      contractEndDate.setHours(0, 0, 0, 0);

      // 5a. Kiểm tra nếu hợp đồng quá hạn (ngày kết thúc < hôm nay)
      if (contractEndDate < today) {
        const overdueDays = Math.floor((today.getTime() - contractEndDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          status: "Quá hạn",
          statusCode: 'OVERDUE',
          description: `Quá hạn ${overdueDays} ngày`
        };
      }

      // 5b. Kiểm tra chậm trả (dựa trên payment_due_date hoặc payment_period)
      try {
        let nextPaymentDueDate: Date;

        if (installment.payment_due_date) {
          // Nếu có payment_due_date cụ thể, sử dụng nó
          nextPaymentDueDate = new Date(installment.payment_due_date);
          nextPaymentDueDate.setHours(0, 0, 0, 0);
        } else {
          // Nếu không có payment_due_date, tính dựa trên latest payment hoặc loan_date
          const latestPaymentDate = await getLatestPaymentPaidDate(installmentId);
          
          if (latestPaymentDate) {
            // Có lịch sử thanh toán - tính từ ngày thanh toán cuối
            const lastPaymentDate = new Date(latestPaymentDate);
            lastPaymentDate.setHours(0, 0, 0, 0);
            
            // Tính ngày cuối phải đóng tiền tiếp theo
            const paymentPeriod = installment.payment_period || 30;
            nextPaymentDueDate = new Date(lastPaymentDate);
            nextPaymentDueDate.setDate(lastPaymentDate.getDate() + paymentPeriod);
            nextPaymentDueDate.setHours(0, 0, 0, 0);
          } else {
            // Chưa có lịch sử thanh toán - tính từ ngày vay
            const paymentPeriod = installment.payment_period || 30;
            nextPaymentDueDate = new Date(loanDate);
            nextPaymentDueDate.setDate(loanDate.getDate() + paymentPeriod);
            nextPaymentDueDate.setHours(0, 0, 0, 0);
          }
        }
        
        // Nếu ngày cuối đóng tiền <= hôm nay => chậm trả
        if (nextPaymentDueDate <= today) {
          const lateDays = Math.floor((today.getTime() - nextPaymentDueDate.getTime()) / (1000 * 60 * 60 * 24));
          return {
            status: "Chậm trả",
            statusCode: 'LATE_INTEREST',
            description: `Chậm trả ${lateDays} ngày`
          };
        }

      } catch (error) {
        console.error('Error checking payment history:', error);
        // Nếu có lỗi khi kiểm tra lịch sử thanh toán, vẫn tiếp tục với logic khác
      }
    }

    // 6. Trường hợp mặc định - đang vay bình thường
    return {
      status: "Đang vay",
      statusCode: 'ACTIVE',
      description: "Hợp đồng đang hoạt động bình thường"
    };

  } catch (error) {
    console.error('Error calculating installment status:', error);
    throw error;
  }
}

/**
 * Tính toán status cho nhiều installments cùng lúc
 * @param installmentIds - Mảng các ID của installments cần tính status
 * @returns Promise<Record<string, InstallmentStatusResult>> - Object với key là installmentId và value là status result
 */
export async function calculateMultipleInstallmentStatus(
  installmentIds: string[],
): Promise<Record<string, InstallmentStatusResult>> {
  const { data, error } = await supabase
    .rpc('get_installment_statuses', { p_installment_ids: installmentIds });

  if (error) throw error;

  const map: Record<string, InstallmentStatusResult> = {};
  data.forEach((row: any) => {
    map[row.installment_id] = {
      status: row.status,
      statusCode: row.status_code,
      description: row.description,
    };
  });
  return map;
} 