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

    console.log("Executing query with:", { page, limit, storeId, customerFilter });
    
    // Lấy tất cả installments với status 'on_time' thuộc store
    let installmentQuery = supabase
      .from('installments_by_store')
      .select(`
        *,
        customer:customers(*)
      `)
      .eq('status', 'on_time')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
      
    // Áp dụng filter theo tên khách hàng nếu có
    if (customerFilter) {
        // First apply other filters, then we'll fetch customer IDs manually and apply a second filter
        const queryWithoutCustomerFilter = installmentQuery;
        
        // Get all customer IDs whose names match the filter
        const { data: matchingCustomers } = await supabase
          .from('customers')
          .select('id')
          .ilike('name', `%${customerFilter}%`);
        
        if (matchingCustomers && matchingCustomers.length > 0) {
          // Extract customer IDs
          const customerIds = matchingCustomers.map(c => c.id);
          // Apply in filter to original query
          installmentQuery = queryWithoutCustomerFilter.in('customer_id', customerIds);
        } else {
          // No matching customers, return empty result
          installmentQuery = queryWithoutCustomerFilter.eq('id', '00000000-0000-0000-0000-000000000000'); // Non-existent ID
        }
      }
    
    // Fetch data với count
    const { data: allInstallments, error: installmentsError, count } = await installmentQuery;
    
    if (installmentsError) {
      console.error("Error fetching installments:", installmentsError);
      throw installmentsError;
    }
    
    if (!allInstallments || allInstallments.length === 0) {
      return { 
        data: [], 
        error: null, 
        totalItems: 0,
        totalPages: 0
      };
    }
    
    // Lấy payment history cho mỗi installment để tìm ngày thanh toán cuối cùng
    const installmentIds = allInstallments.map(installment => installment.id);
    
    const { data: allPayments, error: paymentsError } = await supabase
      .from('installment_history')
      .select('installment_id, effective_date, transaction_type')
      .in('installment_id', installmentIds as string[])
      .eq('transaction_type', 'payment')
      .eq('is_deleted', false)
      .order('effective_date', { ascending: false });
      
    if (paymentsError) {
      console.error("Error fetching payment history:", paymentsError);
      throw paymentsError;
    }
    
    // Group payments by installment_id
    const latestPaymentByInstallmentId = new Map();
    
    if (allPayments && allPayments.length > 0) {
      allPayments.forEach(payment => {
        if (!latestPaymentByInstallmentId.has(payment.installment_id)) {
          latestPaymentByInstallmentId.set(payment.installment_id, payment.effective_date);
        }
      });
    }
    
    // Add latest payment date to each installment
    const installmentsWithLatestPayment = allInstallments.map(installment => {
      return {
        ...installment,
        latestPaymentPaidDate: latestPaymentByInstallmentId.get(installment.id) || null
      };
    });
    
    // Filter installments that need warning
    // nếu nhỏ hơn bằng hôm nay ( có giá trị trả về ), hoặc start_date nhỏ hơn bằng hôm nay ( nếu null) => cảnh báo
    const today = new Date();
    const warningInstallments = installmentsWithLatestPayment.filter(installment => {
      if (installment.latestPaymentPaidDate) {
        return new Date(installment.latestPaymentPaidDate) <= today;
      }
      return new Date(installment.loan_date || '') <= today;
    });
    
    // Map database model to UI model (InstallmentWithCustomer)
    const mapToInstallmentWithCustomer = (dbInstallment: any): InstallmentWithCustomer => {
      // Save the latestPaymentPaidDate to a temporary variable
      const latestPayment = dbInstallment.latestPaymentPaidDate;
      
      // Create a properly typed object without the invalid property
      const result: InstallmentWithCustomer = {
        id: dbInstallment.id,
        contract_code: dbInstallment.contract_code || '',
        customer_id: dbInstallment.customer_id,
        employee_id: dbInstallment.employee_id,
        
        // UI-specific fields
        amount_given: dbInstallment.down_payment || 0,
        duration: dbInstallment.loan_period || 0,
        payment_period: dbInstallment.payment_period || 0,
        
        // Calculated fields
        amount_paid: 0, // Would need actual calculation
        old_debt: dbInstallment.debt_amount || 0,
        daily_amount: dbInstallment.installment_amount ? 
          (dbInstallment.installment_amount / (dbInstallment.payment_period || 1)) : 0,
        remaining_amount: 0, // Would need actual calculation
        
        status: dbInstallment.status,
        due_date: dbInstallment.payment_due_date || '',
        start_date: dbInstallment.loan_date || '',
        payment_due_date: dbInstallment.payment_due_date,
        
        notes: dbInstallment.notes,
        store_id: dbInstallment.store_id,
        created_at: dbInstallment.created_at,
        updated_at: dbInstallment.updated_at,
        
        // Additional fields
        down_payment: dbInstallment.down_payment,
        installment_amount: dbInstallment.installment_amount,
        loan_period: dbInstallment.loan_period,
        loan_date: dbInstallment.loan_date,
        debt_amount: dbInstallment.debt_amount,
        
        // Customer info
        customer: dbInstallment.customer,
      };
      
      // Store the latest payment date in the notes field if needed
      if (latestPayment && !result.notes) {
        result.notes = `Latest payment: ${latestPayment}`;
      }
      
      return result;
    };

    // Apply mapping to each installment
    const mappedWarningInstallments = warningInstallments.map(mapToInstallmentWithCustomer);
    
    // Type assertion to bypass type check
    const typedWarningInstallments = mappedWarningInstallments as InstallmentWithCustomer[];
    
    // Apply pagination manually
    const offset = (page - 1) * limit;
    const paginatedInstallments = typedWarningInstallments.slice(offset, offset + limit);
    
    // Calculate total pages
    const totalItems = typedWarningInstallments.length;
    const totalPages = Math.ceil(totalItems / limit);
    
    console.log(`Query results: ${paginatedInstallments.length} items, total: ${totalItems}, pages: ${totalPages}`);
    
    return { 
      data: paginatedInstallments, 
      error: null, 
      totalItems,
      totalPages
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