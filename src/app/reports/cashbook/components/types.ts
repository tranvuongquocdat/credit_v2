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

// Define a type for the cashbook summary
export interface CashbookSummary {
  openingBalance: number;
  pawnActivity: number;
  creditActivity: number;
  installmentActivity: number;
  incomeExpense: number;
  capital: number;
  closingBalance: number;
} 