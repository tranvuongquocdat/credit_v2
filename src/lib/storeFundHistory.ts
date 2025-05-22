import { supabase } from './supabase';
import { StoreFundHistory, StoreFundHistoryFormData } from '@/models/storeFundHistory';
import { updateStoreCashFund } from './store';

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
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Update store cash fund based on transaction type
    // For deposits, add to cash fund; for withdrawals, subtract from cash fund
    let amountChange = data.fund_amount;
    if (data.transaction_type === 'withdrawal' || 
        data.transaction_type === 'expense') {
      amountChange = -data.fund_amount; // Negative for withdrawals and expenses
    }

    await updateStoreCashFund(data.store_id, amountChange);

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
        note: newData.note || null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Calculate adjustment to the store cash fund
    let adjustment = 0;

    // Reverse the old transaction effect
    if (oldType === 'withdrawal' || oldType === 'expense') {
      adjustment += oldAmount; // Add back what was withdrawn
    } else if (oldType === 'deposit' || oldType === 'interest') {
      adjustment -= oldAmount; // Subtract what was deposited
    }

    // Apply the new transaction effect
    if (newData.transaction_type === 'withdrawal' || newData.transaction_type === 'expense') {
      adjustment -= newData.fund_amount; // Subtract the new withdrawal
    } else if (newData.transaction_type === 'deposit' || newData.transaction_type === 'interest') {
      adjustment += newData.fund_amount; // Add the new deposit
    }

    // Only update the cash fund if there's an actual adjustment
    if (adjustment !== 0) {
      await updateStoreCashFund(newData.store_id, adjustment);
    }

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

    // Adjust the store cash fund based on the deleted transaction type
    let adjustment = 0;
    if (record.transaction_type === 'withdrawal' || record.transaction_type === 'expense') {
      adjustment = record.fund_amount; // Add back what was withdrawn
    } else if (record.transaction_type === 'deposit' || record.transaction_type === 'interest') {
      adjustment = -record.fund_amount; // Subtract what was deposited
    }

    if (adjustment !== 0) {
      await updateStoreCashFund(record.store_id, adjustment);
    }

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