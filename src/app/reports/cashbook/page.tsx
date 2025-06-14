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
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePickerWithControls } from '@/components/ui/date-picker-with-controls';

// Custom components for different tables
import PawnTable from './components/PawnTable';
import CreditTable from './components/CreditTable';
import InstallmentTable from './components/InstallmentTable';
import TransactionTable from './components/TransactionTable';
import CapitalTable from './components/CapitalTable';
import ExcelExporter from './components/ExcelExporter';

// Import type definitions
import { 
  CashbookSummary,
  PawnTransaction,
  CreditTransaction,
  InstallmentTransaction,
  Transaction,
  CapitalTransaction
} from './components/types';

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

export default function CashbookPage() {
  const { currentStore } = useStore();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CashbookSummary>({
    openingBalance: 0,
    pawnActivity: 0,
    creditActivity: 0,
    installmentActivity: 0,
    incomeExpense: 0,
    capital: 0,
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

  // Transaction data for Excel export
  const [pawnTransactions, setPawnTransactions] = useState<PawnTransaction[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [installmentTransactions, setInstallmentTransactions] = useState<InstallmentTransaction[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [capitalTransactions, setCapitalTransactions] = useState<CapitalTransaction[]>([]);

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

  // Calculate transaction sums using the same approach as total-fund page
  const fetchTransactionData = async () => {
    if (!currentStore?.id) return { pawn: 0, credit: 0, installment: 0, incomeExpense: 0, capital: 0 };
    
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
      
      // Format pawn data for transaction list
      const formattedPawnData: PawnTransaction[] = pawnHistoryData.map((item: any) => ({
        id: item.id,
        date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
        contractCode: item.pawns?.contract_code || 'N/A',
        customerName: 'N/A',
        description: item.description || 'Giao dịch cầm đồ',
        loanAmount: item.debit_amount || 0,
        interestAmount: item.credit_amount || 0,
        transactionType: item.transaction_type || ''
      }));
      setPawnTransactions(formattedPawnData);
      
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
      
      // Format credit data for transaction list
      const formattedCreditData: CreditTransaction[] = creditHistoryData.map((item: any) => ({
        id: item.id,
        date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
        contractCode: item.credits?.contract_code || 'N/A',
        customerName: 'N/A',
        description: item.description || 'Giao dịch tín chấp',
        loanAmount: item.debit_amount || 0,
        interestAmount: item.credit_amount || 0,
        transactionType: item.transaction_type || ''
      }));
      setCreditTransactions(formattedCreditData);
      
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
      
      // Format installment data for transaction list
      const formattedInstallmentData: InstallmentTransaction[] = installmentHistoryData ? installmentHistoryData.map((item: any) => ({
        id: item.id,
        date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
        contractCode: item.installments?.contract_code || 'N/A',
        customerName: 'N/A',
        description: item.description || 'Giao dịch trả góp',
        loanAmount: item.debit_amount || 0,
        interestAmount: item.credit_amount || 0,
        transactionType: item.transaction_type || ''
      })) : [];
      setInstallmentTransactions(formattedInstallmentData);
      
      // Fetch transactions (income/expense)
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*')
        .eq('store_id', storeId)
        .gte('created_at', startDateISO)
        .lte('created_at', endDateISO)
        .limit(10000);
      
      // Format transaction data
      const formattedTransactionData: Transaction[] = transactionsData ? transactionsData.map((item: any) => {
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
      }) : [];
      setTransactions(formattedTransactionData);
      
      // Fetch capital/fund transactions
      const { data: storeFundData } = await supabase
        .from('store_fund_history')
        .select('*')
        .eq('store_id', storeId)
        .gte('created_at', startDateISO)
        .lte('created_at', endDateISO)
        .limit(10000);
      
      // Format capital data
      const formattedCapitalData: CapitalTransaction[] = storeFundData ? storeFundData.map((item: any) => {
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
      }) : [];
      setCapitalTransactions(formattedCapitalData);
      
      // Process data the same way as in total-fund page
      // Calculate pawn activity
      let pawnNet = 0;
      if (pawnHistoryData) {
        pawnHistoryData.forEach((item: any) => {
          pawnNet += (item.credit_amount || 0) - (item.debit_amount || 0);
        });
      }
      
      // Calculate credit activity
      let creditNet = 0;
      if (creditHistoryData) {
        creditHistoryData.forEach((item: any) => {
          creditNet += (item.credit_amount || 0) - (item.debit_amount || 0);
        });
      }
      
      // Calculate installment activity
      let installmentNet = 0;
      if (installmentHistoryData) {
        installmentHistoryData.forEach((item: any) => {
          installmentNet += (item.credit_amount || 0) - (item.debit_amount || 0);
        });
      }
      
      // Calculate income/expense (Thu chi)
      let incomeExpenseNet = 0;
      if (transactionsData) {
        transactionsData.forEach((item: any) => {
          let amount = (item.credit_amount || 0) - (item.debit_amount || 0);
          if (amount === 0) {
            amount = item.transaction_type === 'expense' ? -Number(item.amount || 0) : Number(item.amount || 0);
          }
          incomeExpenseNet += amount;
        });
      }
      
      // Calculate capital changes - use the exact same logic as in total-fund page
      let capitalNet = 0;
      if (storeFundData) {
        storeFundData.forEach((item: any) => {
          const amount = item.transaction_type === 'withdrawal' ? 
            -Number(item.fund_amount || 0) : 
            Number(item.fund_amount || 0);
          capitalNet += amount;
        });
      }
      
      return {
        pawn: pawnNet,
        credit: creditNet,
        installment: installmentNet,
        incomeExpense: incomeExpenseNet,
        capital: capitalNet
      };
    } catch (err) {
      console.error('Error fetching transaction data:', err);
      return { pawn: 0, credit: 0, installment: 0, incomeExpense: 0, capital: 0 };
    }
  };

  // Fetch current cash_fund from stores table (closing balance)
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

  // Fetch all data and update summary
  const fetchCashbookData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (!currentStore?.id) {
        setError("Không có cửa hàng nào được chọn");
        setIsLoading(false);
        return;
      }
      
      // Fetch data in parallel
      const [openingBalance, transactions, closingBalance] = await Promise.all([
        fetchOpeningBalance(),
        fetchTransactionData(),
        fetchClosingBalance()
      ]);
      
      // Update summary
      setSummary({
        openingBalance,
        pawnActivity: transactions.pawn,
        creditActivity: transactions.credit,
        installmentActivity: transactions.installment,
        incomeExpense: transactions.incomeExpense,
        capital: transactions.capital,
        closingBalance
      });
    } catch (err) {
      console.error('Error fetching cashbook data:', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
  };

  // Load data when component mounts or when date range or store changes
  useEffect(() => {
    fetchCashbookData();
  }, [currentStore?.id, startDate, endDate]);
  
  return (
    <Layout>
      <div className="max-w-full">
        {/* Title and Export Button */}
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Sổ quỹ tiền mặt</h1>
          </div>
          <ExcelExporter 
            summaryData={summary}
            pawnData={pawnTransactions}
            creditData={creditTransactions}
            installmentData={installmentTransactions}
            transactionData={transactions}
            capitalData={capitalTransactions}
            startDate={startDate}
            endDate={endDate}
            storeName={currentStore?.name || 'Unknown'}
          />
        </div>
        
        {/* Date range selector */}
        <Card className="mb-4">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Khoảng thời gian</CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
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
            <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">Bảng Tổng Kết</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-gray-200 overflow-hidden">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Quỹ tiền mặt đầu kỳ</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Cầm đồ</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tín chấp</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Trả góp</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Thu chi</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Vốn</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Quỹ tiền mặt cuối kỳ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className="text-blue-600 font-medium">{formatCurrency(summary.openingBalance)}</span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className={summary.pawnActivity > 0 ? "text-green-600" : summary.pawnActivity < 0 ? "text-red-600" : ""}>
                        {formatCurrency(summary.pawnActivity)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className={summary.creditActivity > 0 ? "text-green-600" : summary.creditActivity < 0 ? "text-red-600" : ""}>
                        {formatCurrency(summary.creditActivity)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className={summary.installmentActivity > 0 ? "text-green-600" : summary.installmentActivity < 0 ? "text-red-600" : ""}>
                        {formatCurrency(summary.installmentActivity)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className={summary.incomeExpense > 0 ? "text-green-600" : summary.incomeExpense < 0 ? "text-red-600" : ""}>
                        {formatCurrency(summary.incomeExpense)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className={summary.capital > 0 ? "text-green-600" : summary.capital < 0 ? "text-red-600" : ""}>
                        {formatCurrency(summary.capital)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center">
                      <span className="text-blue-600 font-medium">{formatCurrency(summary.closingBalance)}</span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        
        {/* Individual Transaction Tables */}
        <PawnTable 
          storeId={currentStore?.id} 
          startDate={startDate} 
          endDate={endDate}
        />
        
        <CreditTable 
          storeId={currentStore?.id} 
          startDate={startDate} 
          endDate={endDate}
        />
        
        <InstallmentTable 
          storeId={currentStore?.id} 
          startDate={startDate} 
          endDate={endDate}
        />
        
        <TransactionTable 
          storeId={currentStore?.id} 
          startDate={startDate} 
          endDate={endDate}
        />
        
        <CapitalTable 
          storeId={currentStore?.id} 
          startDate={startDate} 
          endDate={endDate}
        />
        
      </div>
    </Layout>
  );
}
