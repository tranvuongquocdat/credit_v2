'use client';

import { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { format, startOfDay, endOfDay, parse, subDays } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { useInstallmentsSummary } from '@/hooks/useInstallmentsSummary';
import { DatePickerWithControls } from '@/components/ui/date-picker-with-controls';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';

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
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCreditsSummary } from '@/hooks/useCreditsSummary';
import { usePawnsSummary } from '@/hooks/usePawnsSummary';

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

// Interface for daily cash flow data
interface DailyCashFlow {
  date: Date;
  openingBalance: number;
  pawnActivity: number;
  creditActivity: number;
  installmentActivity: number;
  incomeExpense: number;
  capital: number;
  closingBalance: number;
  pawnLoans: number;
  pawnDebts: number;
  creditLoans: number;
  creditDebts: number;
  installmentLoans: number;
  installmentDebts: number;
  borrowedCapital: number;
  totalAssets: number;
}

// Interface for database record with flexible keys
interface DatabaseRecord {
  id: string;
  created_at: string;
  [key: string]: unknown;
}

// Function to fetch all data from a query with pagination
const fetchAllData = async (query: any, pageSize: number = 1000) => {
  let allData: DatabaseRecord[] = [];
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

export default function MoneyFlowByDayPage() {
  const { currentStore } = useStore();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Date range for filtering - default to today
  const today = new Date();
  const [startDate, setStartDate] = useState<string>(
    format(today, 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    format(today, 'yyyy-MM-dd')
  );

  const [cashFlowData, setCashFlowData] = useState<DailyCashFlow[]>([]);

  // Request ID for race condition prevention
  const requestIdRef = useRef(0);

  // Use hooks for loan calculations - these will be used for the most recent day's data
  const { summary: pawnSummary } = usePawnsSummary();
  const { summary: creditSummary } = useCreditsSummary();
  const { data: installmentSummary } = useInstallmentsSummary();
  
  // Use permissions hook
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();
  
  // Check access permission
  const canAccessReport = hasPermission('dong_tien_theo_ngay');
  
  // Redirect if user doesn't have permission
  useEffect(() => {
    if (!permissionsLoading && !canAccessReport) {
      router.push('/');
    }
  }, [permissionsLoading, canAccessReport, router]);
  
  // Fetch opening balance from store_total_fund for a specific date
  const fetchOpeningBalanceForDate = async (date: Date): Promise<number> => {
    if (!currentStore?.id) return 0;
    
    try {
      // Get the date at 00:00 of the start date in UTC+7
      const utcDate = format(date, 'yyyy-MM-dd');
      
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
  
  // Fetch current loans for a specific date
  const fetchLoansForDate = async (date: Date) => {
    if (!currentStore?.id) return { 
      pawn: 0, credit: 0, installment: 0,
      pawnDebt: 0, creditDebt: 0, installmentDebt: 0
    };
    
    // If we're looking at today's data, use the hooks which are more accurate
    const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    
    if (isToday) {
      return {
        pawn: pawnSummary?.totalLoan || 0,
        credit: creditSummary?.totalLoan || 0,
        installment: installmentSummary?.totalLoan || 0,
        pawnDebt: pawnSummary?.oldDebt || 0,
        creditDebt: creditSummary?.oldDebt || 0,
        installmentDebt: installmentSummary?.oldDebt || 0
      };
    }
    
    try {
      const storeId = currentStore.id;
      const dateEndISO = endOfDay(date).toISOString();
      
      // Fetch pawn loans (active contracts) using the correct status filter
      const { data: activePawns } = await supabase
        .from('pawns')
        .select('loan_amount, id')
        .eq('store_id', storeId)
        .not('status', 'in', '(closed,deleted)')
        .lte('created_at', dateEndISO);
      
      const pawnLoans = activePawns ? 
        activePawns.reduce((sum, item) => sum + (item.loan_amount || 0), 0) : 0;
      
      // Estimate pawn debts for historical dates (simplified approach)
      let pawnDebt = 0;
      if (activePawns && activePawns.length > 0) {
        // Simple estimation for historical debt
        pawnDebt = pawnLoans * 0.05; // Estimate debt as 5% of loan amount
      }
      
      // Fetch credit loans
      const { data: activeCredits } = await supabase
        .from('credits')
        .select('loan_amount, id')
        .eq('store_id', storeId)
        .not('status', 'in', '(closed,deleted)')
        .lte('created_at', dateEndISO);
      
      const creditLoans = activeCredits ? 
        activeCredits.reduce((sum, item) => sum + (item.loan_amount || 0), 0) : 0;
      
      // Estimate credit debts for historical dates (simplified approach)
      let creditDebt = 0;
      if (activeCredits && activeCredits.length > 0) {
        // Simple estimation for historical debt
        creditDebt = creditLoans * 0.05; // Estimate debt as 5% of loan amount
      }
      
      // Fetch installment loans - fixed to use the correct approach
      const { data: employeeIds } = await supabase
        .from('employees')
        .select('id')
        .eq('store_id', storeId);
      
      if (!employeeIds || employeeIds.length === 0) {
        return {
          pawn: pawnLoans,
          credit: creditLoans,
          installment: 0,
          pawnDebt: pawnDebt,
          creditDebt: creditDebt,
          installmentDebt: 0
        };
      }
      
      const employeeIdList = employeeIds.map(emp => emp.id);
      
      const { data: activeInstallments } = await supabase
        .from('installments')
        .select('installment_amount, down_payment, id')
        .in('employee_id', employeeIdList)
        .not('status', 'in', '(closed,deleted)')
        .lte('created_at', dateEndISO);
      
      const installmentLoans = activeInstallments ? 
        activeInstallments.reduce((sum, item) => sum + (item.installment_amount || 0) + (item.down_payment || 0), 0) : 0;
      
      // Estimate installment debts for historical dates (simplified approach)
      let installmentDebt = 0;
      if (activeInstallments && activeInstallments.length > 0) {
        // Simple estimation for historical debt
        installmentDebt = installmentLoans * 0.05; // Estimate debt as 5% of loan amount
      }
      
      return {
        pawn: pawnLoans,
        credit: creditLoans,
        installment: installmentLoans,
        pawnDebt: pawnDebt,
        creditDebt: creditDebt,
        installmentDebt: installmentDebt
      };
    } catch (err) {
      console.error('Error fetching loans for date:', err);
      return { 
        pawn: 0, credit: 0, installment: 0,
        pawnDebt: 0, creditDebt: 0, installmentDebt: 0
      };
    }
  };
  
  // Optimized: Fetch daily cash flow data with parallel processing
  const fetchDailyCashFlow = async () => {
    if (!currentStore?.id) return;

    // Increment request ID to track this request
    const currentRequestId = ++requestIdRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const storeId = currentStore.id;
      const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
      const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));

      // Get all dates in the range
      const dates: Date[] = [];
      const currentDate = new Date(startDateObj);
      
      while (currentDate <= endDateObj) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // OPTIMIZATION 1: Fetch ALL data for the entire date range in one go (parallel queries)
      const startRangeISO = startDateObj.toISOString();
      const endRangeISO = endDateObj.toISOString();

      console.log('Fetching all transaction data in parallel...');
      
      const [
        allPawnHistory,
        allCreditHistory,
        allInstallmentHistory,
        allTransactions,
        allStoreFundHistory
      ] = await Promise.all([
        // Pawn history for entire range
        fetchAllData(
          supabase
            .from('pawn_history')
            .select('created_at, credit_amount, debit_amount, pawns!inner(store_id)')
            .eq('pawns.store_id', storeId)
            .or('is_deleted.is.null,is_deleted.eq.false')
            .gte('created_at', startRangeISO)
            .lte('created_at', endRangeISO)
            .order('id')
        ),

        // Credit history for entire range
        fetchAllData(
          supabase
            .from('credit_history')
            .select('created_at, credit_amount, debit_amount, credits!inner(store_id)')
            .eq('credits.store_id', storeId)
            .or('is_deleted.is.null,is_deleted.eq.false')
            .gte('created_at', startRangeISO)
            .lte('created_at', endRangeISO)
            .order('id')
        ),
        
        // Installment history for entire range
        supabase
          .from('installment_history')
          .select('created_at, credit_amount, debit_amount, installments!inner(employee_id, employees!inner(store_id))')
          .eq('installments.employees.store_id', storeId)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .gte('created_at', startRangeISO)
          .lte('created_at', endRangeISO)
          .limit(50000)
          .then(({ data }) => data || []),
        
                 // Transactions for entire range
         supabase
           .from('transactions')
           .select('created_at, credit_amount, debit_amount, transaction_type')
           .eq('store_id', storeId)
           .eq('is_deleted', false)
           .gte('created_at', startRangeISO)
           .lte('created_at', endRangeISO)
           .limit(50000)
           .then(({ data }) => data || []),
        
        // Store fund history for entire range
        supabase
          .from('store_fund_history')
          .select('created_at, fund_amount, transaction_type')
          .eq('store_id', storeId)
          .gte('created_at', startRangeISO)
          .lte('created_at', endRangeISO)
          .limit(50000)
          .then(({ data }) => data || [])
      ]);

      console.log('All data fetched, processing days in parallel...');

      // OPTIMIZATION 2: Process all days in parallel instead of sequential
      const dailyDataPromises = dates.map(async (date) => {
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);
        
                 // OPTIMIZATION 3: Filter data in memory instead of additional DB queries
         const dayPawnData = allPawnHistory.filter(item => {
           const itemDate = new Date(item.created_at as string);
           return itemDate >= dayStart && itemDate <= dayEnd;
         });
         
         const dayCreditData = allCreditHistory.filter(item => {
           const itemDate = new Date(item.created_at as string);
           return itemDate >= dayStart && itemDate <= dayEnd;
         });
         
         const dayInstallmentData = allInstallmentHistory.filter(item => {
           const itemDate = new Date(item.created_at as string);
           return itemDate >= dayStart && itemDate <= dayEnd;
         });
         
         const dayTransactionData = allTransactions.filter(item => {
           const itemDate = new Date(item.created_at as string);
           return itemDate >= dayStart && itemDate <= dayEnd;
         });
         
         const dayFundData = allStoreFundHistory.filter(item => {
           const itemDate = new Date(item.created_at as string);
           return itemDate >= dayStart && itemDate <= dayEnd;
         });

        // Calculate activities for the day
        const pawnActivity = dayPawnData.reduce((sum, item) => 
          sum + (item.credit_amount as number || 0) - (item.debit_amount as number || 0), 0);
        
        const creditActivity = dayCreditData.reduce((sum, item) => 
          sum + (item.credit_amount as number || 0) - (item.debit_amount as number || 0), 0);
        
        const installmentActivity = dayInstallmentData.reduce((sum, item: any) => 
          sum + (item.credit_amount || 0) - (item.debit_amount || 0), 0);
        
                 const incomeExpenseActivity = dayTransactionData.reduce((sum, item: any) => {
           const amount = (item.credit_amount || 0) - (item.debit_amount || 0);
           return sum + amount;
         }, 0);
        
        const capitalActivity = dayFundData.reduce((sum, item: any) => {
          const amount = item.transaction_type === 'withdrawal' ? 
            -Number(item.fund_amount || 0) : 
            Number(item.fund_amount || 0);
          return sum + amount;
        }, 0);

        // Get opening balance and loans in parallel
        const [openingBalance, loans] = await Promise.all([
          fetchOpeningBalanceForDate(date),
          fetchLoansForDate(date)
        ]);
        
        // Calculate closing balance
        const closingBalance = openingBalance + pawnActivity + creditActivity + 
          installmentActivity + incomeExpenseActivity + capitalActivity;
        
        // Borrowed capital is assumed to be 0 as per requirement
        const borrowedCapital = 0;
        
        // Calculate total assets
        const totalAssets = closingBalance + 
          (loans.pawn + loans.pawnDebt) + 
          (loans.credit + loans.creditDebt) + 
          (loans.installment + loans.installmentDebt) - 
          borrowedCapital;
        
        return {
          date,
          openingBalance,
          pawnActivity,
          creditActivity,
          installmentActivity,
          incomeExpense: incomeExpenseActivity,
          capital: capitalActivity,
          closingBalance,
          pawnLoans: loans.pawn,
          pawnDebts: loans.pawnDebt,
          creditLoans: loans.credit,
          creditDebts: loans.creditDebt,
          installmentLoans: loans.installment,
          installmentDebts: loans.installmentDebt,
          borrowedCapital,
          totalAssets
        };
      });

      // Wait for all days to be processed
      const dailyData = await Promise.all(dailyDataPromises);
      
      // Sort by date descending
      dailyData.sort((a, b) => b.date.getTime() - a.date.getTime());

      // Check if this request is still the latest one before setting state
      if (currentRequestId !== requestIdRef.current) {
        return; // A newer request was made, discard this result
      }

      setCashFlowData(dailyData);
      console.log('All processing completed!');
    } catch (err) {
      // Only set error if this is still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return;
      }
      console.error('Error fetching cash flow data:', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      // Only set loading false if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleSearch = () => {
    fetchDailyCashFlow();
  };

  // Load data when component mounts or when date range or store changes
  useEffect(() => {
    if (currentStore?.id && canAccessReport && !permissionsLoading) {
      fetchDailyCashFlow();
    }
  }, [currentStore?.id, pawnSummary, creditSummary, installmentSummary, canAccessReport, permissionsLoading]);
  
  // Loading state for permissions
  if (permissionsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center p-4">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Đang kiểm tra quyền truy cập...</span>
        </div>
      </Layout>
    );
  }

  // Access denied state
  if (!canAccessReport) {
    return (
      <Layout>
        <div className="p-4 border rounded-md mb-4 bg-gray-50">
          <p className="text-center text-gray-500">
            Bạn không có quyền truy cập báo cáo này
          </p>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="max-w-full">
        {/* Title */}
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Báo cáo dòng tiền lưu chuyển theo ngày</h1>
          </div>
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
                      onChange={(value: string) => setStartDate(value)}
                      placeholder="Chọn ngày bắt đầu"
                      className="w-40"
                    />
                  </div>
                  <div className="flex items-center">
                    <span className="mx-2 text-sm font-medium">Đến ngày</span>
                    <DatePickerWithControls
                      value={endDate}
                      onChange={(value: string) => setEndDate(value)}
                      placeholder="Chọn ngày kết thúc"
                      className="w-40"
                    />
                  </div>
                  <Button onClick={handleSearch} className="ml-2" disabled={isLoading}>
                    {isLoading ? 'Đang tải...' : 'Tìm kiếm'}
                  </Button>
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
        
        {/* Daily Cash Flow Table */}
        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <Table className="border-collapse">
              <TableHeader className="bg-blue-500 text-white">
                <TableRow>
                  <TableHead rowSpan={2} className="py-2 px-3 text-center font-bold border border-gray-300 align-middle w-16">STT<br/>[1]</TableHead>
                  <TableHead rowSpan={2} className="py-2 px-3 text-center font-bold border border-gray-300 align-middle w-32">Ngày<br/>[2]</TableHead>
                  <TableHead rowSpan={2} className="py-2 px-3 text-center font-bold border border-gray-300 align-middle">Tiền<br/>đầu ngày<br/>[3]</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300">Cầm đồ<br/>[4]</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300">Tín chấp<br/>[5]</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300">Trả góp<br/>[6]</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300">Thu chi<br/>[7]</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300">Vốn<br/>[8]</TableHead>
                  <TableHead rowSpan={2} className="py-2 px-3 text-center font-bold border border-gray-300 align-middle">Tiền<br/>cuối ngày<br/>[9]=[3+4+5+6+7+8]</TableHead>
                  <TableHead colSpan={3} className="py-2 px-3 text-center font-bold border border-gray-300">Đang cho vay + Khách nợ</TableHead>
                  <TableHead rowSpan={2} className="py-2 px-3 text-center font-bold border border-gray-300 align-middle">Vốn đi vay<br/>[13]</TableHead>
                  <TableHead rowSpan={2} className="py-2 px-3 text-center font-bold border border-gray-300 align-middle">Tổng tài sản<br/>[14]=[9+10+11+12-13]</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300"></TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300"></TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300"></TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300"></TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300"></TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300">Cầm đồ<br/>[10]</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300">Tín chấp<br/>[11]</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border border-gray-300">Trả góp<br/>[12]</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashFlowData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="py-4 px-3 text-center border border-gray-300">
                      Không có dữ liệu trong khoảng thời gian này
                    </TableCell>
                  </TableRow>
                ) : (
                  cashFlowData.map((day, index) => (
                    <TableRow key={format(day.date, 'yyyy-MM-dd')}>
                      <TableCell className="py-2 px-3 text-center border border-gray-300">
                        {index + 1}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-center border border-gray-300">
                        {format(day.date, 'dd-MM-yyyy')}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right border border-gray-300">
                        {new Intl.NumberFormat('vi-VN').format(day.openingBalance)}
                      </TableCell>
                      <TableCell className={`py-2 px-3 text-right border border-gray-300 ${day.pawnActivity !== 0 ? (day.pawnActivity > 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                        {day.pawnActivity !== 0 ? formatCurrency(day.pawnActivity) : '0'}
                      </TableCell>
                      <TableCell className={`py-2 px-3 text-right border border-gray-300 ${day.creditActivity !== 0 ? (day.creditActivity > 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                        {day.creditActivity !== 0 ? formatCurrency(day.creditActivity) : '0'}
                      </TableCell>
                      <TableCell className={`py-2 px-3 text-right border border-gray-300 ${day.installmentActivity !== 0 ? (day.installmentActivity > 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                        {day.installmentActivity !== 0 ? formatCurrency(day.installmentActivity) : '0'}
                      </TableCell>
                      <TableCell className={`py-2 px-3 text-right border border-gray-300 ${day.incomeExpense !== 0 ? (day.incomeExpense > 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                        {day.incomeExpense !== 0 ? formatCurrency(day.incomeExpense) : '0'}
                      </TableCell>
                      <TableCell className={`py-2 px-3 text-right border border-gray-300 ${day.capital !== 0 ? (day.capital > 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                        {day.capital !== 0 ? formatCurrency(day.capital) : '0'}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right border border-gray-300 font-medium">
                        {new Intl.NumberFormat('vi-VN').format(day.closingBalance)}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right border border-gray-300">
                        {new Intl.NumberFormat('vi-VN').format(day.pawnLoans + day.pawnDebts)}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right border border-gray-300">
                        {new Intl.NumberFormat('vi-VN').format(day.creditLoans + day.creditDebts)}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right border border-gray-300">
                        {new Intl.NumberFormat('vi-VN').format(day.installmentLoans + day.installmentDebts)}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right border border-gray-300">
                        {new Intl.NumberFormat('vi-VN').format(day.borrowedCapital)}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right border border-gray-300 font-medium">
                        {new Intl.NumberFormat('vi-VN').format(
                          day.closingBalance + 
                          (day.pawnLoans + day.pawnDebts) + 
                          (day.creditLoans + day.creditDebts) + 
                          (day.installmentLoans + day.installmentDebts) - 
                          day.borrowedCapital
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {cashFlowData.length > 0 && (
                <TableFooter className="bg-yellow-50">
                  <TableRow>
                    <TableCell colSpan={2} className="py-2 px-3 text-right font-bold border border-gray-300">
                      Quỹ tiền đầu kỳ
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-bold border border-gray-300">
                      {new Intl.NumberFormat('vi-VN').format(cashFlowData[cashFlowData.length - 1].openingBalance)}
                    </TableCell>
                    <TableCell colSpan={5} className="py-2 px-3 text-right font-bold border border-gray-300">
                      Quỹ tiền cuối kỳ
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-bold border border-gray-300">
                      {new Intl.NumberFormat('vi-VN').format(cashFlowData[0].closingBalance)}
                    </TableCell>
                    <TableCell colSpan={3} className="py-2 px-3 text-right font-bold border border-gray-300"></TableCell>
                    <TableCell colSpan={2} className="py-2 px-3 text-right font-bold border border-gray-300"></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2} className="py-2 px-3 text-right font-bold border border-gray-300">
                      Chênh lệch
                    </TableCell>
                    <TableCell colSpan={6} className="py-2 px-3 text-right font-bold border border-gray-300">
                      {new Intl.NumberFormat('vi-VN').format(cashFlowData[0].closingBalance - cashFlowData[cashFlowData.length - 1].openingBalance)}
                    </TableCell>
                    <TableCell colSpan={3} className="py-2 px-3 text-right font-bold border border-gray-300">
                      Tài sản đầu kỳ
                    </TableCell>
                    <TableCell colSpan={3} className="py-2 px-3 text-right font-bold border border-gray-300">
                      {new Intl.NumberFormat('vi-VN').format(cashFlowData[cashFlowData.length - 1].openingBalance + 
                        cashFlowData[cashFlowData.length - 1].pawnLoans + 
                        cashFlowData[cashFlowData.length - 1].creditLoans + 
                        cashFlowData[cashFlowData.length - 1].installmentLoans)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={8} className="py-2 px-3 text-right font-bold border border-gray-300"></TableCell>
                    <TableCell colSpan={3} className="py-2 px-3 text-right font-bold border border-gray-300">
                      Tài sản cuối kỳ
                    </TableCell>
                    <TableCell colSpan={3} className="py-2 px-3 text-right font-bold border border-gray-300">
                      {new Intl.NumberFormat('vi-VN').format(cashFlowData[0].totalAssets)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={8} className="py-2 px-3 text-right font-bold border border-gray-300"></TableCell>
                    <TableCell colSpan={3} className="py-2 px-3 text-right font-bold border border-gray-300">
                      Lợi nhuận
                    </TableCell>
                    <TableCell colSpan={3} className="py-2 px-3 text-right font-bold border border-gray-300 text-red-600">
                      {new Intl.NumberFormat('vi-VN').format(cashFlowData[0].totalAssets - 
                        (cashFlowData[cashFlowData.length - 1].openingBalance + 
                        cashFlowData[cashFlowData.length - 1].pawnLoans + 
                        cashFlowData[cashFlowData.length - 1].creditLoans + 
                        cashFlowData[cashFlowData.length - 1].installmentLoans))}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
