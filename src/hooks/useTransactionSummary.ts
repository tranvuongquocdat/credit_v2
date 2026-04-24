'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { format, startOfDay, endOfDay, parse, parseISO } from 'date-fns';

// Import type definitions
import {
  TransactionSummary,
  FundHistoryItem,
  CreditHistoryRecord,
  PawnHistoryRecord,
  InstallmentHistoryRecord,
  StoreFundHistoryRecord,
  TransactionRecord,
  DisplayTransaction
} from '@/app/reports/transactionSummary/types';

// Function to fetch all data from a query with pagination
const fetchAllData = async (query: unknown, pageSize: number = 1000): Promise<unknown[]> => {
  let allData: unknown[] = [];
  let from = 0;
  let hasMore = true;

  // Cast query to proper type to avoid TypeScript issues
  const supabaseQuery = query as { range: (from: number, to: number) => Promise<{ data: unknown[] | null; error: unknown }> };

  while (hasMore) {
    const { data, error } = await supabaseQuery.range(from, from + pageSize - 1);

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

type GroupedHistoryRpcRow = {
  contract_code: string | null;
  transaction_date: string;
  transaction_type: string;
  is_deleted: boolean;
  credit_amount: number | string | null;
  debit_amount: number | string | null;
  cancel_date: string | null;
  group_ts: string | null;
  customer_name: string | null;
  employee_name: string | null;
};

type GroupedPawnHistoryRpcRow = GroupedHistoryRpcRow & {
  item_name: string | null;
};

const resolveGroupTs = (groupTs: string | null, transactionDate: string): string =>
  groupTs ?? `${transactionDate}T00:00:00`;

const fetchCreditHistoryByRpc = async (
  storeId: string,
  startDateISO: string,
  endDateISO: string
) => {
  const { data, error } = await (supabase as any).rpc('rpc_credit_history_grouped', {
    p_store_id: storeId,
    p_start_date: startDateISO,
    p_end_date: endDateISO,
  });

  if (error) throw error;

  return (((data || []) as unknown) as GroupedHistoryRpcRow[]).map((row, index) => ({
    id: `credit-rpc-${index}`,
    created_at: resolveGroupTs(row.group_ts, row.transaction_date),
    updated_at: row.cancel_date,
    is_deleted: row.is_deleted,
    transaction_type: row.transaction_type,
    credit_amount: Number(row.credit_amount || 0),
    debit_amount: Number(row.debit_amount || 0),
    contract_code: row.contract_code || null,
    credits: {
      contract_code: row.contract_code || null,
      customers: { name: row.customer_name || '' },
    },
    profiles: { username: row.employee_name || '' },
  }));
};

const fetchInstallmentHistoryByRpc = async (
  storeId: string,
  startDateISO: string,
  endDateISO: string
) => {
  const { data, error } = await (supabase as any).rpc('rpc_installment_history_grouped', {
    p_store_id: storeId,
    p_start_date: startDateISO,
    p_end_date: endDateISO,
  });

  if (error) throw error;

  return (((data || []) as unknown) as GroupedHistoryRpcRow[]).map((row, index) => ({
    id: `installment-rpc-${index}`,
    created_at: resolveGroupTs(row.group_ts, row.transaction_date),
    updated_at: row.cancel_date,
    is_deleted: row.is_deleted,
    transaction_type: row.transaction_type,
    credit_amount: Number(row.credit_amount || 0),
    debit_amount: Number(row.debit_amount || 0),
    contract_code: row.contract_code || null,
    installments: {
      contract_code: row.contract_code || null,
      customers: { name: row.customer_name || '' },
    },
    profiles: { username: row.employee_name || '' },
  }));
};

const fetchPawnHistoryByRpc = async (
  storeId: string,
  startDateISO: string,
  endDateISO: string
) => {
  const { data, error } = await (supabase as any).rpc('rpc_pawn_history_grouped', {
    p_store_id: storeId,
    p_start_date: startDateISO,
    p_end_date: endDateISO,
  });

  if (error) throw error;

  return (((data || []) as unknown) as GroupedPawnHistoryRpcRow[]).map((row, index) => ({
    id: `pawn-rpc-${index}`,
    created_at: resolveGroupTs(row.group_ts, row.transaction_date),
    updated_at: row.cancel_date,
    is_deleted: row.is_deleted,
    transaction_type: row.transaction_type,
    credit_amount: Number(row.credit_amount || 0),
    debit_amount: Number(row.debit_amount || 0),
    contract_code: row.contract_code || null,
    pawns: {
      contract_code: row.contract_code || null,
      customers: { name: row.customer_name || '' },
      collateral_detail:
        row.item_name != null && String(row.item_name).length > 0
          ? { name: row.item_name }
          : null,
    },
    profiles: { username: row.employee_name || '' },
  }));
};

type StoreFundGroupedRpcRow = {
  transaction_date: string;
  transaction_type: string;
  fund_amount: number | string | null;
  group_ts: string | null;
  customer_name: string | null;
};

const fetchStoreFundHistoryByRpc = async (
  storeId: string,
  startDateISO: string,
  endDateISO: string
) => {
  const { data, error } = await (supabase as any).rpc('rpc_store_fund_history_grouped', {
    p_store_id: storeId,
    p_start_date: startDateISO,
    p_end_date: endDateISO,
  });

  if (error) throw error;

  return (((data || []) as unknown) as StoreFundGroupedRpcRow[]).map((row, index) => ({
    id: `store-fund-rpc-${index}`,
    created_at: resolveGroupTs(row.group_ts, String(row.transaction_date)),
    transaction_type: row.transaction_type,
    fund_amount: Number(row.fund_amount ?? 0),
    name: row.customer_name ?? '',
  }));
};

type TransactionsGroupedRpcRow = {
  transaction_date: string;
  transaction_type: string | null;
  is_deleted: boolean;
  cancel_date: string | null;
  group_ts: string | null;
  credit_amount: number | string | null;
  debit_amount: number | string | null;
  customer_name: string | null;
  employee_name: string | null;
};

/** RPC đã group; map sang dòng giống sau transformTransactionsForDisplay — không gọi transform thêm. */
function expandTransactionsGroupedRpcToDisplayRows(rows: TransactionsGroupedRpcRow[]): any[] {
  const result: any[] = [];
  rows.forEach((r, i) => {
    const dateOnly = String(r.transaction_date).includes('T')
      ? String(r.transaction_date).slice(0, 10)
      : String(r.transaction_date);
    const baseCreated = resolveGroupTs(r.group_ts, dateOnly);
    const ca = Number(r.credit_amount ?? 0);
    const da = Number(r.debit_amount ?? 0);
    const cust = r.customer_name ?? '';
    const emp = r.employee_name ?? '';

    if (!r.is_deleted) {
      result.push({
        id: `transactions-rpc-${i}`,
        created_at: baseCreated,
        transaction_type: r.transaction_type,
        credit_amount: ca,
        debit_amount: da,
        employee_name: emp,
        customers: { name: cust },
        is_deleted: false,
      });
      return;
    }

    const cancelTs = r.cancel_date ?? baseCreated;
    result.push({
      id: `transactions-rpc-${i}`,
      created_at: baseCreated,
      update_at: cancelTs,
      transaction_type: r.transaction_type,
      credit_amount: ca,
      debit_amount: da,
      employee_name: emp,
      customers: { name: cust },
      is_deleted: true,
    });
    result.push({
      id: `transactions-rpc-${i}_cancel`,
      created_at: cancelTs,
      transaction_type: r.transaction_type,
      credit_amount: ca ? -ca : null,
      debit_amount: da ? -da : null,
      employee_name: emp,
      customers: { name: cust },
      is_deleted: true,
      is_cancellation: true,
    });
  });
  return result;
}

const fetchTransactionsGroupedByRpc = async (
  storeId: string,
  startDateISO: string,
  endDateISO: string
) => {
  const { data, error } = await (supabase as any).rpc('rpc_transactions_grouped', {
    p_store_id: storeId,
    p_start_date: startDateISO,
    p_end_date: endDateISO,
  });

  if (error) throw error;

  return expandTransactionsGroupedRpcToDisplayRows(
    ((data || []) as unknown) as TransactionsGroupedRpcRow[]
  );
};

// Event-sourced: tính fund tại 00:00 đầu ngày startDate (giờ VN) qua RPC.
// 00:00 VN (UTC+7) = 17:00 UTC ngày trước đó.
const fetchOpeningBalance = async (storeId: string, startDate: string): Promise<number> => {
  try {
    const asOf = `${startDate}T00:00:00+07:00`;
    const { data, error } = await (supabase as any).rpc('calc_cash_fund_as_of', {
      p_store_id: storeId,
      p_as_of: asOf,
    });
    if (error) throw error;
    return Number(data) || 0;
  } catch (err) {
    console.error('Error fetching opening balance:', err);
    return 0;
  }
};

// Event-sourced: fund hiện tại (p_as_of = NULL → NOW()).
const fetchClosingBalance = async (storeId: string): Promise<number> => {
  try {
    const { data, error } = await (supabase as any).rpc('calc_cash_fund_as_of', {
      p_store_id: storeId,
    });
    if (error) throw error;
    return Number(data) || 0;
  } catch (err) {
    console.error('Error fetching closing balance:', err);
    return 0;
  }
};

// Fetch employees for filter dropdown
const fetchEmployees = async (storeId: string): Promise<{full_name: string, username: string}[]> => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select(`
        full_name,
        profiles!inner(username)
      `)
      .eq('store_id', storeId)
      .eq('status', 'working')
      .not('full_name', 'is', null)
      .order('full_name');

    if (error) throw error;

    // Transform the data to flatten the structure
    const transformedData = (data || []).map(item => ({
      full_name: item.full_name,
      username: item.profiles?.username || ''
    }));

    return transformedData;
  } catch (err) {
    console.error('Error fetching employees:', err);
    return [];
  }
};

