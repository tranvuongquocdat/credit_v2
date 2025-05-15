import { supabase } from '@/lib/supabase';
import { Extension } from '@/models/extension';
import { addDays, format } from 'date-fns';

/**
 * Lấy danh sách các khoản gia hạn theo credit_id
 * @param creditId - ID của hợp đồng
 */
export async function getExtensions(creditId: string): Promise<Extension[]> {
  try {
    // Trong phiên bản demo, trả về mảng rỗng vì bảng có thể chưa được tạo
    console.log('Fetching extensions for credit ID:', creditId);
    return [];
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
    // Trong phiên bản demo, chỉ log thông tin và trả về đối tượng giả
    console.log('Adding extension:', extension);
    return {
      ...extension,
      id: 'temp-' + Date.now()
    };
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
    // Trong phiên bản demo, chỉ log thông tin
    console.log('Deleting extension with ID:', id);
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
    // Trong phiên bản demo, chúng ta sử dụng ngày hiện tại + 30 ngày làm ngày đáo hạn giả định
    // vì có thể bảng credits không có trường end_date
    
    /*
    // Lấy thông tin hiện tại của hợp đồng
    const { data: credit, error: fetchError } = await supabase
      .from('credits')
      .select('end_date')
      .eq('id', creditId)
      .single();
      
    if (fetchError) {
      throw new Error(`Error fetching credit: ${fetchError.message}`);
    }
    
    if (!credit?.end_date) {
      throw new Error('Credit end date not found');
    }
    
    // Tính toán ngày đáo hạn mới
    const currentEndDate = new Date(credit.end_date);
    */
    
    // Sử dụng ngày hiện tại + 30 ngày làm ngày đáo hạn giả định
    const currentEndDate = addDays(new Date(), 30);
    const newEndDate = addDays(currentEndDate, days);
    
    // Giả lập cập nhật hợp đồng
    console.log(`Updating credit ${creditId} end date: ${format(currentEndDate, 'yyyy-MM-dd')} → ${format(newEndDate, 'yyyy-MM-dd')} (+ ${days} days)`);
    
    // Uncomment khi cần thực hiện thật
    /*
    const { error: updateError } = await supabase
      .from('credits')
      .update({ end_date: format(newEndDate, 'yyyy-MM-dd') })
      .eq('id', creditId);
      
    if (updateError) {
      throw new Error(`Error updating credit: ${updateError.message}`);
    }
    */
  } catch (error) {
    console.error('Failed to update credit end date:', error);
    throw error;
  }
}
