import { supabase } from './supabase';
import { CreateInstallmentParams, Installment, InstallmentFilters, InstallmentStatus, InstallmentWithCustomer } from '@/models/installment';

// Get all installments with pagination and filters
export async function getInstallments(
  page = 1,
  pageSize = 10,
  filters?: InstallmentFilters
) {
  try {
    let query = supabase
      .from('installments')
      .select(`
        *,
        customer:customers(
          id, name, phone, address, email
        )
      `, { count: 'exact' });
    
    // Apply filters if provided
    if (filters?.contract_code) {
      query = query.ilike('contract_code', `%${filters.contract_code}%`);
    }
    
    if (filters?.customer_name) {
      query = query.textSearch('customer.name', filters.customer_name);
    }
    
    if (filters?.start_date) {
      query = query.gte('start_date', filters.start_date);
    }
    
    if (filters?.end_date) {
      query = query.lte('start_date', filters.end_date);
    }
    
    if (filters?.duration) {
      query = query.eq('duration', filters.duration);
    }
    
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    
    if (filters?.store_id) {
      query = query.eq('store_id', filters.store_id);
    }
    
    // Calculate pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    // Execute query
    const { data, error, count } = await query
      .range(from, to)
      .order('created_at', { ascending: false });
      
    if (error) {
      throw error;
    }
    
    // Convert to typed result
    const installments = data as InstallmentWithCustomer[];
    
    // Calculate total pages
    const totalPages = Math.ceil((count || 0) / pageSize);
    
    return { 
      data: installments, 
      error: null, 
      count, 
      totalPages 
    };
  } catch (error: any) {
    console.error('Error fetching installments:', error);
    return { 
      data: [], 
      error, 
      count: 0, 
      totalPages: 0 
    };
  }
}

// Get a single installment by ID
export async function getInstallmentById(id: string) {
  try {
    const { data, error } = await supabase
      .from('installments')
      .select(`
        *,
        customer:customers(
          id, name, phone, address, email
        )
      `)
      .eq('id', id)
      .single();
      
    if (error) {
      throw error;
    }
    
    return { 
      data: data as InstallmentWithCustomer, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error fetching installment:', error);
    return { 
      data: null, 
      error 
    };
  }
}

// Create a new installment
export async function createInstallment(installment: CreateInstallmentParams) {
  try {
    // Calculate derived values
    const dailyAmount = installment.amount_given * (installment.interest_rate / 100) / installment.duration;
    const remainingAmount = installment.amount_given - (installment.amount_paid || 0);
    
    // Default status is ON_TIME if not provided
    const status = installment.status || InstallmentStatus.ON_TIME;
    
    // Generate due date by adding duration to start date
    const startDate = new Date(installment.start_date);
    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + installment.duration);
    
    // Prepare data
    const newInstallment = {
      ...installment,
      amount_paid: installment.amount_paid || 0,
      old_debt: installment.old_debt || 0,
      daily_amount: dailyAmount,
      remaining_amount: remainingAmount,
      status: status,
      due_date: dueDate.toISOString().split('T')[0]
    };
    
    // Insert into database
    const { data, error } = await supabase
      .from('installments')
      .insert(newInstallment)
      .select()
      .single();
      
    if (error) {
      throw error;
    }
    
    return { 
      data: data as Installment, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error creating installment:', error);
    return { 
      data: null, 
      error 
    };
  }
}

// Update an installment
export async function updateInstallment(id: string, installment: Partial<Installment>) {
  try {
    // If amount_paid is updated, recalculate remaining_amount
    if (installment.amount_paid !== undefined) {
      // Fetch current installment to get original amount
      const { data: currentInstallment } = await supabase
        .from('installments')
        .select('amount_given')
        .eq('id', id)
        .single();
        
      if (currentInstallment) {
        installment.remaining_amount = currentInstallment.amount_given - installment.amount_paid;
      }
    }
    
    const { data, error } = await supabase
      .from('installments')
      .update(installment)
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      throw error;
    }
    
    return { 
      data: data as Installment, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error updating installment:', error);
    return { 
      data: null, 
      error 
    };
  }
}

// Update installment status
export async function updateInstallmentStatus(id: string, status: InstallmentStatus) {
  try {
    const { data, error } = await supabase
      .from('installments')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      throw error;
    }
    
    return { 
      data: data as Installment, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error updating installment status:', error);
    return { 
      data: null, 
      error 
    };
  }
}

// Delete an installment (soft delete by changing status)
export async function deleteInstallment(id: string) {
  try {
    const { data, error } = await supabase
      .from('installments')
      .update({ status: InstallmentStatus.DELETED })
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      throw error;
    }
    
    return { 
      data: data as Installment, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error deleting installment:', error);
    return { 
      data: null, 
      error 
    };
  }
}

// Hard delete an installment (only for admin purposes)
export async function hardDeleteInstallment(id: string) {
  try {
    const { data, error } = await supabase
      .from('installments')
      .delete()
      .eq('id', id);
      
    if (error) {
      throw error;
    }
    
    return { 
      success: true, 
      error: null 
    };
  } catch (error: any) {
    console.error('Error hard deleting installment:', error);
    return { 
      success: false, 
      error 
    };
  }
}
