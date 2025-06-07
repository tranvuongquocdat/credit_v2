import { supabase } from '@/lib/supabase';
import { Extension } from '@/models/extension';
import { addDays, format } from 'date-fns';

/**
 * Lấy danh sách các khoản gia hạn theo credit_id
 * @param creditId - ID của hợp đồng
 */
export async function getExtensions(creditId: string): Promise<Extension[]> {
  try {
    const { data, error } = await supabase
      .from('credit_extension_histories')
      .select('*')
      .eq('credit_id', creditId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching extensions:', error);
      throw new Error(`Error fetching extensions: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Failed to fetch extensions:', error);
    throw error;
  }
}

/**
 * Thêm một khoản gia hạn mới
 * @param extension - Thông tin khoản gia hạn
 */
export async function addExtension(extension: Extension): Promise<Extension> {
  try {
    // Lấy thông tin hợp đồng để tính toán ngày kết thúc cũ
    const { data: creditData, error: creditError } = await supabase
      .from('credits')
      .select('loan_date')
      .eq('id', extension.credit_id)
      .single();

    if (creditError) {
      console.error('Error fetching credit:', creditError);
      throw new Error(`Error fetching credit: ${creditError.message}`);
    }

    if (!creditData) {
      throw new Error('Credit not found');
    }

    // Thêm vào bảng extensions
    // Lưu ý: from_date và to_date sẽ được tự động điền bởi trigger
    const { data, error } = await supabase
      .from('credit_history')
      .insert({
        credit_id: extension.credit_id,
        description: extension.notes || null,
        effective_date: extension.from_date,
        transaction_type: 'contract_extension',
        // Add temporary values that will be overwritten by the database trigger
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding extension:', error);
      throw new Error(`Error adding extension: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Failed to add extension:', error);
    throw error;
  }
}

/**
 * Xóa một khoản gia hạn
 * @param id - ID của khoản gia hạn cần xóa
 */
export async function deleteExtension(id: string): Promise<void> {
  try {
    // Trigger trước khi xóa sẽ tự động điều chỉnh loan_period của credit
    const { error } = await supabase
      .from('credit_extension_histories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting extension:', error);
      throw new Error(`Error deleting extension: ${error.message}`);
    }
  } catch (error) {
    console.error('Failed to delete extension:', error);
    throw error;
  }
}

/**
 * Cập nhật ngày đáo hạn của hợp đồng sau khi gia hạn
 * @param creditId - ID của hợp đồng
 * @param days - Số ngày gia hạn thêm
 */
export async function updateCreditEndDate(creditId: string, days: number): Promise<void> {
  try {
    // Lấy thông tin hiện tại của hợp đồng
    const { data: credit, error: fetchError } = await supabase
      .from('credits')
      .select('loan_date, loan_period')
      .eq('id', creditId)
      .single();
      
    if (fetchError) {
      throw new Error(`Error fetching credit: ${fetchError.message}`);
    }
    
    if (!credit) {
      throw new Error('Credit not found');
    }
    
    // Tính toán loan_period mới
    const newLoanPeriod = credit.loan_period + days;
    
    // Cập nhật loan_period trong credits
    // Lưu ý: Đây là logic dự phòng, thường thì việc cập nhật này đã được xử lý bởi trigger trong database
    const { error: updateError } = await supabase
      .from('credits')
      .update({ 
        loan_period: newLoanPeriod,
        updated_at: new Date().toISOString()
      })
      .eq('id', creditId);
      
    if (updateError) {
      throw new Error(`Error updating credit: ${updateError.message}`);
    }
  } catch (error) {
    console.error('Failed to update credit end date:', error);
    throw error;
  }
}
