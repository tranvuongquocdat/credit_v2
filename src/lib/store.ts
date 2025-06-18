import { supabase } from './supabase';
import { Store, StoreFormData } from '@/models/store';

// Interface cho dữ liệu tài chính cửa hàng
export interface StoreFinancialData {
  totalFund: number;      // Tổng quỹ/vốn đầu tư
  totalLoan: number;      // Tổng cho vay
  profit: number;         // Lợi nhuận/lãi dự kiến
  availableFund: number;  // Quỹ khả dụng
  oldDebt: number;        // Nợ cũ/nợ xấu
  collectedInterest?: number; // Lãi đã thu
}

const TABLE_NAME = 'stores';

// Lấy danh sách cửa hàng
export async function getStores(
  page: number = 1,
  limit: number = 10,
  searchQuery: string = '',
  statusFilter: string = ''
) {
  try {
    // Lấy thông tin user hiện tại từ getCurrentUser
    const { getCurrentUser } = await import('./auth');
    const currentUser = await getCurrentUser();
    
    if (!currentUser || !currentUser.id) {
      return { 
        data: [], 
        error: { message: 'Người dùng chưa đăng nhập' }, 
        count: 0,
        totalPages: 0
      };
    }

    const { id: userId, role } = currentUser;

    let query = supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact' })
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    // Áp dụng phân quyền theo role
    if (role === 'admin') {
      // Nếu là admin, chỉ lấy các store mà họ tạo (created_by = user_id)
      query = query.eq('created_by', userId);
    } else if (role === 'employee') {
      // Nếu là employee, lấy store mà họ thuộc về thông qua bảng employees
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('store_id')
        .eq('user_id', userId)
        .single();

      if (employeeError || !employeeData?.store_id) {
        return { 
          data: [], 
          error: { message: 'Không tìm thấy thông tin nhân viên hoặc cửa hàng' }, 
          count: 0,
          totalPages: 0
        };
      }

      // Lấy thông tin store mà employee thuộc về
      query = query.eq('id', employeeData.store_id);
    } else {
      // Các role khác không có quyền truy cập store
      return { 
        data: [], 
        error: { message: 'Không có quyền truy cập cửa hàng' }, 
        count: 0,
        totalPages: 0
      };
    }

    // Lọc theo trạng thái nếu có
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    // Tìm kiếm theo tên nếu có
    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    // Phân trang
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await query.range(from, to);
    
    if (error) {
      throw error;
    }

    console.log(data);
    return { 
      data: data as Store[], 
      error: null, 
      count,
      totalPages: count ? Math.ceil(count / limit) : 0
    };

  } catch (error) {
    console.error('Error fetching stores:', error);
    return { 
      data: [], 
      error, 
      count: 0,
      totalPages: 0
    };
  }
}

// Lấy thông tin cửa hàng theo ID
export async function getStoreById(id: string) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single();
  
  return { data: data as Store | null, error };
}

// Tạo cửa hàng mới
export async function createStore(storeData: StoreFormData) {
  const { getCurrentUser } = await import('./auth');
  const currentUser = await getCurrentUser();
  const userId = currentUser?.id;

  // Ensure required fields are not null
  const formattedData = {
    ...storeData,
    // Set required string fields to empty string if null
    name: storeData.name || '',
    address: storeData.address || '',
    phone: storeData.phone || '',
    is_deleted: false,
    created_at: new Date().toISOString(),
    created_by: userId
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(formattedData)
    .select();
  
  return { data: data?.[0] as Store | null, error };
}

// Cập nhật thông tin cửa hàng
export async function updateStore(id: string, storeData: Partial<StoreFormData>) {
  // Ensure nullable fields are properly handled
  const formattedData = {
    ...storeData,
    // Convert null to undefined for optional string fields
    address: storeData.address === null ? undefined : storeData.address,
    phone: storeData.phone === null ? undefined : storeData.phone,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(formattedData)
    .eq('id', id)
    .select();
  
  return { data: data?.[0] as Store | null, error };
}

// Xóa mềm cửa hàng
export async function deleteStore(id: string) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ 
      is_deleted: true,
      updated_at: new Date().toISOString() 
    })
    .eq('id', id);
  
  return { data, error };
}

// Lấy thông tin tài chính của cửa hàng
export async function getStoreFinancialData(storeId: string = '1'): Promise<StoreFinancialData> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('investment, cash_fund')
      .eq('id', storeId)
      .single();

    if (error) throw error;

    // Type assertion to handle the type mismatch
    const storeData = data as unknown as {
      investment?: number;
      cash_fund?: number;
    };

    // Access properties safely with the correct type
    return {
      totalFund: storeData.investment ?? 0,
      availableFund: storeData.cash_fund ?? 0,
      totalLoan: 0,
      oldDebt: 0,
      profit: 0,
      collectedInterest: 0
    };
  } catch (error) {
    console.error('Error fetching store financial data:', error);
    
    // Trả về dữ liệu mẫu nếu có lỗi
    return {
      totalFund: 130750000,
      totalLoan: 105000000,
      profit: 25750000,
      availableFund: 25750000,
      oldDebt: 0,
      collectedInterest: 8240000
    };
  }
}