// Fetch transaction data using the exact same aggregation logic as TransactionDetailsTable
const fetchTransactionData = async (
  storeId: string,
  startDate: string,
  endDate: string,
  selectedTransactionType: string = 'all',
  selectedEmployee: string = 'all'
): Promise<{
  pawn: { income: number; expense: number };
  credit: { income: number; expense: number };
  installment: { income: number; expense: number };
  incomeExpense: { income: number; expense: number };
  capital: { income: number; expense: number };
}> => {
  try {
    const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
    const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
    const startDateISO = startDateObj.toISOString();
    const endDateISO = endDateObj.toISOString();

    // Helper similar to TransactionDetailsTable
    const translateTransactionType = (transactionType: string, isDeleted: boolean = false): string => {
      const translations: { [key: string]: string } = {
        payment: 'Đóng lãi',
        loan: 'Cho vay',
        additional_loan: 'Vay thêm',
        principal_repayment: 'Trả gốc',
        contract_close: 'Đóng HĐ',
        contract_close_adjustment: 'Điều chỉnh khi đóng HĐ',
        contract_reopen: 'Mở lại HĐ',
        debt_payment: 'Trả nợ',
        extension: 'Gia hạn',
        deposit: 'Nộp tiền',
        withdrawal: 'Rút tiền',
        income: 'Thu nhập',
        expense: 'Chi phí',
        penalty: 'Phạt',
        interest: 'Lãi',
        fee: 'Phí',
        refund: 'Hoàn tiền',
        initial_loan: 'Khoản vay ban đầu',
        update_contract: 'Cập nhật HĐ',
        contract_delete: 'Xóa HĐ',
        contract_extension: 'Gia hạn HĐ',
        contract_rotate: 'Đảo HĐ',
        thu_khac: 'Thu khác',
        thu_tra_quy: 'Thu trả quỹ',
        thu_tien_no: 'Thu tiền nợ',
        thu_tien_ung: 'Thu tiền ứng',
        thu_tien_phat: 'Thu tiền phạt',
        hoa_hong_thu: 'Hoa hồng thu',
        thu_ve: 'Thu vé',
        tra_luong: 'Trả lương',
        tra_lai_phi: 'Trả lãi phí',
        chi_tieu_dung: 'Chi tiêu dùng',
        chi_tra_quy: 'Chi trả quỹ',
        tam_ung: 'Tạm ứng',
        hoa_hong_chi: 'Hoa hồng chi',
        chi_ve: 'Chi vé',
        chi_van_phong: 'Chi văn phòng',
        chi_khac: 'Chi khác',
      };
      const base = translations[transactionType] || transactionType;
      if (isDeleted) {
        if (transactionType === 'payment') return 'Huỷ đóng lãi';
        return `Huỷ ${base}`;
      }
      return base;
    };

    type FundHistoryItem = {
      id: string;
      date: string;
      description: string;
      transactionType: string;
      source: string;
      income: number;
      expense: number;
      contractCode?: string;
      employeeName?: string;
      customerName?: string;
      itemName?: string;
    };

    const allHistoryItems: FundHistoryItem[] = [];

    const processItems = (data: any[], source: string) => {
      if (!data || data.length === 0) return;

      data.forEach((item) => {
        if (!item.created_at) return;

        const getCommonData = () => {
          let employeeName = '';
          if (source === 'Thu chi') {
            employeeName = item.employee_name || '';
          } else if (source === 'Cầm đồ' || source === 'Tín chấp' || source === 'Trả góp') {
            employeeName = item.profiles?.username || '';
          }

          let customerName = '';
          if (source === 'Cầm đồ') {
            customerName = item.pawns?.customers?.name || '';
          } else if (source === 'Tín chấp') {
            customerName = item.credits?.customers?.name || '';
          } else if (source === 'Trả góp') {
            customerName = item.installments?.customers?.name || '';
          } else if (source === 'Nguồn vốn') {
            customerName = (item as any).name || '';
          } else if (source === 'Thu chi') {
            customerName = (item as any).customers?.name || '';
          }

          let itemName = '';
          if (source === 'Cầm đồ') {
            try {
              if (item.pawns?.collateral_detail) {
                const detail = typeof item.pawns.collateral_detail === 'string'
                  ? JSON.parse(item.pawns.collateral_detail)
                  : item.pawns.collateral_detail;
                itemName = detail?.name || '';
              }
            } catch {}
          }
          return { employeeName, customerName, itemName };
        };

        if (source === 'Cầm đồ' || source === 'Tín chấp' || source === 'Trả góp') {
          const { employeeName, customerName, itemName } = getCommonData();
          const amount = (item.credit_amount || 0) - (item.debit_amount || 0);

          allHistoryItems.push({
            id: `${source.toLowerCase()}-${item.id}`,
            date: item.created_at,
            description: translateTransactionType(item.transaction_type, false),
            transactionType: item.transaction_type,
            source,
            income: amount > 0 ? amount : 0,
            expense: amount < 0 ? -amount : 0,
            contractCode: item.contract_code || '-',
            employeeName: employeeName || '',
            customerName: customerName || '',
            itemName: itemName || '',
          });

          if (item.is_deleted && item.updated_at) {
            allHistoryItems.push({
              id: `${source.toLowerCase()}-${item.id}-cancel`,
              date: item.updated_at,
              description: translateTransactionType(item.transaction_type, true),
              transactionType: item.transaction_type,
              source,
              income: amount < 0 ? -amount : 0,
              expense: amount > 0 ? amount : 0,
              contractCode: item.contract_code || '-',
              employeeName,
              customerName,
              itemName,
            });
          }
        } else {
          let amount = 0;
          if (source === 'Nguồn vốn') {
            amount = item.transaction_type === 'withdrawal' ? -Number(item.fund_amount || 0) : Number(item.fund_amount || 0);
          } else if (source === 'Thu chi') {
            amount = (item.credit_amount || 0) - (item.debit_amount || 0);
            if (amount === 0) {
              amount = item.transaction_type === 'expense' ? -Number(item.amount || 0) : Number(item.amount || 0);
            }
          } else {
            amount = (item.credit_amount || 0) - (item.debit_amount || 0);
          }

          const { employeeName, customerName, itemName } = getCommonData();
          allHistoryItems.push({
            id: `${source.toLowerCase()}-${item.id}`,
            date: item.created_at,
            description: translateTransactionType(item.transaction_type || ''),
            transactionType: item.transaction_type || '',
            source,
            income: amount > 0 ? amount : 0,
            expense: amount < 0 ? -amount : 0,
            contractCode: item.contract_code || '-',
            employeeName,
            customerName,
            itemName,
          });
        }
      });
    };

    // Fetch all relevant data (no date filter here; we filter after aggregation)
    // Logic cũ để đối chiếu:
    // const creditHistoryData = await fetchAllData(
    //   supabase
    //     .from('credit_history')
    //     .select(`
    //       id,
    //       created_at,
    //       updated_at,
    //       is_deleted,
    //       transaction_type,
    //       credit_amount,
    //       debit_amount,
    //       created_by,
    //       credits!inner (
    //         contract_code,
    //         store_id,
    //         customers (name)
    //       ),
    //       profiles:created_by (username)
    //     `)
    //     .eq('credits.store_id', storeId)
    //     .or(
    //       `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}), and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
    //     )
    //     .order('id')
    // );
    const creditHistoryData = await fetchCreditHistoryByRpc(storeId, startDateISO, endDateISO);
    if (creditHistoryData) processItems(creditHistoryData as any[], 'Tín chấp');

    // Logic cũ để đối chiếu:
    // const pawnHistoryData = await fetchAllData(
    //   supabase
    //     .from('pawn_history')
    //     .select(`
    //       id,
    //       created_at,
    //       updated_at,
    //       is_deleted,
    //       transaction_type,
    //       credit_amount,
    //       debit_amount,
    //       created_by,
    //       pawns!inner (
    //         contract_code,
    //         store_id,
    //         customers (name),
    //         collateral_detail
    //       ),
    //       profiles:created_by (username)
    //     `)
    //     .eq('pawns.store_id', storeId)
    //     .or(
    //       `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}), and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
    //     )
    //     .order('id')
    // );
    const pawnHistoryData = await fetchPawnHistoryByRpc(storeId, startDateISO, endDateISO);
    if (pawnHistoryData) processItems(pawnHistoryData as any[], 'Cầm đồ');

    // Logic cũ để đối chiếu:
    // const installmentHistoryData = await fetchAllData(
    //   supabase
    //     .from('installment_history')
    //     .select(`
    //       id,
    //       created_at,
    //       updated_at,
    //       is_deleted,
    //       transaction_type,
    //       credit_amount,
    //       debit_amount,
    //       created_by,
    //       installments!inner (
    //         contract_code,
    //         employee_id,
    //         employees!inner (store_id),
    //         customers (name)
    //       ),
    //       profiles:created_by (username)
    //     `)
    //     .eq('installments.employees.store_id', storeId)
    //     .or(
    //       `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}), and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
    //     )
    //     .not('transaction_type', 'in', '(contract_close,contract_rotate)')
    //     .order('id')
    // );
    const installmentHistoryData = await fetchInstallmentHistoryByRpc(storeId, startDateISO, endDateISO);
    if (installmentHistoryData) processItems(installmentHistoryData as any[], 'Trả góp');

    // Logic cũ để đối chiếu:
    // const storeFundData = await fetchAllData(
    //   supabase
    //     .from('store_fund_history')
    //     .select('*')
    //     .eq('store_id', storeId)
    //     .gte('created_at', startDateISO)
    //     .lte('created_at', endDateISO)
    //     .order('id')
    // );
    const storeFundData = await fetchStoreFundHistoryByRpc(storeId, startDateISO, endDateISO);
    if (storeFundData) processItems(storeFundData as any[], 'Nguồn vốn');

    // Logic cũ để đối chiếu:
    // const allTransactionsData = await fetchAllData(
    //   supabase
    //     .from('transactions')
    //     .select('*, customers:customer_id(name)')
    //     .eq('store_id', storeId)
    //     .gte('created_at', startDateISO)
    //     .lte('created_at', endDateISO)
    //     .order('id')
    // );
    // const transformTransactionsForDisplay = (rawTransactions: any[]) => {
    //   const displayTransactions: any[] = [];
    //   rawTransactions.forEach((transaction) => {
    //     if (transaction.is_deleted) {
    //       displayTransactions.push({
    //         ...transaction,
    //         is_cancellation: false,
    //       });
    //       displayTransactions.push({
    //         ...transaction,
    //         id: `${transaction.id}_cancel`,
    //         is_cancellation: true,
    //         created_at: transaction.update_at || transaction.created_at,
    //         credit_amount: transaction.credit_amount ? -transaction.credit_amount : null,
    //         debit_amount: transaction.debit_amount ? -transaction.debit_amount : null,
    //         description: transaction.credit_amount > 0 ? 'Huỷ thu' : 'Huỷ chi',
    //       });
    //     } else {
    //       displayTransactions.push({
    //         ...transaction,
    //         is_cancellation: false,
    //       });
    //     }
    //   });
    //   return displayTransactions;
    // };
    // const displayTransactionsData = transformTransactionsForDisplay(allTransactionsData);
    const displayTransactionsData = await fetchTransactionsGroupedByRpc(storeId, startDateISO, endDateISO);
    if (displayTransactionsData) processItems(displayTransactionsData, 'Thu chi');

    // Group by contract/date/type/source/description to aggregate as in details
    const groupedData = new Map<string, FundHistoryItem>();
    allHistoryItems.forEach((item) => {
      const transactionDate = new Date(item.date).toDateString();
      const groupKey = `${item.contractCode}-${transactionDate}-${item.transactionType}-${item.source}-${item.description}`;
      if (groupedData.has(groupKey)) {
        const existing = groupedData.get(groupKey)!;
        existing.income += item.income;
        existing.expense += item.expense;
        if (new Date(item.date) > new Date(existing.date)) {
          existing.date = item.date;
        }
      } else {
        groupedData.set(groupKey, { ...item });
      }
    });

    // Convert to array, sort by date desc
    let aggregatedTransactions = Array.from(groupedData.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Filter theo date range: RPC grouped trả row cross-day (gốc tạo D-5, huỷ D0)
    // với update_at trong range → expand tạo 2 items (gốc ở D-5, cancel ở D0).
    // Nếu không filter, cả 2 items đều cộng vào totals, inflate cả income lẫn
    // expense lên +X (dù net=0), lệch so với (closing - opening) của range.
    const rangeStart = new Date(`${startDate}T00:00:00+07:00`).getTime();
    const rangeEnd = new Date(`${endDate}T23:59:59.999+07:00`).getTime();
    aggregatedTransactions = aggregatedTransactions.filter((item) => {
      const t = new Date(item.date).getTime();
      return t >= rangeStart && t <= rangeEnd;
    });

    // Apply filters consistent with details table
    if (selectedTransactionType !== 'all') {
      aggregatedTransactions = aggregatedTransactions.filter(
        (item) => item.source === selectedTransactionType
      );
    }
    if (selectedEmployee !== 'all') {
      aggregatedTransactions = aggregatedTransactions.filter(
        (item) => item.employeeName === selectedEmployee
      );
    }

    // Totals by source
    const totalsBySource: { [key: string]: { income: number; expense: number } } = {
      'Tín chấp': { income: 0, expense: 0 },
      'Cầm đồ': { income: 0, expense: 0 },
      'Trả góp': { income: 0, expense: 0 },
      'Nguồn vốn': { income: 0, expense: 0 },
      'Thu chi': { income: 0, expense: 0 },
    };
    aggregatedTransactions.forEach((item) => {
      if (item.source in totalsBySource) {
        totalsBySource[item.source].income += item.income;
        totalsBySource[item.source].expense += item.expense;
      }
    });

    return {
      pawn: { income: totalsBySource['Cầm đồ'].income, expense: totalsBySource['Cầm đồ'].expense },
      credit: { income: totalsBySource['Tín chấp'].income, expense: totalsBySource['Tín chấp'].expense },
      installment: { income: totalsBySource['Trả góp'].income, expense: totalsBySource['Trả góp'].expense },
      incomeExpense: { income: totalsBySource['Thu chi'].income, expense: totalsBySource['Thu chi'].expense },
      capital: { income: totalsBySource['Nguồn vốn'].income, expense: totalsBySource['Nguồn vốn'].expense },
    };
  } catch (err) {
    console.error('Error fetching transaction data:', err);
    return {
      pawn: { income: 0, expense: 0 },
      credit: { income: 0, expense: 0 },
      installment: { income: 0, expense: 0 },
      incomeExpense: { income: 0, expense: 0 },
      capital: { income: 0, expense: 0 },
    };
  }
};

// Fetch transaction details for the detailed table
const fetchTransactionDetails = async (
  storeId: string,
  startDate: string,
  endDate: string,
  selectedTransactionType: string = 'all',
  selectedEmployee: string = 'all'
): Promise<FundHistoryItem[]> => {
  try {
    const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
    const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
    const startDateISO = startDateObj.toISOString();
    const endDateISO = endDateObj.toISOString();

    // Helper similar to TransactionDetailsTable
    const translateTransactionType = (transactionType: string, isDeleted: boolean = false): string => {
      const translations: { [key: string]: string } = {
        payment: 'Đóng lãi',
        loan: 'Cho vay',
        additional_loan: 'Vay thêm',
        principal_repayment: 'Trả gốc',
        contract_close: 'Đóng HĐ',
        contract_close_adjustment: 'Điều chỉnh khi đóng HĐ',
        contract_reopen: 'Mở lại HĐ',
        debt_payment: 'Trả nợ',
        extension: 'Gia hạn',
        deposit: 'Nộp tiền',
        withdrawal: 'Rút tiền',
        income: 'Thu nhập',
        expense: 'Chi phí',
        penalty: 'Phạt',
        interest: 'Lãi',
        fee: 'Phí',
        refund: 'Hoàn tiền',
        initial_loan: 'Khoản vay ban đầu',
        update_contract: 'Cập nhật HĐ',
        contract_delete: 'Xóa HĐ',
        contract_extension: 'Gia hạn HĐ',
        contract_rotate: 'Đảo HĐ',
        thu_khac: 'Thu khác',
        thu_tra_quy: 'Thu trả quỹ',
        thu_tien_no: 'Thu tiền nợ',
        thu_tien_ung: 'Thu tiền ứng',
        thu_tien_phat: 'Thu tiền phạt',
        hoa_hong_thu: 'Hoa hồng thu',
        thu_ve: 'Thu vé',
        tra_luong: 'Trả lương',
        tra_lai_phi: 'Trả lãi phí',
        chi_tieu_dung: 'Chi tiêu dùng',
        chi_tra_quy: 'Chi trả quỹ',
        tam_ung: 'Tạm ứng',
        hoa_hong_chi: 'Hoa hồng chi',
        chi_ve: 'Chi vé',
        chi_van_phong: 'Chi văn phòng',
        chi_khac: 'Chi khác'
      };
      const base = translations[transactionType] || transactionType;
      if (isDeleted) {
        if (transactionType === 'payment') return 'Huỷ đóng lãi';
        return `Huỷ ${base}`;
      }
      return base;
    };

    const allHistoryItems: FundHistoryItem[] = [];

    const processItems = (data: any[], source: string) => {
      if (!data || data.length === 0) return;

      data.forEach((item) => {
        if (!item.created_at) return;

        const getCommonData = () => {
          let employeeName = '';
          if (source === 'Thu chi') {
            employeeName = item.employee_name || '';
          } else if (source === 'Cầm đồ' || source === 'Tín chấp' || source === 'Trả góp') {
            employeeName = item.profiles?.username || '';
          }

          let customerName = '';
          if (source === 'Cầm đồ') {
            customerName = item.pawns?.customers?.name || '';
          } else if (source === 'Tín chấp') {
            customerName = item.credits?.customers?.name || '';
          } else if (source === 'Trả góp') {
            customerName = item.installments?.customers?.name || '';
          } else if (source === 'Nguồn vốn') {
            customerName = (item as any).name || '';
          } else if (source === 'Thu chi') {
            customerName = (item as any).customers?.name || '';
          }

          let itemName = '';
          if (source === 'Cầm đồ') {
            try {
              if (item.pawns?.collateral_detail) {
                const detail = typeof item.pawns.collateral_detail === 'string'
                  ? JSON.parse(item.pawns.collateral_detail)
                  : item.pawns.collateral_detail;
                itemName = detail.name || '';
              }
            } catch {}
          }
          return { employeeName, customerName, itemName };
        };

        if (source === 'Cầm đồ' || source === 'Tín chấp' || source === 'Trả góp') {
          const { employeeName, customerName, itemName } = getCommonData();
          const amount = (item.credit_amount || 0) - (item.debit_amount || 0);

          allHistoryItems.push({
            id: `${source.toLowerCase()}-${item.id}`,
            date: item.created_at,
            description: translateTransactionType(item.transaction_type, false),
            transactionType: item.transaction_type,
            source,
            income: amount > 0 ? amount : 0,
            expense: amount < 0 ? -amount : 0,
            contractCode: item.contract_code || '-',
            employeeName,
            customerName,
            itemName
          });

          if (item.is_deleted && item.updated_at) {
            allHistoryItems.push({
              id: `${source.toLowerCase()}-${item.id}-cancel`,
              date: item.updated_at,
              description: translateTransactionType(item.transaction_type, true),
              transactionType: item.transaction_type,
              source,
              income: amount < 0 ? -amount : 0,
              expense: amount > 0 ? amount : 0,
              contractCode: item.contract_code || '-',
              employeeName,
              customerName,
              itemName
            });
          }
        } else {
          let amount = 0;
          if (source === 'Nguồn vốn') {
            amount = item.transaction_type === 'withdrawal' ? -Number(item.fund_amount || 0) : Number(item.fund_amount || 0);
          } else if (source === 'Thu chi') {
            amount = (item.credit_amount || 0) - (item.debit_amount || 0);
            if (amount === 0) {
              amount = item.transaction_type === 'expense' ? -Number(item.amount || 0) : Number(item.amount || 0);
            }
          } else {
            amount = (item.credit_amount || 0) - (item.debit_amount || 0);
          }

          const { employeeName, customerName, itemName } = getCommonData();

          allHistoryItems.push({
            id: `${source.toLowerCase()}-${item.id}`,
            date: item.created_at,
            description: translateTransactionType(item.transaction_type || ''),
            transactionType: item.transaction_type || '',
            source,
            income: amount > 0 ? amount : 0,
            expense: amount < 0 ? -amount : 0,
            contractCode: item.contract_code || '-',
            employeeName,
            customerName,
            itemName
          });
        }
      });
    };

    // Fetch all relevant data (no date filter here; we filter after aggregation)
    // Logic cũ để đối chiếu:
    // const creditHistoryData = await fetchAllData(
    //   supabase
    //     .from('credit_history')
    //     .select(`
    //       id,
    //       created_at,
    //       updated_at,
    //       is_deleted,
    //       transaction_type,
    //       credit_amount,
    //       debit_amount,
    //       created_by,
    //       credits!inner (
    //         contract_code,
    //         store_id,
    //         customers (name)
    //       ),
    //       profiles:created_by (username)
    //     `)
    //     .eq('credits.store_id', storeId)
    //     .or(
    //       `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}), and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
    //     )
    //     .order('id')
    // );
    const creditHistoryData = await fetchCreditHistoryByRpc(storeId, startDateISO, endDateISO);
    if (creditHistoryData) processItems(creditHistoryData as any[], 'Tín chấp');

    // Logic cũ để đối chiếu:
    // const pawnHistoryData = await fetchAllData(
    //   supabase
    //     .from('pawn_history')
    //     .select(`
    //       id,
    //       created_at,
    //       updated_at,
    //       is_deleted,
    //       transaction_type,
    //       credit_amount,
    //       debit_amount,
    //       created_by,
    //       pawns!inner (
    //         contract_code,
    //         store_id,
    //         customers (name),
    //         collateral_detail
    //       ),
    //       profiles:created_by (username)
    //     `)
    //     .eq('pawns.store_id', storeId)
    //     .or(
    //       `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}), and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
    //     )
    //     .order('id')
    // );
    const pawnHistoryData = await fetchPawnHistoryByRpc(storeId, startDateISO, endDateISO);
    if (pawnHistoryData) processItems(pawnHistoryData as any[], 'Cầm đồ');

    // Logic cũ để đối chiếu:
    // const installmentHistoryData = await fetchAllData(
    //   supabase
    //     .from('installment_history')
    //     .select(`
    //       id,
    //       created_at,
    //       updated_at,
    //       is_deleted,
    //       transaction_type,
    //       credit_amount,
    //       debit_amount,
    //       created_by,
    //       installments!inner (
    //         contract_code,
    //         employee_id,
    //         employees!inner (store_id),
    //         customers (name)
    //       ),
    //       profiles:created_by (username)
    //     `)
    //     .eq('installments.employees.store_id', storeId)
    //     .or(
    //       `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}), and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
    //     )
    //     .not('transaction_type', 'in', '(contract_close,contract_rotate)')
    //     .order('id')
    // );
    const installmentHistoryData = await fetchInstallmentHistoryByRpc(storeId, startDateISO, endDateISO);
    if (installmentHistoryData) processItems(installmentHistoryData as any[], 'Trả góp');

    // Logic cũ để đối chiếu:
    // const storeFundData = await fetchAllData(
    //   supabase
    //     .from('store_fund_history')
    //     .select('*')
    //     .eq('store_id', storeId)
    //     .gte('created_at', startDateISO)
    //     .lte('created_at', endDateISO)
    //     .order('id')
    // );
    const storeFundData = await fetchStoreFundHistoryByRpc(storeId, startDateISO, endDateISO);
    if (storeFundData) processItems(storeFundData as any[], 'Nguồn vốn');

    // Logic cũ để đối chiếu:
    // const allTransactionsData = await fetchAllData(
    //   supabase
    //     .from('transactions')
    //     .select('*, customers:customer_id(name)')
    //     .eq('store_id', storeId)
    //     .gte('created_at', startDateISO)
    //     .lte('created_at', endDateISO)
    //     .order('id')
    // );
    // const transformTransactionsForDisplay = (rawTransactions: any[]) => {
    //   const displayTransactions: any[] = [];
    //   rawTransactions.forEach((transaction) => {
    //     if (transaction.is_deleted) {
    //       displayTransactions.push({
    //         ...transaction,
    //         is_cancellation: false,
    //       });
    //       displayTransactions.push({
    //         ...transaction,
    //         id: `${transaction.id}_cancel`,
    //         is_cancellation: true,
    //         created_at: transaction.update_at || transaction.created_at,
    //         credit_amount: transaction.credit_amount ? -transaction.credit_amount : null,
    //         debit_amount: transaction.debit_amount ? -transaction.debit_amount : null,
    //         description: transaction.credit_amount > 0 ? 'Huỷ thu' : 'Huỷ chi',
    //       });
    //     } else {
    //       displayTransactions.push({
    //         ...transaction,
    //         is_cancellation: false,
    //       });
    //     }
    //   });
    //   return displayTransactions;
    // };
    // const displayTransactionsData = transformTransactionsForDisplay(allTransactionsData);
    const displayTransactionsData = await fetchTransactionsGroupedByRpc(storeId, startDateISO, endDateISO);
    if (displayTransactionsData) processItems(displayTransactionsData, 'Thu chi');

    // Group by contract/date/type/source/description to aggregate as in details
    const groupedData = new Map<string, FundHistoryItem>();
    allHistoryItems.forEach((item) => {
      const transactionDate = new Date(item.date).toDateString();
      const groupKey = `${item.contractCode}-${transactionDate}-${item.transactionType}-${item.source}-${item.description}`;
      if (groupedData.has(groupKey)) {
        const existing = groupedData.get(groupKey)!;
        existing.income += item.income;
        existing.expense += item.expense;
        if (new Date(item.date) > new Date(existing.date)) {
          existing.date = item.date;
        }
      } else {
        groupedData.set(groupKey, { ...item });
      }
    });

    // Convert to array, sort by date desc
    let aggregatedTransactions = Array.from(groupedData.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Apply filters consistent with details table
    if (selectedTransactionType !== 'all') {
      aggregatedTransactions = aggregatedTransactions.filter(
        (item) => item.source === selectedTransactionType
      );
    }
    if (selectedEmployee !== 'all') {
      aggregatedTransactions = aggregatedTransactions.filter(
        (item) => item.employeeName === selectedEmployee
      );
    }

    return aggregatedTransactions;
  } catch (err) {
    console.error('Error fetching transaction details:', err);
    return [];
  }
};

/**
 * Hook for fetching opening balance with caching
 */
export function useTransactionSummaryOpeningBalance(storeId: string, startDate: string) {
  return useQuery({
    queryKey: queryKeys.transactionSummary.openingBalance(storeId, startDate),
    queryFn: () => fetchOpeningBalance(storeId, startDate),
    enabled: !!storeId && !!startDate,
    staleTime: 10 * 60 * 1000, // 10 minutes cache for opening balance
    gcTime: 30 * 60 * 1000, // 30 minutes garbage collection
  });
}

/**
 * Hook for fetching closing balance with caching
 */
export function useTransactionSummaryClosingBalance(storeId: string) {
  return useQuery({
    queryKey: queryKeys.transactionSummary.closingBalance(storeId),
    queryFn: () => fetchClosingBalance(storeId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000, // 2 minutes cache for closing balance
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
  });
}

/**
 * Hook for fetching employees with caching
 */
export function useTransactionSummaryEmployees(storeId: string) {
  return useQuery({
    queryKey: queryKeys.transactionSummary.employees(storeId),
    queryFn: () => fetchEmployees(storeId),
    enabled: !!storeId,
    staleTime: 15 * 60 * 1000, // 15 minutes cache for employees
    gcTime: 30 * 60 * 1000, // 30 minutes garbage collection
  });
}

/**
 * Hook for fetching transaction summary data with caching
 */
export function useTransactionSummaryData(
  storeId: string,
  startDate: string,
  endDate: string,
  selectedTransactionType?: string,
  selectedEmployee?: string
) {
  return useQuery({
    queryKey: queryKeys.transactionSummary.summary(storeId, startDate, endDate, selectedTransactionType, selectedEmployee),
    queryFn: () => fetchTransactionData(storeId, startDate, endDate, selectedTransactionType, selectedEmployee),
    enabled: !!storeId && !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000, // 5 minutes cache for summary data
    gcTime: 15 * 60 * 1000, // 15 minutes garbage collection
  });
}

/**
 * Hook for fetching transaction details with caching
 */
export function useTransactionSummaryDetails(
  storeId: string,
  startDate: string,
  endDate: string,
  selectedTransactionType?: string,
  selectedEmployee?: string
) {
  return useQuery({
    queryKey: queryKeys.transactionSummary.transactionDetails(storeId, startDate, endDate, selectedTransactionType, selectedEmployee),
    queryFn: () => fetchTransactionDetails(storeId, startDate, endDate, selectedTransactionType, selectedEmployee),
    enabled: !!storeId && !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000, // 5 minutes cache for details data
    gcTime: 15 * 60 * 1000, // 15 minutes garbage collection
  });
}

/**
 * Hook for fetching complete transaction summary with all data
 */
export function useTransactionSummary(
  storeId: string,
  startDate: string,
  endDate: string,
  selectedTransactionType?: string,
  selectedEmployee?: string
) {
  const openingBalanceQuery = useTransactionSummaryOpeningBalance(storeId, startDate);
  const closingBalanceQuery = useTransactionSummaryClosingBalance(storeId);
  const employeesQuery = useTransactionSummaryEmployees(storeId);
  const summaryQuery = useTransactionSummaryData(storeId, startDate, endDate, selectedTransactionType, selectedEmployee);
  const detailsQuery = useTransactionSummaryDetails(storeId, startDate, endDate, selectedTransactionType, selectedEmployee);

  return {
    openingBalance: openingBalanceQuery.data || 0,
    closingBalance: closingBalanceQuery.data || 0,
    employees: employeesQuery.data || [],
    summary: summaryQuery.data || {
      pawn: { income: 0, expense: 0 },
      credit: { income: 0, expense: 0 },
      installment: { income: 0, expense: 0 },
      incomeExpense: { income: 0, expense: 0 },
      capital: { income: 0, expense: 0 }
    },
    transactionDetails: detailsQuery.data || [],
    isLoading: openingBalanceQuery.isLoading || closingBalanceQuery.isLoading || employeesQuery.isLoading || summaryQuery.isLoading || detailsQuery.isLoading,
    error: openingBalanceQuery.error || closingBalanceQuery.error || employeesQuery.error || summaryQuery.error || detailsQuery.error,
    refetch: () => {
      openingBalanceQuery.refetch();
      closingBalanceQuery.refetch();
      employeesQuery.refetch();
      summaryQuery.refetch();
      detailsQuery.refetch();
    }
  };
}