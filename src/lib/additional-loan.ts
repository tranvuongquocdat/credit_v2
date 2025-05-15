import { supabase } from '@/lib/supabase';
import { AdditionalLoan } from '@/models/additional-loan';

/**
 * Lấy danh sách các khoản vay thêm theo credit_id
 * @param creditId - ID của hợp đồng
 */
export async function getAdditionalLoans(creditId: string): Promise<AdditionalLoan[]> {
  try {
    // Trong phiên bản demo, trả về mảng rỗng vì bảng có thể chưa được tạo
    console.log('Fetching additional loans for credit ID:', creditId);
    return [];
  } catch (error) {
    console.error('Failed to fetch additional loans:', error);
    throw error;
  }
}

/**
 * Thêm một khoản vay thêm mới
 * @param loan - Thông tin khoản vay thêm
 */
export async function addAdditionalLoan(loan: AdditionalLoan): Promise<AdditionalLoan> {
  try {
    // Trong phiên bản demo, chỉ log thông tin và trả về đối tượng giả
    console.log('Adding additional loan:', loan);
    return {
      ...loan,
      id: 'temp-' + Date.now()
    };
  } catch (error) {
    console.error('Failed to add additional loan:', error);
    throw error;
  }
}

/**
 * Xóa một khoản vay thêm
 * @param id - ID của khoản vay thêm cần xóa
 */
export async function deleteAdditionalLoan(id: string): Promise<void> {
  try {
    // Trong phiên bản demo, chỉ log thông tin
    console.log('Deleting additional loan with ID:', id);
  } catch (error) {
    console.error('Failed to delete additional loan:', error);
    throw error;
  }
}

/**
 * Cập nhật số tiền gốc của hợp đồng sau khi vay thêm
 * @param creditId - ID của hợp đồng
 * @param amount - Số tiền vay thêm
 */
export async function updateCreditWithAdditionalLoan(creditId: string, amount: number): Promise<void> {
  try {
    // Lấy thông tin hiện tại của hợp đồng
    const { data: credit, error: fetchError } = await supabase
      .from('credits')
      .select('loan_amount')
      .eq('id', creditId)
      .single();
      
    if (fetchError) {
      throw new Error(`Error fetching credit: ${fetchError.message}`);
    }
    
    // Tính toán số tiền gốc mới (cộng thêm số vay thêm)
    const newLoanAmount = (credit?.loan_amount || 0) + amount;
    
    // Giả lập cập nhật hợp đồng
    console.log(`Updating credit ${creditId} loan amount: ${credit?.loan_amount} + ${amount} = ${newLoanAmount}`);
    
    // Uncomment khi cần thực hiện thật
    /*
    const { error: updateError } = await supabase
      .from('credits')
      .update({ loan_amount: newLoanAmount })
      .eq('id', creditId);
      
    if (updateError) {
      throw new Error(`Error updating credit: ${updateError.message}`);
    }
    */
  } catch (error) {
    console.error('Failed to update credit with additional loan:', error);
    throw error;
  }
}
