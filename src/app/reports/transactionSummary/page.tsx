'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { format, startOfDay, endOfDay, parse, parseISO } from 'date-fns';
import { RefreshCw } from 'lucide-react';

// Shadcn UI components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePickerWithControls } from '@/components/ui/date-picker-with-controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Import components
import TransactionDetailsTable from './components/TransactionDetailsTable';
import ExcelExport from './components/ExcelExport';

// Import types from our types file
import { 
  TransactionSummary, 
  TransactionData,
  PawnTransaction,
  CreditTransaction,
  InstallmentTransaction,
  Transaction,
  CapitalTransaction
} from './types';

export default function TransactionSummaryPage() {
  const { currentStore } = useStore();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TransactionSummary>({
    openingBalance: 0,
    pawn: { income: 0, expense: 0 },
    credit: { income: 0, expense: 0 },
    installment: { income: 0, expense: 0 },
    incomeExpense: { income: 0, expense: 0 },
    capital: { income: 0, expense: 0 },
    closingBalance: 0
  });
  
  // Date range for filtering
  const today = new Date();
  const [startDate, setStartDate] = useState<string>(
    format(today, 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    format(today, 'yyyy-MM-dd')
  );
  
  // Filter states
  const [selectedTransactionType, setSelectedTransactionType] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [employees, setEmployees] = useState<{username: string}[]>([]);

  // Function to format currency
  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '0';
    
    const formattedValue = new Intl.NumberFormat('vi-VN').format(value);
    
    // Add color formatting based on value
    if (value > 0) {
      return `+${formattedValue}`;
    } else if (value < 0) {
      return formattedValue; // Negative values already have a minus sign
    } else {
      return '0';
    }
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

  // Fetch employees for filter dropdown
  const fetchEmployees = async () => {
    if (!currentStore?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .not('username', 'is', null)
        .order('username');
      
      if (error) throw error;
      
      setEmployees(data || []);
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  };

  // Fetch opening balance from store_total_fund for the start date
  const fetchOpeningBalance = async () => {
    if (!currentStore?.id) return 0;
    
    try {
      // Get the date at 00:00 of the start date in UTC+7
      const startDateObj = parse(startDate, 'yyyy-MM-dd', new Date());
      const utcDate = format(startDateObj, 'yyyy-MM-dd');
      
      // Fetch store creation date to check if this is the first day
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('created_at')
        .eq('id', currentStore.id)
        .single();
      
      if (storeError) throw storeError;
      
      // Check if the date being viewed is the store creation date
      if (storeData && storeData.created_at) {
        const storeCreationDate = format(new Date(storeData.created_at), 'yyyy-MM-dd');
        // If the date we're checking is the store creation date, opening balance should be 0
        if (storeCreationDate === utcDate) {
          return 0;
        }
      }
      
      // Fetch the closest record before or on the start date
      const { data, error } = await supabase
        .from('store_total_fund')
        .select('total_fund, created_at')
        .eq('store_id', currentStore.id)
        .lte('created_at', `${utcDate}T17:00:00Z`) // 00:00 UTC+7 is 17:00 UTC of the previous day
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) throw error;
      
      return data && data.length > 0 ? data[0].total_fund : 0;
    } catch (err) {
      console.error('Error fetching opening balance:', err);
      return 0;
    }
  };

  // Fetch transaction data with income/expense details
  const fetchTransactionData = async (): Promise<TransactionData> => {
    if (!currentStore?.id) return {
      pawn: { income: 0, expense: 0 },
      credit: { income: 0, expense: 0 },
      installment: { income: 0, expense: 0 },
      incomeExpense: { income: 0, expense: 0 },
      capital: { income: 0, expense: 0 }
    };
    
    try {
      const storeId = currentStore.id;
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
          .gte('created_at', startDateISO)
          .lte('created_at', endDateISO)
      );
      
      // Fetch credit transactions
      const creditHistoryData = await fetchAllData(
        supabase
          .from('credit_history')
          .select(`
            *,
            credits!inner (contract_code, store_id)
          `)
          .eq('credits.store_id', storeId)
          .gte('created_at', startDateISO)
          .lte('created_at', endDateISO)
      );
      
      // Fetch installment transactions
      const { data: installmentHistoryData } = await supabase
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
        .gte('created_at', startDateISO)
        .lte('created_at', endDateISO)
        .limit(10000);
      
      // Fetch income/expense transactions
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_deleted', false)
        .gte('created_at', startDateISO)
        .lte('created_at', endDateISO)
        .limit(10000);
      
      // Fetch capital transactions
      const { data: capitalData } = await supabase
        .from('store_fund_history')
        .select('*')
        .eq('store_id', storeId)
        .gte('created_at', startDateISO)
        .lte('created_at', endDateISO)
        .limit(10000);
      
      // Calculate totals for each transaction type
      let pawnIncome = 0, pawnExpense = 0;
      let creditIncome = 0, creditExpense = 0;
      let installmentIncome = 0, installmentExpense = 0;
      let incomeExpenseIncome = 0, incomeExpenseExpense = 0;
      let capitalIncome = 0, capitalExpense = 0;
      
      // Process pawn transactions
      if (pawnHistoryData) {
        pawnHistoryData.forEach((item: any) => {
          const creditAmount = Number(item.credit_amount || 0);
          const debitAmount = Number(item.debit_amount || 0);
          pawnIncome += creditAmount;
          pawnExpense += debitAmount;
        });
      }
      
      // Process credit transactions
      if (creditHistoryData) {
        creditHistoryData.forEach((item: any) => {
          const creditAmount = Number(item.credit_amount || 0);
          const debitAmount = Number(item.debit_amount || 0);
          creditIncome += creditAmount;
          creditExpense += debitAmount;
        });
      }
      
      // Process installment transactions
      if (installmentHistoryData) {
        installmentHistoryData.forEach((item: any) => {
          const creditAmount = Number(item.credit_amount || 0);
          const debitAmount = Number(item.debit_amount || 0);
          installmentIncome += creditAmount;
          installmentExpense += debitAmount;
        });
      }
      
      // Process income/expense transactions
      if (transactionsData) {
        transactionsData.forEach((item: any) => {
          if (item.transaction_type === 'income') {
            incomeExpenseIncome += Number(item.amount || 0);
          } else if (item.transaction_type === 'expense') {
            incomeExpenseExpense += Number(item.amount || 0);
          } else {
            // Handle credit/debit amounts
            incomeExpenseIncome += Number(item.credit_amount || 0);
            incomeExpenseExpense += Number(item.debit_amount || 0);
          }
        });
      }
      
      // Process capital transactions
      if (capitalData) {
        capitalData.forEach((item: any) => {
          if (item.transaction_type === 'deposit') {
            capitalIncome += Number(item.fund_amount || 0);
          } else if (item.transaction_type === 'withdrawal') {
            capitalExpense += Number(item.fund_amount || 0);
          }
        });
      }
      
      return {
        pawn: { income: pawnIncome, expense: pawnExpense },
        credit: { income: creditIncome, expense: creditExpense },
        installment: { income: installmentIncome, expense: installmentExpense },
        incomeExpense: { income: incomeExpenseIncome, expense: incomeExpenseExpense },
        capital: { income: capitalIncome, expense: capitalExpense }
      };
    } catch (err) {
      console.error('Error fetching transaction data:', err);
      return {
        pawn: { income: 0, expense: 0 },
        credit: { income: 0, expense: 0 },
        installment: { income: 0, expense: 0 },
        incomeExpense: { income: 0, expense: 0 },
        capital: { income: 0, expense: 0 }
      };
    }
  };

  // Fetch closing balance from stores.cash_fund
  const fetchClosingBalance = async () => {
    if (!currentStore?.id) return 0;
    
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('cash_fund')
        .eq('id', currentStore.id)
        .single();
      
      if (error) throw error;
      
      return data?.cash_fund || 0;
    } catch (err) {
      console.error('Error fetching closing balance:', err);
      return 0;
    }
  };

  // Main function to fetch all summary data
  const fetchTransactionSummaryData = async () => {
    if (!currentStore?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch all data in parallel
      const [openingBalance, transactionData, closingBalance] = await Promise.all([
        fetchOpeningBalance(),
        fetchTransactionData(),
        fetchClosingBalance()
      ]);
      
      setSummary({
        openingBalance,
        ...transactionData,
        closingBalance
      });
    } catch (err) {
      console.error('Error fetching transaction summary:', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle date changes
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchTransactionSummaryData();
  };

  // Load data when component mounts or when dates change
  useEffect(() => {
    if (currentStore?.id) {
      fetchTransactionSummaryData();
      fetchEmployees();
    }
  }, [currentStore?.id, startDate, endDate]);

  return (
    <Layout>
      <div className="max-w-full">
        {/* Title and Export Button */}
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Tổng kết giao dịch</h1>
          </div>
          <ExcelExport 
            summaryData={{
              openingBalance: summary.openingBalance,
              totalIncome: summary.pawn.income + summary.credit.income + summary.installment.income + summary.incomeExpense.income + summary.capital.income,
              totalExpense: summary.pawn.expense + summary.credit.expense + summary.installment.expense + summary.incomeExpense.expense + summary.capital.expense,
              closingBalance: summary.closingBalance,
              transactionSummary: {
                'Cầm đồ': { income: summary.pawn.income, expense: summary.pawn.expense },
                'Tín chấp': { income: summary.credit.income, expense: summary.credit.expense },
                'Trả góp': { income: summary.installment.income, expense: summary.installment.expense },
                'Nguồn vốn': { income: summary.capital.income, expense: summary.capital.expense },
                'Thu chi': { income: summary.incomeExpense.income, expense: summary.incomeExpense.expense }
              }
            }}
            storeId={currentStore?.id}
            startDate={startDate}
            endDate={endDate}
            storeName={currentStore?.name || 'Unknown'}
            selectedTransactionType={selectedTransactionType}
            selectedEmployee={selectedEmployee}
          />
        </div>

        {/* Date range selector and filters */}
        <Card className="mb-4">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  <span className="mr-2 text-sm font-medium">Từ ngày</span>
                  <DatePickerWithControls
                    value={startDate} 
                    onChange={handleStartDateChange}
                    placeholder="Chọn ngày bắt đầu"
                    className="w-40"
                  />
                </div>
                <div className="flex items-center">
                  <span className="mx-2 text-sm font-medium">Đến ngày</span>
                  <DatePickerWithControls
                    value={endDate} 
                    onChange={handleEndDateChange}
                    placeholder="Chọn ngày kết thúc"
                    className="w-40"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Loại giao dịch:</span>
                  <Select value={selectedTransactionType} onValueChange={setSelectedTransactionType}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="Cầm đồ">Cầm đồ</SelectItem>
                      <SelectItem value="Tín chấp">Tín chấp</SelectItem>
                      <SelectItem value="Trả góp">Trả góp</SelectItem>
                      <SelectItem value="Nguồn vốn">Nguồn Vốn</SelectItem>
                      <SelectItem value="Thu chi">Thu Chi Hoạt Động</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Nhân viên:</span>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {employees.map((employee) => (
                        <SelectItem key={employee.username} value={employee.username}>
                          {employee.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={handleRefresh} 
                  disabled={isLoading}
                  variant="outline"
                  size="sm"
                >
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Error message */}
        {error && (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Đang tải dữ liệu...</span>
          </div>
        )}

        {/* Summary Table */}
        <Card>
          <CardHeader className="py-3">
            <div className="bg-blue-500 text-white p-2 rounded">
              <CardTitle className="text-base font-bold text-center">Bảng Tổng Kết</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-gray-200 overflow-hidden">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-2/5">Bảng Tổng Kết</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-3/10">Thu</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200 w-3/10">Chi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="py-3 px-3 font-medium border-r border-b border-gray-200">Tiền đầu ngày</TableCell>
                    <TableCell colSpan={2} className="py-3 px-3 text-center border-b border-gray-200">
                      <span className="text-blue-600 font-medium">{summary.openingBalance.toLocaleString()} VND</span>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="py-3 px-3 font-medium border-r border-b border-gray-200">Cầm đồ</TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-b border-gray-200">
                      <span className="text-green-600 font-medium">{summary.pawn.income.toLocaleString()} VND</span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-b border-gray-200">
                      <span className="text-red-600 font-medium">{summary.pawn.expense.toLocaleString()} VND</span>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="py-3 px-3 font-medium border-r border-b border-gray-200">Tín chấp</TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-b border-gray-200">
                      <span className="text-green-600 font-medium">{summary.credit.income.toLocaleString()} VND</span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-b border-gray-200">
                      <span className="text-red-600 font-medium">{summary.credit.expense.toLocaleString()} VND</span>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="py-3 px-3 font-medium border-r border-b border-gray-200">Trả góp</TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-b border-gray-200">
                      <span className="text-green-600 font-medium">{summary.installment.income.toLocaleString()} VND</span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-b border-gray-200">
                      <span className="text-red-600 font-medium">{summary.installment.expense.toLocaleString()} VND</span>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="py-3 px-3 font-medium border-r border-b border-gray-200">Nguồn vốn</TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-b border-gray-200">
                      <span className="text-green-600 font-medium">{summary.capital.income.toLocaleString()} VND</span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-b border-gray-200">
                      <span className="text-red-600 font-medium">{summary.capital.expense.toLocaleString()} VND</span>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="py-3 px-3 font-medium border-r border-b border-gray-200">Thu chi</TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-b border-gray-200">
                      <span className="text-green-600 font-medium">{summary.incomeExpense.income.toLocaleString()} VND</span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-b border-gray-200">
                      <span className="text-red-600 font-medium">{summary.incomeExpense.expense.toLocaleString()} VND</span>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="py-3 px-3 font-medium border-r border-gray-200">Tiền mặt còn lại</TableCell>
                    <TableCell colSpan={2} className="py-3 px-3 text-center">
                      <span className="text-blue-600 font-medium">{summary.closingBalance.toLocaleString()} VND</span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Transaction Details Table */}
        <TransactionDetailsTable 
          storeId={currentStore?.id} 
          startDate={startDate} 
          endDate={endDate}
          selectedTransactionType={selectedTransactionType}
          selectedEmployee={selectedEmployee}
        />
      </div>
    </Layout>
  );
}
