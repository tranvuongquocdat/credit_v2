'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { format, startOfDay, endOfDay, parse, parseISO } from 'date-fns';

// Import type definitions
import {
  CashbookSummary,
  PawnTransaction,
  CreditTransaction,
  InstallmentTransaction,
  Transaction,
  CapitalTransaction
} from '@/app/reports/cashbook/components/types';
import { mergePawnCloseAdjustment } from '@/lib/Pawns/mergeCloseAdjustment';

// Type definitions for database records
interface PawnHistoryRecord {
  id: string;
  created_at: string;
  description: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  transaction_type: string | null;
  is_deleted: boolean | null;
  pawns: {
    contract_code: string;
    store_id: string;
  } | null;
  updated_at: string | null;
}

interface CreditHistoryRecord {
  id: string;
  created_at: string;
  description: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  transaction_type: string | null;
  is_deleted: boolean | null;
  credits: {
    contract_code: string;
    store_id: string;
  } | null;
  updated_at: string | null;
}

interface InstallmentHistoryRecord {
  id: string;
  created_at: string;
  updated_at: string | null;
  description: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  transaction_type: string | null;
  is_deleted: boolean | null;
  installments: {
    contract_code: string;
    employee_id: string;
    employees: {
      store_id: string;
    } | null;
  } | null;
}

interface TransactionRecord {
  id: string;
  created_at: string;
  updated_at: string | null;
  description: string | null;
  transaction_type: string | null;
  amount: number | null;
  credit_amount: number | null;
  debit_amount: number | null;
  is_deleted: boolean | null;
  store_id: string;
}

interface StoreFundRecord {
  id: string;
  created_at: string;
  note: string | null;
  fund_amount: number | null;
  transaction_type: string | null;
  store_id: string;
}

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

// Event-sourced: fund tại 00:00 đầu ngày startDate (giờ VN).
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

// Event-sourced: fund hiện tại.
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

