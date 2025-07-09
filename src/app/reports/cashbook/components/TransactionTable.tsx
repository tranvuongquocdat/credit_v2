import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { RefreshCw } from 'lucide-react';

interface TransactionTableProps {
  storeId: string | undefined;
  startDate: string;
  endDate: string;
}

interface Transaction {
  id: string;
  created_at: string;
  transaction_type: string | null;
  credit_amount: number | null;
  debit_amount: number | null;
  description: string | null;
  is_deleted: boolean | null;
  update_at: string | null;
}

interface DisplayTransaction extends Transaction {
  is_cancellation?: boolean;
}

interface FormattedTransaction {
  id: string;
  date: string;
  description: string;
  expense: number;
  income: number;
  transactionType: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN').format(value);
};

// Transform transactions to display format (separate records for original and cancellation)
const transformTransactionsForDisplay = (rawTransactions: Transaction[]): DisplayTransaction[] => {
  const displayTransactions: DisplayTransaction[] = [];
  
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
        created_at: transaction.update_at || transaction.created_at,
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

// Function to fetch all data from a query with pagination
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

export default function TransactionTable({ storeId, startDate, endDate }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<FormattedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchTransactions = async () => {
    if (!storeId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Get all transactions without date or is_deleted filter
      const allTransactionData = await fetchAllData(
        supabase
          .from('transactions')
          .select('*')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false })
      );
      
      // Transform transactions to display format
      const displayTransactions = transformTransactionsForDisplay(allTransactionData);
      
      // Apply date range filter AFTER transformation
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      const filteredTransactions = displayTransactions.filter(transaction => {
        const transactionDate = new Date(transaction.created_at);
        return transactionDate >= start && transactionDate <= end;
      });
      
      const formattedData: FormattedTransaction[] = filteredTransactions.map((item: any) => {
        let income = 0;
        let expense = 0;
        
        // Handle different transaction structures
        if (item.transaction_type === 'income') {
          // Some transactions may use amount field directly
          const amount = Number(item.amount || 0);
          if (amount >= 0) {
            income = amount;
          } else {
            expense = Math.abs(amount);
          }
        } else if (item.transaction_type === 'expense') {
          // Some transactions may use amount field directly
          const amount = Number(item.amount || 0);
          if (amount >= 0) {
            expense = amount;
          } else {
            income = Math.abs(amount);
          }
        } else {
          // For debit/credit style entries
          const creditAmount = Number(item.credit_amount || 0);
          const debitAmount = Number(item.debit_amount || 0);
          
          if (creditAmount >= 0) {
            income = creditAmount;
          } else {
            expense = Math.abs(creditAmount);
          }
          
          if (debitAmount >= 0) {
            expense += debitAmount;
          } else {
            income += Math.abs(debitAmount);
          }
        }
        
        // Get description based on cancellation status
        let description = item.description || 'Giao dịch thu chi';
        if (item.is_cancellation) {
          // For cancellation records, show cancelled type based on original transaction
          if (item.credit_amount !== null || (item.transaction_type === 'income')) {
            description = 'Huỷ thu';
          } else if (item.debit_amount !== null || (item.transaction_type === 'expense')) {
            description = 'Huỷ chi';
          }
        }
        
        return {
          id: item.id,
          date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
          description,
          income,
          expense,
          transactionType: item.transaction_type || ''
        };
      });
      
      setTransactions(formattedData);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchTransactions();
  }, [storeId, startDate, endDate]);
  
  // Calculate totals
  const totalIncome = transactions.reduce((sum, item) => sum + item.income, 0);
  const totalExpense = transactions.reduce((sum, item) => sum + item.expense, 0);
  const netAmount = totalIncome - totalExpense;
  
  return (
    <Card className="mt-4">
      <CardHeader className="py-3">
        <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">Thu chi</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Đang tải dữ liệu...</span>
          </div>
        ) : error ? (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            Không có giao dịch nào trong khoảng thời gian này
          </div>
        ) : (
          <div className="rounded-md border border-gray-200 overflow-hidden">
            <Table className="border-collapse">
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-12">#</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Ngày GD</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Mô tả</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Loại GD</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Chi phí</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Thu nhập</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((item, index) => (
                  <TableRow key={item.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {index + 1}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {item.date}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {item.description}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {item.transactionType === 'income' ? 'Thu nhập' : 
                       item.transactionType === 'expense' ? 'Chi phí' : 
                       'Giao dịch thu chi'}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-r border-b border-gray-200">
                      {item.expense > 0 ? (
                        <span className="text-red-600">-{formatCurrency(item.expense)}</span>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-b border-gray-200">
                      {item.income > 0 ? (
                        <span className="text-green-600">+{formatCurrency(item.income)}</span>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-gray-50">
                <TableRow>
                  <TableCell colSpan={4} className="py-2 px-3 text-right font-bold border-r border-t border-gray-200">
                    Tổng
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold border-r border-t border-gray-200">
                    <span className="text-red-600">-{formatCurrency(totalExpense)}</span>
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold border-t border-gray-200">
                    <span className="text-green-600">+{formatCurrency(totalIncome)}</span>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4} className="py-2 px-3 text-right font-bold border-r border-t border-gray-200">
                    Tổng thu chi
                  </TableCell>
                  <TableCell colSpan={2} className="py-2 px-3 text-right font-bold border-t border-gray-200">
                    <span className={netAmount >= 0 ? "text-green-600" : "text-red-600"}>
                      {netAmount >= 0 ? "+" : ""}{formatCurrency(netAmount)}
                    </span>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 