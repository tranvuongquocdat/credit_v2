import { supabase } from "@/lib/supabase";
import { InstallmentWithCustomer } from "@/models/installment";

export async function getInstallmentWarnings(
  page: number = 1,
  limit: number = 10,
  storeId: string,
  customerFilter: string = ''
) {
  try {
    if (!storeId) {
      return { 
        data: [], 
        error: "Không có cửa hàng", 
        totalItems: 0,
        totalPages: 0
      };
    }

    const today = new Date().toISOString().split('T')[0]; // Use date only for comparison
    
    // Chỉ lấy các hợp đồng có payment_due_date <= ngày hiện tại
    // hoặc payment_due_date là null và loan_date <= ngày hiện tại
    let query = supabase
      .from('installments_by_store')
      .select(`
        *,
        customer:customers(*)
      `, { count: 'exact' })
      .eq('status', 'on_time')
      .eq('store_id', storeId)
      .or(`payment_due_date.lte.${today},and(payment_due_date.is.null,loan_date.lte.${today})`)
      .order('payment_due_date', { ascending: true })
      .range((page - 1) * limit, page * limit - 1);
    
    // Áp dụng filter theo tên khách hàng nếu có
    if (customerFilter) {
      const { data: matchingCustomers } = await supabase
        .from('customers')
        .select('id')
        .ilike('name', `%${customerFilter}%`);
      
      if (matchingCustomers && matchingCustomers.length > 0) {
        const customerIds = matchingCustomers.map(c => c.id);
        query = query.in('customer_id', customerIds);
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // Non-existent ID
      }
    }
    
    const { data: installments, error, count } = await query;
    
    if (error) throw error;
    
    // Map database model to UI model
    const mappedInstallments = installments?.map((item: any): InstallmentWithCustomer => ({
      id: item.id,
      contract_code: item.contract_code || '',
      customer_id: item.customer_id,
      employee_id: item.employee_id,
      
      // UI-specific fields
      amount_given: item.down_payment || 0,
      duration: item.loan_period || 0,
      payment_period: item.payment_period || 0,
      
      // Calculated fields
      amount_paid: 0,
      old_debt: item.debt_amount || 0,
      daily_amount: item.installment_amount ? 
        (item.installment_amount / (item.payment_period || 1)) : 0,
      remaining_amount: 0,
      
      status: item.status,
      due_date: item.payment_due_date || '',
      start_date: item.loan_date || '',
      payment_due_date: item.payment_due_date,
      
      notes: item.notes,
      store_id: item.store_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      
      // Additional fields
      down_payment: item.down_payment,
      installment_amount: item.installment_amount,
      loan_period: item.loan_period,
      loan_date: item.loan_date,
      debt_amount: item.debt_amount,
      
      // Customer info
      customer: item.customer,
    })) || [];
    
    return { 
      data: mappedInstallments, 
      error: null, 
      totalItems: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    };
  } catch (err) {
    console.error("Error in getInstallmentWarnings:", err);
    return { 
      data: [], 
      error: err instanceof Error ? err.message : "Unknown error", 
      totalItems: 0,
      totalPages: 0
    };
  }
} 