// Fetch all transaction data and calculate summary
const fetchTransactionData = async (
  storeId: string,
  startDate: string,
  endDate: string
): Promise<{
  pawn: PawnTransaction[];
  credit: CreditTransaction[];
  installment: InstallmentTransaction[];
  incomeExpense: Transaction[];
  capital: CapitalTransaction[];
  summary: {
    pawn: number;
    credit: number;
    installment: number;
    incomeExpense: number;
    capital: number;
  };
}> => {
  try {
    const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
    const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));

    // Format dates for query
    const startDateISO = startDateObj.toISOString();
    const endDateISO = endDateObj.toISOString();

    // Fetch pawn transactions
    const pawnHistoryData = await fetchAllData(
      supabase
        .from('pawn_history')
        .select(`
          *,
          pawns!inner (contract_code, store_id)
        `)
        .eq('pawns.store_id', storeId)
        .or(
          `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}), and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
        )
        .order('created_at', { ascending: false })
    );

    // Gộp contract_close_adjustment vào contract_close (cùng pawn_id + cùng ngày) để hiển thị 1 dòng
    const mergedPawnHistory = mergePawnCloseAdjustment(pawnHistoryData as any as PawnHistoryRecord[]);

    // Format pawn data for transaction list
    const formattedPawnData: PawnTransaction[] = (mergedPawnHistory as PawnHistoryRecord[]).map((item: PawnHistoryRecord) => ({
      id: item.id,
      date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
      contractCode: item.pawns?.contract_code || 'N/A',
      customerName: 'N/A',
      description: item.description || 'Giao dịch cầm đồ',
      loanAmount: item.debit_amount || 0,
      interestAmount: item.credit_amount || 0,
      transactionType: item.transaction_type || '',
      createdAt: item.created_at || '',
      isDeleted: item.is_deleted || false,
      updatedAt: item.updated_at || ''
    }));

    // Fetch credit transactions
    const creditHistoryData = await fetchAllData(
      supabase
        .from('credit_history')
        .select(`
          *,
          credits!inner (contract_code, store_id)
        `)
        .eq('credits.store_id', storeId)
        .or(
          `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}), and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
        )
        .order('created_at', { ascending: false })
    );

    // Format credit data for transaction list
    const formattedCreditData: CreditTransaction[] = (creditHistoryData as CreditHistoryRecord[]).map((item: CreditHistoryRecord) => ({
      id: item.id,
      date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
      contractCode: item.credits?.contract_code || 'N/A',
      customerName: 'N/A',
      description: item.description || 'Giao dịch tín chấp',
      loanAmount: item.debit_amount || 0,
      interestAmount: item.credit_amount || 0,
      transactionType: item.transaction_type || '',
      createdAt: item.created_at || '',
      isDeleted: item.is_deleted || false,
      updatedAt: item.updated_at || ''
    }));

    // Fetch installment transactions
    const installmentHistoryData = await fetchAllData(
      supabase
      .from('installment_history')
      .select(`
        id,
        created_at,
        updated_at,
        is_deleted,
        transaction_type,
        credit_amount,
        debit_amount,
        installments!inner (
          contract_code,
          employee_id,
          employees!inner (store_id)
        )
      `)
      .eq('installments.employees.store_id', storeId)
      .or(
        `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}), and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
      )
      .order('created_at', { ascending: false })
    );

    // Format installment data for transaction list
    const formattedInstallmentData: InstallmentTransaction[] = (installmentHistoryData as InstallmentHistoryRecord[]).map((item: InstallmentHistoryRecord) => ({
      id: item.id,
      date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
      contractCode: item.installments?.contract_code || 'N/A',
      customerName: 'N/A',
      description: item.description || 'Giao dịch trả góp',
      loanAmount: item.debit_amount || 0,
      interestAmount: item.credit_amount || 0,
      transactionType: item.transaction_type || '',
      createdAt: item.created_at || '',
      isDeleted: item.is_deleted || false,
      updatedAt: item.updated_at || ''
    }));

    // Fetch transactions (income/expense) - Remove is_deleted filter and apply transform logic
    const allTransactionsData = await fetchAllData(
      supabase
        .from('transactions')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })

    );

    // Transform transactions to display format (same as income/outgoing pages)
    const transformTransactionsForDisplay = (rawTransactions: TransactionRecord[]) => {
      const displayTransactions: (TransactionRecord & { is_cancellation?: boolean })[] = [];

      rawTransactions.forEach(transaction => {
        if (transaction.is_deleted) {
          // Add original transaction record
          displayTransactions.push({
            ...transaction,
            is_cancellation: false,
          });

          // Add cancellation record
          displayTransactions.push({
            ...transaction,
            id: `${transaction.id}_cancel`,
            is_cancellation: true,
            created_at: transaction.updated_at || transaction.created_at,
            // Reverse amounts for cancellation
            credit_amount: transaction.credit_amount ? -transaction.credit_amount : null,
            debit_amount: transaction.debit_amount ? -transaction.debit_amount : null,
          });
        } else {
          // Add normal transaction record
          displayTransactions.push({
            ...transaction,
            is_cancellation: false,
          });
        }
      });

      return displayTransactions;
    };

    const displayTransactions = transformTransactionsForDisplay(allTransactionsData as TransactionRecord[]);

    // Filter by date range after transformation
    const transactionsData = displayTransactions.filter(transaction => {
      const transactionDate = new Date(transaction.created_at);
      return transactionDate >= startDateObj && transactionDate <= endDateObj;
    });

    // Format transaction data
    const formattedTransactionData: Transaction[] = transactionsData.map((item: TransactionRecord & { is_cancellation?: boolean }) => {
      let income = 0;
      let expense = 0;

      if (item.transaction_type === 'income') {
        income = Number(item.amount || 0);
      } else if (item.transaction_type === 'expense') {
        expense = Number(item.amount || 0);
      } else {
        income = Number(item.credit_amount || 0);
        expense = Number(item.debit_amount || 0);
      }

      return {
        id: item.id,
        date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
        description: item.description || 'Giao dịch thu chi',
        income,
        expense,
        transactionType: item.transaction_type || ''
      };
    });

    // Fetch capital/fund transactions
    const storeFundData = await fetchAllData(
      supabase
        .from('store_fund_history')
        .select('id, created_at, transaction_type, fund_amount, note, store_id')
        .eq('store_id', storeId)
        .gte('created_at', startDateISO)
        .lte('created_at', endDateISO)
        .order('created_at', { ascending: false })
    );

    // Format capital data
    const formattedCapitalData: CapitalTransaction[] = (storeFundData as StoreFundRecord[]).map((item: StoreFundRecord) => {
      // Calculate amount based on transaction type like in the total-fund page
      const amount = item.transaction_type === 'withdrawal'
        ? -Number(item.fund_amount || 0)
        : Number(item.fund_amount || 0);

      const createdAt = item.created_at ? parseISO(item.created_at) : new Date();

      return {
        id: item.id,
        date: format(createdAt, 'dd/MM/yyyy HH:mm'),
        description: item.note || 'Giao dịch nguồn vốn',
        amount,
        transactionType: item.transaction_type || ''
      };
    });

    // Process data the same way as in total-fund page
    // Calculate pawn activity
    let pawnNet = 0;
    if (pawnHistoryData) {
      (pawnHistoryData as PawnHistoryRecord[]).forEach((item: PawnHistoryRecord) => {
        if (!item.is_deleted) {
          pawnNet += (item.credit_amount || 0) - (item.debit_amount || 0);
        }
      });
    }

    // Calculate credit activity
    let creditNet = 0;
    if (creditHistoryData) {
      (creditHistoryData as CreditHistoryRecord[]).forEach((item: CreditHistoryRecord) => {
        if (!item.is_deleted) {
          creditNet += (item.credit_amount || 0) - (item.debit_amount || 0);
        }
      });
    }

    // Calculate installment activity
    let installmentNet = 0;
    (installmentHistoryData as InstallmentHistoryRecord[]).forEach((item: InstallmentHistoryRecord) => {
      if (!item.is_deleted) {
        installmentNet += (item.credit_amount || 0) - (item.debit_amount || 0);
      }
    });

    // Calculate income/expense (Thu chi)
    let incomeExpenseNet = 0;
    transactionsData.forEach((item: TransactionRecord & { is_cancellation?: boolean }) => {
      let amount = (item.credit_amount || 0) - (item.debit_amount || 0);
      if (amount === 0) {
        amount = item.transaction_type === 'expense' ? -Number(item.amount || 0) : Number(item.amount || 0);
      }
      incomeExpenseNet += amount;
    });

    // Calculate capital changes - use the exact same logic as in total-fund page
    let capitalNet = 0;
    (storeFundData as StoreFundRecord[]).forEach((item: StoreFundRecord) => {
      const amount = item.transaction_type === 'withdrawal' ?
        -Number(item.fund_amount || 0) :
        Number(item.fund_amount || 0);
      capitalNet += amount;
    });

    return {
      pawn: formattedPawnData,
      credit: formattedCreditData,
      installment: formattedInstallmentData,
      incomeExpense: formattedTransactionData,
      capital: formattedCapitalData,
      summary: {
        pawn: pawnNet,
        credit: creditNet,
        installment: installmentNet,
        incomeExpense: incomeExpenseNet,
        capital: capitalNet
      }
    };
  } catch (err) {
    console.error('Error fetching transaction data:', err);
    return {
      pawn: [],
      credit: [],
      installment: [],
      incomeExpense: [],
      capital: [],
      summary: { pawn: 0, credit: 0, installment: 0, incomeExpense: 0, capital: 0 }
    };
  }
};

/**
 * Hook for fetching opening balance with caching
 */
export function useCashbookOpeningBalance(storeId: string, startDate: string) {
  return useQuery({
    queryKey: queryKeys.cashbook.openingBalance(storeId, startDate),
    queryFn: () => fetchOpeningBalance(storeId, startDate),
    enabled: !!storeId && !!startDate,
    staleTime: 10 * 60 * 1000, // 10 minutes cache for opening balance
    gcTime: 30 * 60 * 1000, // 30 minutes garbage collection
  });
}

/**
 * Hook for fetching closing balance with caching
 */
export function useCashbookClosingBalance(storeId: string) {
  return useQuery({
    queryKey: queryKeys.cashbook.closingBalance(storeId),
    queryFn: () => fetchClosingBalance(storeId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000, // 2 minutes cache for closing balance
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
  });
}

/**
 * Hook for fetching transaction data with caching
 */
export function useCashbookTransactions(storeId: string, startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.cashbook.incomeExpenseTransactions(storeId, startDate, endDate),
    queryFn: () => fetchTransactionData(storeId, startDate, endDate),
    enabled: !!storeId && !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000, // 2 minutes cache for transaction data
    gcTime: 15 * 60 * 1000, // 15 minutes garbage collection
  });
}

/**
 * Hook for fetching complete cashbook summary with all data
 */
export function useCashbookSummary(storeId: string, startDate: string, endDate: string) {
  const openingBalanceQuery = useCashbookOpeningBalance(storeId, startDate);
  const closingBalanceQuery = useCashbookClosingBalance(storeId);
  const transactionsQuery = useCashbookTransactions(storeId, startDate, endDate);

  return {
    openingBalance: openingBalanceQuery.data || 0,
    closingBalance: closingBalanceQuery.data || 0,
    transactions: transactionsQuery.data || {
      pawn: [],
      credit: [],
      installment: [],
      incomeExpense: [],
      capital: [],
      summary: { pawn: 0, credit: 0, installment: 0, incomeExpense: 0, capital: 0 }
    },
    isLoading: openingBalanceQuery.isLoading || closingBalanceQuery.isLoading || transactionsQuery.isLoading,
    error: openingBalanceQuery.error || closingBalanceQuery.error || transactionsQuery.error,
    refetch: () => {
      openingBalanceQuery.refetch();
      closingBalanceQuery.refetch();
      transactionsQuery.refetch();
    }
  };
}