// Lấy tất cả cửa hàng (không phân trang) - sử dụng cho select options
export async function getAllActiveStores() {
  try {
    // Lấy thông tin user hiện tại từ getCurrentUser
    const { getCurrentUser } = await import('./auth');
    const currentUser = await getCurrentUser();
    
    if (!currentUser || !currentUser.id) {
      return { data: [], error: { message: 'Người dùng chưa đăng nhập' } };
    }

    const { id: userId, role } = currentUser;

    let query = supabase
      .from(TABLE_NAME)
      .select('id, name')
      .eq('is_deleted', false)
      .eq('status', 'active');

    if (role === 'admin') {
      // Nếu là admin, lấy các store mà họ tạo (created_by = user_id)
      query = query.eq('created_by', userId);
    } else if (role === 'employee') {
      // Nếu là employee, lấy store mà họ thuộc về thông qua bảng employees
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('store_id')
        .eq('user_id', userId)
        .single();

      if (employeeError || !employeeData?.store_id) {
        return { data: [], error: { message: 'Không tìm thấy thông tin nhân viên hoặc cửa hàng' } };
      }

      // Lấy thông tin store mà employee thuộc về
      query = query.eq('id', employeeData.store_id);
    } else {
      // Các role khác không có quyền truy cập store
      return { data: [], error: { message: 'Không có quyền truy cập cửa hàng' } };
    }

    const { data, error } = await query.order('name');

    if (error) {
      throw error;
    }

    return { data: data as Pick<Store, 'id' | 'name'>[], error: null };

  } catch (error) {
    console.error('Error fetching stores:', error);
    return { data: [], error };
  }
}

// Update the cash fund of a store (add or subtract amount)
export async function updateStoreCashFund(storeId: string, amount: number) {
  try {
    // First get the current cash fund
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('cash_fund, investment')
      .eq('id', storeId)
      .single();
    
    if (error) throw error;
    
    // If no data, throw error
    if (!data) throw new Error('Store not found');
    
    // Calculate new cash fund (current + amount)
    // Amount can be negative to subtract from the fund
    const currentCashFund = data.cash_fund || 0;
    const currentInvestment = data.investment || 0;
    const newCashFund = currentCashFund + amount;
    const newInvestment = currentInvestment + amount;
    
    // Update the cash fund
    const { error: updateError } = await supabase
      .from(TABLE_NAME)
      .update({ 
        cash_fund: newCashFund,
        investment: newInvestment,
        updated_at: new Date().toISOString() 
      })
      .eq('id', storeId);
    
    if (updateError) throw updateError;
    
    return { success: true, error: null, newCashFund, newInvestment };
  } catch (error) {
    console.error('Error updating store cash fund:', error);
    return { success: false, error };
  }
}

// Update only the cash fund of a store without affecting investment
export async function updateStoreCashFundOnly(storeId: string, amount: number) {
  try {
    // First get the current cash fund
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('cash_fund')
      .eq('id', storeId)
      .single();
    
    if (error) throw error;
    
    // If no data, throw error
    if (!data) throw new Error('Store not found');
    
    // Calculate new cash fund (current + amount)
    // Amount can be negative to subtract from the fund
    const currentCashFund = data.cash_fund || 0;
    const newCashFund = currentCashFund + amount;
    
    // Update only the cash fund
    const { error: updateError } = await supabase
      .from(TABLE_NAME)
      .update({ 
        cash_fund: newCashFund,
        updated_at: new Date().toISOString() 
      })
      .eq('id', storeId);
    
    if (updateError) throw updateError;
    
    return { success: true, error: null, newCashFund };
  } catch (error) {
    console.error('Error updating store cash fund (only):', error);
    return { success: false, error };
  }
}

