// Define all transaction interfaces in one place
export interface PawnTransaction {
  id: string;
  date: string;
  contractCode: string;
  customerName: string;
  description: string;
  loanAmount: number;
  interestAmount: number;
  transactionType: string;
}

export interface CreditTransaction {
  id: string;
  date: string;
  contractCode: string;
  customerName: string;
  description: string;
  loanAmount: number;
  interestAmount: number;
  transactionType: string;
}

export interface InstallmentTransaction {
  id: string;
  date: string;
  contractCode: string;
  customerName: string;
  description: string;
  loanAmount: number;
  interestAmount: number;
  transactionType: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  expense: number;
  income: number;
  transactionType: string;
}

export interface CapitalTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  transactionType: string;
}

// Database record interfaces
export interface DatabaseRecord {
  id: string;
  created_at: string;
  description?: string;
  note?: string;
  transaction_type?: string;
  debit_amount?: number;
  credit_amount?: number;
  fund_amount?: number;
  amount?: number;
  // For other properties like nested joins (pawns, credits, etc.)
  [key: string]: string | number | boolean | object | null | undefined;
}

// Define a type for supabase query to avoid TypeScript type issues
export interface SupabaseQuery {
  range: (from: number, to: number) => Promise<{ 
    data: DatabaseRecord[] | null; 
    error: Error | null 
  }>;
}

// Define a type for the transaction summary
export interface TransactionSummary {
  openingBalance: number;
  pawn: { income: number; expense: number };
  credit: { income: number; expense: number };
  installment: { income: number; expense: number };
  incomeExpense: { income: number; expense: number };
  capital: { income: number; expense: number };
  closingBalance: number;
}

// Define a type for transaction data with income/expense details
export interface TransactionData {
  pawn: { income: number; expense: number };
  credit: { income: number; expense: number };
  installment: { income: number; expense: number };
  incomeExpense: { income: number; expense: number };
  capital: { income: number; expense: number };
}

// Define interface for fund history items used in transaction details
export interface FundHistoryItem {
  id: string;
  date: string;
  description: string;
  transactionType: string;
  source: string;
  income: number;
  expense: number;
  contractCode: string;
  employeeName: string;
  customerName: string;
  itemName: string;
}

// Database record interfaces for transaction history
export interface CreditHistoryRecord {
  id: string;
  created_at: string;
  updated_at?: string;
  is_deleted?: boolean;
  transaction_type?: string;
  credit_amount?: number;
  debit_amount?: number;
  created_by?: string;
  credits?: {
    contract_code?: string;
    store_id?: string;
    customers?: {
      name?: string;
    };
  };
  profiles?: {
    username?: string;
  };
  contract_code?: string;
}

export interface PawnHistoryRecord {
  id: string;
  created_at: string;
  updated_at?: string;
  is_deleted?: boolean;
  transaction_type?: string;
  credit_amount?: number;
  debit_amount?: number;
  created_by?: string;
  pawns?: {
    contract_code?: string;
    store_id?: string;
    customers?: {
      name?: string;
    };
    collateral_detail?: string | object;
  };
  profiles?: {
    username?: string;
  };
  contract_code?: string;
}

export interface InstallmentHistoryRecord {
  id: string;
  created_at: string;
  updated_at?: string;
  is_deleted?: boolean;
  transaction_type?: string;
  credit_amount?: number;
  debit_amount?: number;
  created_by?: string;
  installments?: {
    contract_code?: string;
    employee_id?: string;
    employees?: {
      store_id?: string;
    };
    customers?: {
      name?: string;
    };
  };
  profiles?: {
    username?: string;
  };
  contract_code?: string;
}

export interface StoreFundHistoryRecord {
  id: string;
  created_at: string;
  store_id: string;
  transaction_type?: string;
  fund_amount?: number;
  name?: string;
}

export interface TransactionRecord {
  id: string;
  created_at: string;
  updated_at?: string;
  update_at?: string;
  is_deleted?: boolean;
  store_id?: string;
  customer_id?: string;
  employee_name?: string;
  credit_amount?: number;
  debit_amount?: number;
  amount?: number;
  transaction_type?: string;
  description?: string;
  customers?: {
    name?: string;
  };
}

export interface DisplayTransaction {
  id: string;
  created_at: string;
  is_cancellation?: boolean;
  credit_amount?: number | null;
  debit_amount?: number | null;
  description?: string;
  store_id?: string;
  customer_id?: string;
  employee_name?: string;
  amount?: number;
  transaction_type?: string;
  is_deleted?: boolean;
  customers?: {
    name?: string;
  };
} 