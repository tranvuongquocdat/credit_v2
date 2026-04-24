import { supabase } from './supabase';
import { StoreFundHistory, StoreFundHistoryFormData } from '@/models/storeFundHistory';

const TABLE_NAME = 'store_fund_history';

/**
 * Get store fund history records with pagination, search, and filters
 */
export async function getStoreFundHistory(
  storeId: string,
  page: number = 1,
  pageSize: number = 10,
  dateFrom?: string,
  dateTo?: string,
  transactionType?: string
) {
  try {
    let query = supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    // Apply date range filter if provided
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    if (dateTo) {
      // Add one day to include the end date
      const nextDay = new Date(dateTo);
      nextDay.setDate(nextDay.getDate() + 1);
      query = query.lt('created_at', nextDay.toISOString());
    }

    // Apply transaction type filter if provided
    if (transactionType && transactionType !== 'all') {
      query = query.eq('transaction_type', transactionType);
    }

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    // Calculate total pages
    const totalPages = count ? Math.ceil(count / pageSize) : 0;

    return {
      data: data as StoreFundHistory[],
      error: null,
      count,
      totalPages,
    };
  } catch (error) {
    console.error('Error fetching store fund history:', error);
    return {
      data: [] as StoreFundHistory[],
      error,
      count: 0,
      totalPages: 0,
    };
  }
}

/**
 * Create a new store fund history record
 */
export async function createStoreFundHistory(data: StoreFundHistoryFormData) {
  try {
    // Create transaction record
    const { data: newRecord, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        store_id: data.store_id,
        fund_amount: data.fund_amount,
        transaction_type: data.transaction_type,
        note: data.note || null,
        created_at: new Date().toISOString(),
        name: data.name || null
      })
      .select()
      .single();

    if (error) throw error;

    // KHÔNG cần update stores.cash_fund — RPC calc_cash_fund_as_of tự derive
    // từ store_fund_history (đã được insert ở trên).

    return {
      data: newRecord as StoreFundHistory,
      error: null
    };
  } catch (error) {
    console.error('Error creating store fund history:', error);
    return {
      data: null,
      error
    };
  }
}

/**
 * Update a store fund history record
 * Note: This will also adjust the store cash fund
 */
export async function updateStoreFundHistory(id: string, newData: StoreFundHistoryFormData, oldAmount: number, oldType: string) {
  try {
    // Get the old record first to calculate the difference
    const { data: oldRecord, error: fetchError } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!oldRecord) throw new Error('Record not found');

    // Update the record
    const { data: updatedRecord, error } = await supabase
      .from(TABLE_NAME)
      .update({
        fund_amount: newData.fund_amount,
        transaction_type: newData.transaction_type,
        note: newData.note || null,
        name: newData.name || null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // KHÔNG cần update stores.cash_fund — RPC derive từ store_fund_history.

    return {
      data: updatedRecord as StoreFundHistory,
      error: null
    };
  } catch (error) {
    console.error('Error updating store fund history:', error);
    return {
      data: null,
      error
    };
  }
}

/**
 * Delete a store fund history record
 */
export async function deleteStoreFundHistory(id: string) {
  try {
    // Get the record first to know how to adjust the cash fund
    const { data: record, error: fetchError } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!record) throw new Error('Record not found');

    // Delete the record
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) throw error;

    // KHÔNG cần update stores.cash_fund — RPC derive từ store_fund_history.

    return {
      success: true,
      error: null
    };
  } catch (error) {
    console.error('Error deleting store fund history:', error);
    return {
      success: false,
      error
    };
  }
}

export async function recordInstallmentPaymentFundTransaction(
  storeId: string,
  amount: number,
  isAddingFunds: boolean,
  installmentId: string,
  periodNumber: number,
  customerName?: string
) {
  try {
    const transactionType = isAddingFunds ? 'interest' : 'withdrawal';
    const operation = isAddingFunds ? 'Cộng' : 'Trừ';
    
    // Create the fund history record
    const historyData: StoreFundHistoryFormData = {
      store_id: storeId,
      fund_amount: Math.abs(amount), // Always store as positive
      transaction_type: transactionType,
      created_at: new Date().toISOString(),
      note: `${operation} tiền kỳ ${periodNumber} cho HĐ trả góp ${installmentId}`,
      name: customerName || null
    };
    
    // Create transaction record
    const { data: newRecord, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        store_id: historyData.store_id,
        fund_amount: historyData.fund_amount,
        transaction_type: historyData.transaction_type,
        note: historyData.note,
        created_at: new Date().toISOString(),
        name: historyData.name
      })
      .select()
      .single();

    if (error) throw error;

    // KHÔNG cần update stores.cash_fund — RPC derive từ store_fund_history.

    return {
      data: newRecord as StoreFundHistory,
      error: null
    };
  } catch (error) {
    console.error('Error recording installment payment fund transaction:', error);
    return {
      data: null,
      error
    };
  }
}

// Record a transaction for a new installment creation (deduct the amount given to customer)
export async function recordNewInstallmentFundTransaction(
  storeId: string,
  customerId: string,
  customerName: string,
  amount: number,
  installmentId: string
) {
  try {
    // Create the fund history record - this is a withdrawal since we're giving money to customer
    const historyData: StoreFundHistoryFormData = {
      store_id: storeId,
      fund_amount: Math.abs(amount), // Always store as positive
      transaction_type: 'withdrawal',
      created_at: new Date().toISOString(),
      note: `Tiền giao khách ${customerName} (ID: ${customerId}) cho HĐ trả góp ${installmentId}`,
      name: customerName
    };
    
    // Create transaction record
    const { data: newRecord, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        store_id: historyData.store_id,
        fund_amount: historyData.fund_amount,
        transaction_type: historyData.transaction_type,
        note: historyData.note,
        created_at: new Date().toISOString(),
        name: historyData.name
      })
      .select()
      .single();

    if (error) throw error;

    // KHÔNG cần update stores.cash_fund — RPC derive từ store_fund_history.

    return {
      data: newRecord as StoreFundHistory,
      error: null
    };
  } catch (error) {
    console.error('Error recording new installment fund transaction:', error);
    return {
      data: null,
      error
    };
  }
} 