// Update cash fund based on all sources (similar to total-fund page logic)
export async function updateCashFundFromAllSources(storeId: string) {
  try {
    // Interface tương tự total-fund page
    interface GenericHistoryItem {
      id: string;
      created_at: string | null;
      description?: string | null;
      note?: string | null;
      transaction_type?: string | null;
      debit_amount?: number | null;
      credit_amount?: number | null;
      fund_amount?: number | null;
      amount?: number | null;
      contract_code?: string | null;
    }

    interface FundHistoryItem {
      id: string;
      date: string;
      description: string;
      transactionType: string;
      source: string;
      income: number;
      expense: number;
      contractCode?: string;
    }

    const allHistoryItems: FundHistoryItem[] = [];

    const processItems = (data: GenericHistoryItem[], source: string) => {
      if (data && data.length > 0) {
        data.forEach((item) => {
          if (!item.created_at) return;

          let amount = 0;
          if(source === 'Nguồn vốn'){
            amount = item.transaction_type === 'withdrawal' ? -Number(item.fund_amount || 0) : Number(item.fund_amount || 0);
          } else if(source === 'Thu chi'){
            amount = (item.credit_amount || 0) - (item.debit_amount || 0);
            if(amount === 0){
              amount = item.transaction_type === 'expense' ? -Number(item.amount || 0) : Number(item.amount || 0);
            }
          }
          else {
            amount = (item.credit_amount || 0) - (item.debit_amount || 0);
          }

          allHistoryItems.push({
            id: `${source.toLowerCase()}-${item.id}`,
            date: item.created_at,
            description: item.description || item.note || `Giao dịch ${source}`,
            transactionType: item.transaction_type || '',
            source,
            income: amount > 0 ? amount : 0,
            expense: amount < 0 ? -amount : 0,
            contractCode: item.contract_code || '-'
          });
        });
      }
    };

    const fetchAllData = async (query: any, pageSize: number = 1000) => {
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await query.range(from, from + pageSize - 1);
        
        if (error) {
          console.error('Error fetching data:', error);
          break;
        }

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return allData;
    };

    // Fetch credit history
    const creditHistoryData = await fetchAllData(
      supabase
        .from('credit_history')
        .select(`
          *,
          credits!inner (contract_code, store_id)
        `)
        .eq('credits.store_id', storeId)
        .or('is_deleted.is.null,is_deleted.eq.false')
    );
    
    if (creditHistoryData) {
      const processedCreditData = creditHistoryData.map(item => ({
        ...item,
        contract_code: item.credits?.contract_code || null
      }));
      processItems(processedCreditData, 'Tín chấp');
    }

    // Fetch pawn history
    const pawnHistoryData = await fetchAllData(
      supabase
        .from('pawn_history')
        .select(`
          *,
          pawns!inner (contract_code, store_id)
        `)
        .eq('pawns.store_id', storeId)
        .or('is_deleted.is.null,is_deleted.eq.false')
    );
    
    if (pawnHistoryData) {
      const processedPawnData = pawnHistoryData.map(item => ({
        ...item,
        contract_code: item.pawns?.contract_code || null
      }));
      processItems(processedPawnData, 'Cầm đồ');
    }

    // Fetch installment history
    const installmentHistoryData = await fetchAllData(
      supabase
        .from('installment_history')
        .select(`
          *,
          installments!inner (
            contract_code,
            employee_id,
            employees!inner (store_id)
          )
        `)
        .eq('installments.employees.store_id', storeId)
        .or('is_deleted.is.null,is_deleted.eq.false')
    );
    
    if (installmentHistoryData) {
      const processedInstallmentData = installmentHistoryData.map(item => ({
        ...item,
        contract_code: item.installments?.contract_code || null
      }));
      processItems(processedInstallmentData, 'Trả góp');
    }

    // Fetch store fund history
    const { data: storeFundData } = await supabase
      .from('store_fund_history')
      .select('*')
      .eq('store_id', storeId);
    
    if (storeFundData) {
      processItems(storeFundData, 'Nguồn vốn');
    }

    // Fetch income/expense from transactions table
    const { data: transactionData } = await supabase
      .from('transactions')
      .select('*')
      .eq('store_id', storeId);
    
    if (transactionData) {
      processItems(transactionData, 'Thu chi');
    }

    // Calculate grand total
    const grandTotal = allHistoryItems.reduce((sum, item) => sum + item.income - item.expense, 0);

    // Update store_total_fund table
    const { data: existingRecord } = await supabase
      .from('store_total_fund')
      .select('id')
      .eq('store_id', storeId)
      .limit(1)
      .single();

    if (existingRecord) {
      await supabase
        .from('store_total_fund')
        .update({
          total_fund: grandTotal,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRecord.id);
    } else {
      await supabase
        .from('store_total_fund')
        .insert({
          store_id: storeId,
          total_fund: grandTotal
        });
    }

    // Update stores table cash_fund
    await supabase
      .from('stores')
      .update({ cash_fund: grandTotal })
      .eq('id', storeId);

    return { success: true, error: null, newCashFund: grandTotal };
  } catch (error) {
    console.error('Error updating cash fund from all sources:', error);
    return { success: false, error };
  }
}
