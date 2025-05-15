import { supabase } from '@/lib/supabase';
import { PrincipalRepayment } from '@/models/principal-repayment';

// Định nghĩa kiểu dữ liệu phù hợp với schema của Supabase
// Giả định rằng chúng ta sẽ sử dụng bảng credits để lưu thông tin trả bớt gốc
// thông qua một trường JSON hoặc dùng bảng tạm thời

interface PrincipalRepaymentData {
  id?: string;
  credit_id: string;
  amount: number;
  repayment_date: string;
  notes?: string;
  created_at?: string;
}

/**
 * Lấy danh sách các khoản trả bớt gốc theo credit_id
 * @param creditId - ID của hợp đồng
 */
export async function getPrincipalRepayments(creditId: string): Promise<PrincipalRepayment[]> {
  try {
    // Trong phiên bản demo này, chúng ta trả về mảng rỗng
    // vì bảng principal_repayments có thể chưa được tạo trong schema
    // TODO: Thay thế bằng đoạn code thật khi đã tạo bảng principal_repayments
    
    /* 
    const { data, error } = await supabase
      .from('principal_repayments')
      .select('*')
      .eq('credit_id', creditId)
      .order('repayment_date', { ascending: false });
      
    if (error) {
      throw new Error(`Error fetching principal repayments: ${error.message}`);
    }
    
    return data || [];
    */
    
    console.log('Fetching principal repayments for credit ID:', creditId);
    // Trả về mảng rỗng cho phiên bản demo
    return [];
  } catch (error) {
    console.error('Failed to fetch principal repayments:', error);
    throw error;
  }
}

/**
 * Thêm một khoản trả bớt gốc mới
 * @param repayment - Thông tin khoản trả bớt gốc
 */
export async function addPrincipalRepayment(repayment: PrincipalRepayment): Promise<PrincipalRepayment> {
  try {
    // Trong phiên bản demo này, chúng ta chỉ log thông tin và giả vờ thêm thành công
    // TODO: Thay thế bằng đoạn code thật khi đã tạo bảng principal_repayments
    
    /*
    const { data, error } = await supabase
      .from('principal_repayments')
      .insert(repayment)
      .select()
      .single();
      
    if (error) {
      throw new Error(`Error adding principal repayment: ${error.message}`);
    }
    
    return data;
    */
    
    console.log('Adding principal repayment:', repayment);
    // Trả về đối tượng với ID giả cho phiên bản demo
    return {
      ...repayment,
      id: 'temp-' + Date.now()
    };
  } catch (error) {
    console.error('Failed to add principal repayment:', error);
    throw error;
  }
}

/**
 * Xóa một khoản trả bớt gốc
 * @param id - ID của khoản trả bớt gốc cần xóa
 */
export async function deletePrincipalRepayment(id: string): Promise<void> {
  try {
    // Trong phiên bản demo này, chúng ta chỉ log thông tin và giả vờ xóa thành công
    // TODO: Thay thế bằng đoạn code thật khi đã tạo bảng principal_repayments
    
    /*
    const { error } = await supabase
      .from('principal_repayments')
      .delete()
      .eq('id', id);
      
    if (error) {
      throw new Error(`Error deleting principal repayment: ${error.message}`);
    }
    */
    
    console.log('Deleting principal repayment with ID:', id);
  } catch (error) {
    console.error('Failed to delete principal repayment:', error);
    throw error;
  }
}

/**
 * Cập nhật thông tin gốc của hợp đồng sau khi trả bớt
 * @param creditId - ID của hợp đồng
 * @param amount - Số tiền trả bớt gốc
 */
export async function updateCreditPrincipal(creditId: string, amount: number): Promise<void> {
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
    
    // Tính toán số tiền gốc mới
    const newLoanAmount = Math.max(0, (credit?.loan_amount || 0) - amount);
    
    // Cập nhật hợp đồng
    const { error: updateError } = await supabase
      .from('credits')
      .update({ loan_amount: newLoanAmount })
      .eq('id', creditId);
      
    if (updateError) {
      throw new Error(`Error updating credit: ${updateError.message}`);
    }
  } catch (error) {
    console.error('Failed to update credit principal:', error);
    throw error;
  }
}
