import { supabase } from './supabase';
import { getCurrentUser } from './auth';

// Định nghĩa các kiểu dữ liệu
export enum TransactionType {
  CREATE_CONTRACT = 'create_contract',
  UPDATE_CONTRACT = 'update_contract',
  PAYMENT = 'payment',
  CANCEL_PAYMENT = 'payment_cancel',
  CLOSE_CONTRACT = 'contract_close',
  REOPEN_CONTRACT = 'contract_reopen',
  ROTATE_CONTRACT = 'contract_rotate',
  DEBT_PAYMENT = 'debt_payment',
  CONTRACT_DELETE = 'contract_delete'
}

// DB model - map trực tiếp với database
export interface InstallmentAmountHistoryDB {
  id: string | number;
  installment_id: string;
  created_at?: string | null;
  created_by: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  description: string | null;
  transaction_type: string;
  is_deleted: boolean | null;
  updated_at: string | null;
}

// UI model - cho front-end
export interface InstallmentAmountHistory {
  id: string;
  installmentId: string;
  createdAt: string;
  createdBy: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
  transactionType: TransactionType;
  updated_at?: string | null;
  is_deleted?: boolean | null;
}

/**
 * Lấy danh sách lịch sử giao dịch của một hợp đồng trả góp
 */
export async function getInstallmentAmountHistory(installmentId: string) {
  const PAGE_SIZE = 1000; // Supabase giới hạn 1000 bản ghi / query

  try {
    let offset = 0;
    let hasMore = true;
    const allRows: InstallmentAmountHistoryDB[] = [];

    while (hasMore) {
      const { data, error } = await supabase
        .from('installment_history')
        .select('id, installment_id, created_at, created_by, debit_amount, credit_amount, description, transaction_type, is_deleted, updated_at')
        .eq('installment_id', installmentId)
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

      if (data && data.length) {
        allRows.push(...data);
        // Nếu nhận đủ PAGE_SIZE thì có thể còn trang tiếp theo
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          offset += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    const history = allRows.map(transformHistory);

    return {
      data: history,
      error: null
    };
  } catch (error) {
    console.error('Error fetching installment amount history:', error);
    return {
      data: null,
      error
    };
  }
}

/**
 * Thêm mới một bản ghi lịch sử giao dịch
 */
export async function createInstallmentAmountHistory(params: {
  installmentId: string,
  debitAmount?: number,
  creditAmount?: number,
  description: string,
  transactionType: TransactionType
}) {
  try {
    const { installmentId, debitAmount = 0, creditAmount = 0, description, transactionType } = params;
    const { id: userId } = await getCurrentUser();
    const { data, error } = await supabase
      .from('installment_history')
      .insert({
        installment_id: installmentId,
        created_by: userId,
        debit_amount: debitAmount,
        credit_amount: creditAmount,
        description,
        transaction_type: transactionType
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      data: transformHistory(data),
      error: null
    };
  } catch (error) {
    console.error('Error creating installment amount history:', error);
    return {
      data: null,
      error
    };
  }
}

/**
 * Ghi lại lịch sử khi thanh toán nợ
 */
export async function recordDebtPayment(installmentId: string, employeeId: string, amount: number) {
  if (amount < 0) return createInstallmentAmountHistory({
    installmentId,
    creditAmount: Math.abs(amount),
    description: 'Thanh toán nợ',
    transactionType: TransactionType.DEBT_PAYMENT
  });
  return createInstallmentAmountHistory({
    installmentId,
    debitAmount: amount,
    description: 'Thanh toán nợ',
    transactionType: TransactionType.DEBT_PAYMENT
  });
}

/**
 * Ghi lịch sử khi tạo mới hợp đồng
 */
export async function recordContractCreation(installmentId: string, employeeId: string, amount: number) {
  return createInstallmentAmountHistory({
    installmentId,
    debitAmount: amount,
    description: 'Tạo mới hợp đồng',
    transactionType: TransactionType.CREATE_CONTRACT
  });
}

/**
 * Ghi lịch sử khi cập nhật hợp đồng
 */
export async function recordContractUpdate(installmentId: string, downPayment: number, oldDownPayment: number, employeeId: string, description: string = 'Cập nhật hợp đồng') {
  return createInstallmentAmountHistory({
    installmentId,
    description,
    debitAmount: downPayment,
    creditAmount: oldDownPayment,
    transactionType: TransactionType.UPDATE_CONTRACT
  });
}

/**
 * Ghi lịch sử khi thanh toán một kỳ
 */
export async function recordPayment(installmentId: string, employeeId: string, amount: number) {
  return createInstallmentAmountHistory({
    installmentId,
    creditAmount: amount,
    description: 'Đóng tiền hộ',
    transactionType: TransactionType.PAYMENT
  });
}

/**
 * Ghi lịch sử khi hủy thanh toán
 */
export async function recordCancelPayment(installmentId: string, employeeId: string, amount: number) {
  return createInstallmentAmountHistory({
    installmentId,
    debitAmount: amount,
    description: 'Hủy đóng tiền hộ',
    transactionType: TransactionType.CANCEL_PAYMENT
  });
}

/**
 * Ghi lịch sử khi đóng hợp đồng
 */
export async function recordContractClosure(installmentId: string) {
  return createInstallmentAmountHistory({
    installmentId,
    description: 'Đóng hợp đồng',
    transactionType: TransactionType.CLOSE_CONTRACT
  });
}

/**
 * Ghi lịch sử khi mở lại hợp đồng
 */
export async function recordContractReopening(installmentId: string) {
  return createInstallmentAmountHistory({
    installmentId,
    description: 'Mở lại hợp đồng',
    transactionType: TransactionType.REOPEN_CONTRACT
  });
}

/**
 * Ghi lịch sử khi đảo hợp đồng
 */
export async function recordContractRotation(
  newInstallmentId: string, 
) {

  // Ghi lịch sử tạo hợp đồng mới
  return createInstallmentAmountHistory({
    installmentId: newInstallmentId,
    description: `Đảo từ hợp đồng cũ`,
    transactionType: TransactionType.ROTATE_CONTRACT
  });
}

/**
 * Record a bulk payment transaction (for multiple periods at once)
 */
export async function recordBulkPayment(
  installmentId: string,
  amount: number,
  periodCount: number
) {
  try {
    const { id: userId } = await getCurrentUser();
    const payload = {
      installment_id: installmentId,
      created_by: userId,
      credit_amount: amount,
      debit_amount: 0,
      description: `Đóng lãi ${periodCount} kỳ`,
      transaction_type: TransactionType.PAYMENT
    };
    
    const { data, error } = await supabase
      .from('installment_history')
      .insert(payload)
      .select();
      
    if (error) throw error;
    
    return {
      data: data ? data[0] : null,
      error: null
    };
  } catch (error) {
    console.error('Error recording bulk payment history:', error);
    return {
      data: null,
      error
    };
  }
}

/**
 * Record installment contract deletion
 */
export async function recordInstallmentContractDeletion(
  installmentId: string,
  downPayment: number,
  description?: string
) {
  return createInstallmentAmountHistory({
    installmentId,
    creditAmount: downPayment, // Positive for credit (returning the down payment)
    description: description || 'Xóa hợp đồng trả góp',
    transactionType: TransactionType.CONTRACT_DELETE
  });
}

/**
 * Chuyển đổi dữ liệu từ DB model sang UI model
 */
function transformHistory(item: InstallmentAmountHistoryDB): InstallmentAmountHistory {
  return {
    id: String(item.id),
    installmentId: item.installment_id,
    createdAt: item.created_at || new Date().toISOString(),
    createdBy: item.created_by || '',
    debitAmount: item.debit_amount || 0,
    creditAmount: item.credit_amount || 0,
    description: item.description || '',
    transactionType: item.transaction_type as TransactionType,
    is_deleted: item.is_deleted || false,
    updated_at: item.updated_at || null
  };
} 