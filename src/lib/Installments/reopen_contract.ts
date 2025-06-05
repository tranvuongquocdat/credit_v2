import { supabase } from '../supabase';
import { updateInstallment } from '../installment';
import { InstallmentStatus } from '@/models/installment';

/**
 * Mở lại hợp đồng đã đóng bằng cách đánh dấu xóa các lịch sử payment từ việc đóng hợp đồng
 * @param installmentId - ID của hợp đồng installment
 * @returns Promise<void>
 */
export async function reopenContract(installmentId: string): Promise<void> {
  try {
    console.log('Reopening contract:', installmentId);

    // 1. Lấy thông tin lịch sử đóng hợp đồng gần nhất
    const { data: contractCloseHistory, error: fetchError } = await supabase
      .from('installment_history')
      .select('credit_amount')
      .eq('installment_id', installmentId)
      .eq('transaction_type', 'contract_close')
      .eq('is_created_from_contract_closure', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      throw new Error(`Lỗi khi lấy lịch sử đóng hợp đồng: ${fetchError.message}`);
    }

    const contractCloseAmount = contractCloseHistory?.[0]?.credit_amount || 0;

    // 1.1. Lấy tổng số tiền payment từ việc đóng hợp đồng
    const { data: paymentHistory, error: paymentFetchError } = await supabase
      .from('installment_history')
      .select('credit_amount, debit_amount')
      .eq('installment_id', installmentId)
      .eq('transaction_type', 'payment')
      .eq('is_created_from_contract_closure', true);

    if (paymentFetchError) {
      throw new Error(`Lỗi khi lấy lịch sử payment: ${paymentFetchError.message}`);
    }

    // Tính tổng số tiền payment (installment_amount - debit_amount)
    const totalPaymentAmount = paymentHistory?.reduce((sum, record) => {
      return sum + (record.credit_amount || 0) - (record.debit_amount || 0);
    }, 0) || 0;

    // Tổng số tiền cần hoàn trả = contract_close + payment
    const totalDebitAmount = contractCloseAmount;

    // 2. Đánh dấu is_deleted = true cho tất cả payment records được tạo từ việc đóng hợp đồng
    const { error: updatePaymentError } = await supabase
      .from('installment_history')
      .update({ is_deleted: true })
      .eq('installment_id', installmentId)
      .eq('transaction_type', 'payment')
      .eq('is_created_from_contract_closure', true);

    if (updatePaymentError) {
      throw new Error(`Lỗi khi cập nhật lịch sử payment: ${updatePaymentError.message}`);
    }

    // 3. Ghi lịch sử mở lại hợp đồng với debit_amount = contract_close + payment
    const { error: insertReopenError } = await supabase
      .from('installment_history')
      .insert({
        installment_id: installmentId,
        transaction_type: 'contract_reopen',
        installment_amount: 0,
        debit_amount: totalDebitAmount,
        description: `Mở lại hợp đồng - hoàn trả ${totalDebitAmount.toLocaleString()} VND (đóng HĐ: ${contractCloseAmount.toLocaleString()} + lãi phí: ${totalPaymentAmount.toLocaleString()})`,
        is_created_from_contract_closure: false
      } as any);
    
    // 4. Update is_created_from_contract_closure installment history của payment về false
    const { error: updatePaymentIsCreatedFromContractClosureError } = await supabase
      .from('installment_history')
      .update({ is_created_from_contract_closure: false })
      .eq('installment_id', installmentId)
      .eq('transaction_type', 'payment')
      .eq('is_created_from_contract_closure', true);

    if (insertReopenError) {
      throw new Error(`Lỗi khi ghi lịch sử mở lại: ${insertReopenError.message}`);
    }

    // 4. Cập nhật status hợp đồng về on_time
    const { error: updateStatusError } = await updateInstallment(installmentId, {
      status: 'on_time' as InstallmentStatus
    });

    if (updateStatusError) {
      throw new Error('Không thể cập nhật trạng thái hợp đồng');
    }

    console.log(`✅ Successfully reopened contract: ${installmentId}`);
    console.log(`Contract close amount: ${contractCloseAmount}`);
    console.log(`Payment amount: ${totalPaymentAmount}`);
    console.log(`Total debit amount: ${totalDebitAmount}`);

  } catch (error) {
    console.error('Error reopening contract:', error);
    throw error;
  }
} 