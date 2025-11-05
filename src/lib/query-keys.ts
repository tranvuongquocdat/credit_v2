import { InstallmentFilters } from '@/models/installment';

/**
 * Centralized query key factory for React Query
 * Ensures consistency across hooks and proper cache invalidation
 */

// Generic filter types for query consistency
type GenericFilters = Record<string, unknown>;

// Credit-specific filter types (based on SearchFilters in useCredits)
interface CreditSearchFilters {
  contract_code?: string;
  customer_name?: string;
  start_date?: string;
  end_date?: string;
  duration?: number;
  status?: string;
}

// Pawn-specific filter types (based on SearchFilters in usePawns)
interface PawnSearchFilters {
  contractCode?: string;
  customerName?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  duration?: number;
}

export const queryKeys = {
  // Installment-related queries
  installments: {
    all: ['installments'] as const,
    lists: () => [...queryKeys.installments.all, 'list'] as const,
    list: (filters: InstallmentFilters, currentPage: number, itemsPerPage: number, storeId?: string) =>
      [...queryKeys.installments.lists(), { filters, currentPage, itemsPerPage, storeId }] as const,
    details: () => [...queryKeys.installments.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.installments.details(), id] as const,
    paidAmounts: (installmentIds: string[]) =>
      [...queryKeys.installments.all, 'paid-amounts', installmentIds] as const,
    hasPaidPeriods: (installmentIds: string[]) =>
      [...queryKeys.installments.all, 'has-paid-periods', installmentIds] as const,
    summary: (storeId?: string) =>
      [...queryKeys.installments.all, 'summary', storeId] as const,
  },

  // Credit-related queries
  credits: {
    all: ['credits'] as const,
    lists: () => [...queryKeys.credits.all, 'list'] as const,
    list: (filters: CreditSearchFilters, currentPage: number, itemsPerPage: number, storeId?: string) =>
      [...queryKeys.credits.lists(), { filters, currentPage, itemsPerPage, storeId }] as const,
    details: () => [...queryKeys.credits.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.credits.details(), id] as const,
    paidAmounts: (creditIds: string[]) =>
      [...queryKeys.credits.all, 'paid-amounts', creditIds] as const,
    summary: (storeId?: string) =>
      [...queryKeys.credits.all, 'summary', storeId] as const,
  },

  // Pawn-related queries
  pawns: {
    all: ['pawns'] as const,
    lists: () => [...queryKeys.pawns.all, 'list'] as const,
    list: (filters: PawnSearchFilters, currentPage: number, itemsPerPage: number, storeId?: string) =>
      [...queryKeys.pawns.lists(), { filters, currentPage, itemsPerPage, storeId }] as const,
    details: () => [...queryKeys.pawns.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.pawns.details(), id] as const,
    paidAmounts: (pawnIds: string[]) =>
      [...queryKeys.pawns.all, 'paid-amounts', pawnIds] as const,
    summary: (storeId?: string) =>
      [...queryKeys.pawns.all, 'summary', storeId] as const,
  },

  // Store-related queries
  stores: {
    all: ['stores'] as const,
    financial: (storeId: string) => ['stores', 'financial', storeId] as const,
  },

  // Customer-related queries
  customers: {
    all: ['customers'] as const,
    lists: () => [...queryKeys.customers.all, 'list'] as const,
    list: (search?: string, storeId?: string) =>
      [...queryKeys.customers.lists(), { search, storeId }] as const,
    detail: (id: string) => [...queryKeys.customers.all, 'detail', id] as const,
  },

  // Cashbook-related queries
  cashbook: {
    all: ['cashbook'] as const,
    summaries: () => [...queryKeys.cashbook.all, 'summary'] as const,
    summary: (storeId: string, startDate: string, endDate: string) =>
      [...queryKeys.cashbook.summaries(), { storeId, startDate, endDate }] as const,
    openingBalance: (storeId: string, date: string) =>
      [...queryKeys.cashbook.all, 'opening-balance', { storeId, date }] as const,
    closingBalance: (storeId: string) =>
      [...queryKeys.cashbook.all, 'closing-balance', { storeId }] as const,
    pawnTransactions: (storeId: string, startDate: string, endDate: string) =>
      [...queryKeys.cashbook.all, 'pawn-transactions', { storeId, startDate, endDate }] as const,
    creditTransactions: (storeId: string, startDate: string, endDate: string) =>
      [...queryKeys.cashbook.all, 'credit-transactions', { storeId, startDate, endDate }] as const,
    installmentTransactions: (storeId: string, startDate: string, endDate: string) =>
      [...queryKeys.cashbook.all, 'installment-transactions', { storeId, startDate, endDate }] as const,
    incomeExpenseTransactions: (storeId: string, startDate: string, endDate: string) =>
      [...queryKeys.cashbook.all, 'income-expense-transactions', { storeId, startDate, endDate }] as const,
    capitalTransactions: (storeId: string, startDate: string, endDate: string) =>
      [...queryKeys.cashbook.all, 'capital-transactions', { storeId, startDate, endDate }] as const,
  },

  // Transaction Summary-related queries
  transactionSummary: {
    all: ['transactionSummary'] as const,
    summaries: () => [...queryKeys.transactionSummary.all, 'summary'] as const,
    summary: (storeId: string, startDate: string, endDate: string, transactionType?: string, employee?: string) =>
      [...queryKeys.transactionSummary.summaries(), { storeId, startDate, endDate, transactionType, employee }] as const,
    openingBalance: (storeId: string, date: string) =>
      [...queryKeys.transactionSummary.all, 'opening-balance', { storeId, date }] as const,
    closingBalance: (storeId: string) =>
      [...queryKeys.transactionSummary.all, 'closing-balance', { storeId }] as const,
    employees: (storeId: string) =>
      [...queryKeys.transactionSummary.all, 'employees', { storeId }] as const,
    transactionDetails: (storeId: string, startDate: string, endDate: string, transactionType?: string, employee?: string) =>
      [...queryKeys.transactionSummary.all, 'transaction-details', { storeId, startDate, endDate, transactionType, employee }] as const,
  },

  // Add other query keys as needed for future features
} as const;

// Type helpers for better TypeScript support
export type QueryKey = typeof queryKeys[keyof typeof queryKeys];