import { supabase } from './supabase';

// Định nghĩa các kiểu dữ liệu
export enum TransactionType {
  CREATE_CONTRACT = 'create_contract',
  UPDATE_CONTRACT = 'update_contract',
  PAYMENT = 'payment',
  CANCEL_PAYMENT = 'cancel_payment',
  CLOSE_CONTRACT = 'close_contract',
  REOPEN_CONTRACT = 'reopen_contract',
  ROTATE_CONTRACT = 'rotate_contract'
}

// DB model - map trực tiếp với database
export interface InstallmentAmountHistoryDB {
  id: string;
  installment_id: string;
  created_at?: string;
  employee_id: string;
  debit_amount: number;
  credit_amount: number;
  description: string;
  transaction_type: string;
}

// UI model - cho front-end
export interface InstallmentAmountHistory {
  id: string;
  installmentId: string;
  createdAt: string;
  employeeId: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
  transactionType: TransactionType;
}

/**
 * Lấy danh sách lịch sử giao dịch của một hợp đồng trả góp
 */
export async function getInstallmentAmountHistory(installmentId: string) {
  try {
    const { data, error } = await supabase
      .from('installment_amount_history')
      .select('*')
      .eq('installment_id', installmentId)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    // Transform data từ DB model sang UI model
    const history = data.map(item => transformHistory(item));
    
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
  employeeId: string,
  debitAmount?: number,
  creditAmount?: number,
  description: string,
  transactionType: TransactionType
}) {
  try {
    const { installmentId, employeeId, debitAmount = 0, creditAmount = 0, description, transactionType } = params;
    
    const { data, error } = await supabase
      .from('installment_amount_history')
      .insert({
        installment_id: installmentId,
        employee_id: employeeId,
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
 * Ghi lịch sử khi tạo mới hợp đồng
 */
export async function recordContractCreation(installmentId: string, employeeId: string, amount: number) {
  return createInstallmentAmountHistory({
    installmentId,
    employeeId,
    debitAmount: amount,
    description: 'Tạo mới hợp đồng',
    transactionType: TransactionType.CREATE_CONTRACT
  });
}

/**
 * Ghi lịch sử khi cập nhật hợp đồng
 */
export async function recordContractUpdate(installmentId: string, employeeId: string, description: string = 'Cập nhật hợp đồng') {
  return createInstallmentAmountHistory({
    installmentId,
    employeeId,
    description,
    transactionType: TransactionType.UPDATE_CONTRACT
  });
}

/**
 * Ghi lịch sử khi thanh toán một kỳ
 */
export async function recordPayment(installmentId: string, employeeId: string, amount: number) {
  return createInstallmentAmountHistory({
    installmentId,
    employeeId,
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
    employeeId,
    debitAmount: amount,
    description: 'Hủy đóng tiền hộ',
    transactionType: TransactionType.CANCEL_PAYMENT
  });
}

/**
 * Ghi lịch sử khi đóng hợp đồng
 */
export async function recordContractClosure(installmentId: string, employeeId: string) {
  return createInstallmentAmountHistory({
    installmentId,
    employeeId,
    description: 'Đóng hợp đồng',
    transactionType: TransactionType.CLOSE_CONTRACT
  });
}

/**
 * Ghi lịch sử khi mở lại hợp đồng
 */
export async function recordContractReopening(installmentId: string, employeeId: string) {
  return createInstallmentAmountHistory({
    installmentId,
    employeeId,
    description: 'Mở lại hợp đồng',
    transactionType: TransactionType.REOPEN_CONTRACT
  });
}

/**
 * Ghi lịch sử khi đảo hợp đồng
 */
export async function recordContractRotation(
  oldInstallmentId: string, 
  newInstallmentId: string, 
  employeeId: string, 
  remainingDebt: number
) {
  // Ghi lịch sử đóng hợp đồng cũ
  await recordContractClosure(oldInstallmentId, employeeId);
  
  // Ghi lịch sử tạo hợp đồng mới
  return createInstallmentAmountHistory({
    installmentId: newInstallmentId,
    employeeId,
    debitAmount: remainingDebt,
    description: `Đảo từ hợp đồng cũ (ID: ${oldInstallmentId})`,
    transactionType: TransactionType.ROTATE_CONTRACT
  });
}

/**
 * Chuyển đổi dữ liệu từ DB model sang UI model
 */
function transformHistory(item: InstallmentAmountHistoryDB): InstallmentAmountHistory {
  return {
    id: item.id,
    installmentId: item.installment_id,
    createdAt: item.created_at || new Date().toISOString(),
    employeeId: item.employee_id,
    debitAmount: item.debit_amount,
    creditAmount: item.credit_amount,
    description: item.description,
    transactionType: item.transaction_type as TransactionType
  };
} 