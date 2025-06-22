import { supabase } from '../supabase';

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
  const { data: credit, error } = await supabase.rpc('get_credit_statuses', {
    p_credit_ids: [creditId],
  });

  if (error) {
    console.error('Error calculating credit status:', error);
    return {
      status: 'Đang vay',
      statusCode: 'ACTIVE',
    };
  }

  const code = credit?.[0]?.status_code;
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
  if (code === 'BAD_DEBT') {
    return {
      status: 'Nợ xấu',
      statusCode: 'BAD_DEBT',
    };
  }
  if (code === 'FINISHED') {
    return {
      status: 'Hoàn thành',
      statusCode: 'FINISHED',
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