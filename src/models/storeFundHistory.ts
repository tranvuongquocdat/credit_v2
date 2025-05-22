export interface StoreFundHistory {
  id: string;
  store_id: string;
  fund_amount: number;
  transaction_type: string | null;
  note: string | null;
  created_at: string | null;
}

export interface StoreFundHistoryFormData {
  store_id: string;
  fund_amount: number;
  transaction_type: string;
  created_at: string;
  note?: string | null;
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
}

export const transactionTypeMap = {
  [TransactionType.DEPOSIT]: {
    label: 'Nạp vốn',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  [TransactionType.WITHDRAWAL]: {
    label: 'Rút vốn',
    color: 'bg-red-100 text-red-800 border-red-200'
  }
}; 