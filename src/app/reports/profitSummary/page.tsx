'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { format, startOfDay, endOfDay, parse, subDays } from 'date-fns';
import { RefreshCw, FileSpreadsheet } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';

// Import status calculation functions
import { calculatePawnStatus } from '@/lib/Pawns/calculate_pawn_status';
import { calculateCreditStatus } from '@/lib/Credits/calculate_credit_status';
import { calculateInstallmentStatus } from '@/lib/Installments/calculate_installment_status';

// Note: RPC functions are now used for interest calculation instead of individual contract calculations

// Import financial calculation functions
import {
  getPawnFinancialsForStore,
  getCreditFinancialsForStore,
  getInstallmentFinancialsForStore
} from '@/lib/overview';

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
import { Button } from '@/components/ui/button';
import { DatePickerWithControls } from '@/components/ui/date-picker-with-controls';

// Import Excel Export component
import ExcelExport from './components/ExcelExport';

// Interface for profit summary data
interface ProfitSummaryRow {
  category: string;
  categoryKey: string;
  total: number;
  new: number;
  old: number;
  closed: number;
  active: number;
  lateInterest: number;
  overdue: number;
  deleted: number;
  totalLoanAmount: number;
  currentLoanAmount: number;
  profit: number;
  customerDebt: number;
}

interface TransactionSummary {
  income: number;
  expense: number;
}

export default function ProfitSummaryPage() {
  const { currentStore } = useStore();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [profitData, setProfitData] = useState<ProfitSummaryRow[]>([]);
  const [transactionData, setTransactionData] = useState<TransactionSummary>({ income: 0, expense: 0 });
  
  // Date range for filtering - default to start of month to today
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState<string>(
    format(startOfMonth, 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    format(today, 'yyyy-MM-dd')
  );

  // Format currency
  const formatCurrency = (amount: number) => {
    const isNegative = amount < 0;
    const absoluteAmount = Math.abs(amount);
    const formatted = new Intl.NumberFormat('vi-VN').format(absoluteAmount);
    return isNegative ? `-${formatted}` : formatted;
  };

  // Use permissions hook
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();
  
  // Check access permission
  const canAccessReport = hasPermission('tong_ket_loi_nhuan');
  
  // Redirect if user doesn't have permission
  useEffect(() => {
    if (!permissionsLoading && !canAccessReport) {
      router.push('/');
    }
  }, [permissionsLoading, canAccessReport, router]);

  // Get contracts with status calculation
  const getContractsWithStatus = async (
    contractType: 'pawns' | 'credits' | 'installments',
    calculateStatus: (id: string) => Promise<any>
  ) => {
    if (!currentStore?.id) return { all: [], filtered: [] };

    const storeId = currentStore.id;
    const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
    const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
    
    let selectString = '';

    if (contractType === 'installments') {
      // Use installments_by_store for installments like in loanReport
      selectString = `
        id, 
        contract_code, 
        down_payment,
        loan_date, 
        status,
        customers(name)
      `;
    } else {
      // For pawns and credits, use regular tables
      selectString = `
        id, 
        contract_code, 
        loan_amount,
        loan_date, 
        status,
        customers(name)
      `;

      if (contractType === 'pawns') {
        selectString += ', collateral_detail';
      } else if (contractType === 'credits') {
        selectString += ', collateral';
      }
    }

    // Strategy: Separate queries for better accuracy
    // 1. Query for NEW contracts (within date range) - no limit needed
    // 2. Query for ALL contracts for status counts - optimize differently
    
    let newQuery, allQuery;
    
    if (contractType === 'installments') {
      // Query for new contracts in date range
      newQuery = supabase
        .from('installments_by_store')
        .select(selectString)
        .eq('store_id', storeId)
        .gte('loan_date', startDateObj.toISOString())
        .lte('loan_date', endDateObj.toISOString())
        .order('loan_date', { ascending: false });
        
      // Query for all contracts for status calculation
      allQuery = supabase
        .from('installments_by_store')
        .select(selectString)
        .eq('store_id', storeId)
        .order('loan_date', { ascending: false });
        // Removed limit - get all for accurate counts
    } else {
      // Query for new contracts in date range
      newQuery = supabase
        .from(contractType)
        .select(selectString)
        .eq('store_id', storeId)
        .gte('loan_date', startDateObj.toISOString())
        .lte('loan_date', endDateObj.toISOString())
        .order('loan_date', { ascending: false });
        
      // Query for all contracts for status calculation
      allQuery = supabase
        .from(contractType)
        .select(selectString)
        .eq('store_id', storeId)
        .order('loan_date', { ascending: false });
        // Removed limit - get all for accurate counts
    }

    // Execute both queries in parallel
    const [
      { data: newContracts, error: newError },
      { data: allContracts, error: allError }
    ] = await Promise.all([newQuery, allQuery]);

    if (newError) {
      console.error(`Error fetching new ${contractType}:`, newError);
    }
    
    if (allError) {
      console.error(`Error fetching all ${contractType}:`, allError);
      return { all: [], filtered: newContracts || [] };
    }

    // Get status for all contracts with batch processing for better performance
    const batchSize = 20;
    const contractsWithStatus = [];
    
    for (let i = 0; i < (allContracts || []).length; i += batchSize) {
      const batch = (allContracts || []).slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (contract: any) => {
          try {
            const statusResult = await calculateStatus(contract.id);
            return {
              ...contract,
              calculatedStatus: statusResult.statusCode,
              statusDescription: statusResult.description
            };
          } catch (error) {
            console.error(`Error calculating status for ${contract.id}:`, error);
            return {
              ...contract,
              calculatedStatus: 'ON_TIME',
              statusDescription: 'Không thể tính trạng thái'
            };
          }
        })
      );
      contractsWithStatus.push(...batchResults);
    }

    // Also get status for new contracts
    const newContractsWithStatus = [];
    for (let i = 0; i < (newContracts || []).length; i += batchSize) {
      const batch = (newContracts || []).slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (contract: any) => {
          try {
            const statusResult = await calculateStatus(contract.id);
            return {
              ...contract,
              calculatedStatus: statusResult.statusCode,
              statusDescription: statusResult.description
            };
          } catch (error) {
            console.error(`Error calculating status for ${contract.id}:`, error);
            return {
              ...contract,
              calculatedStatus: 'ON_TIME',
              statusDescription: 'Không thể tính trạng thái'
            };
          }
        })
      );
      newContractsWithStatus.push(...batchResults);
    }

    return {
      all: contractsWithStatus,
      filtered: newContractsWithStatus
    };
  };

  // Get interest/profit data for date range by contract type - updated to get ALL contracts like interestDetail
  // Optimized interest calculation using RPC functions for better performance
  // Previous version: query all history records and calculate each contract individually (~several seconds)
  // New version: use database RPC functions to calculate in bulk (~few milliseconds)
  const getInterestDataForDateRange = async (contractType: 'pawns' | 'credits' | 'installments') => {
    if (!currentStore?.id) return 0;

    const storeId = currentStore.id;
    const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
    const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));

    let totalInterest = 0;

    try {
      if (contractType === 'pawns') {
        // Get all pawn IDs for this store
        const { data: pawnContracts } = await supabase
          .from('pawns')
          .select('id')
          .eq('store_id', storeId);

        if (pawnContracts && pawnContracts.length > 0) {
          const pawnIds = pawnContracts.map(p => p.id);
          
          // Use RPC function to get paid interest for date range - much faster!
          const { data, error } = await supabase.rpc('get_pawn_paid_interest', {
            p_pawn_ids: pawnIds,
            p_start_date: startDateObj.toISOString(),
            p_end_date: endDateObj.toISOString(),
          });

          if (error) {
            console.error('get_pawn_paid_interest RPC error:', error);
            return 0;
          }

          // Sum all paid interest from RPC function result
          if (Array.isArray(data)) {
            totalInterest = data.reduce((sum, item) => {
              return sum + Number(item.paid_interest || 0);
            }, 0);
          }
        }

      } else if (contractType === 'credits') {
        // Get all credit IDs for this store
        const { data: creditContracts } = await supabase
          .from('credits')
          .select('id')
          .eq('store_id', storeId);

        if (creditContracts && creditContracts.length > 0) {
          const creditIds = creditContracts.map(c => c.id);
          
          // Use RPC function to get paid interest for date range - much faster!
          const { data, error } = await supabase.rpc('get_paid_interest', {
            p_credit_ids: creditIds,
            p_start_date: startDateObj.toISOString(),
            p_end_date: endDateObj.toISOString(),
          });

          if (error) {
            console.error('get_paid_interest RPC error:', error);
            return 0;
          }

          // Sum all paid interest from RPC function result
          if (Array.isArray(data)) {
            totalInterest = data.reduce((sum, item) => {
              return sum + Number(item.paid_interest || 0);
            }, 0);
          }
        }

      } else if (contractType === 'installments') {
        // Installments logic remains the same as it's already optimized
        const { data: installmentHistory } = await supabase
          .from('installment_history')
          .select('credit_amount, installment_id, installments_by_store!inner(store_id, down_payment)')
          .eq('installments_by_store.store_id', storeId)
          .eq('transaction_type', 'payment')
          .gte('created_at', startDateObj.toISOString())
          .lte('created_at', endDateObj.toISOString())
          .or('is_deleted.is.null,is_deleted.eq.false');

        if (installmentHistory) {
          const contractProfitMap = new Map<string, { totalCredit: number, downPayment: number }>();

          installmentHistory.forEach((item: any) => {
            const contractId = item.installment_id;
            const creditAmount = item.credit_amount || 0;
            const downPayment = item.installments_by_store?.down_payment || 0;

            if (!contractProfitMap.has(contractId)) {
              contractProfitMap.set(contractId, { totalCredit: 0, downPayment });
            }
            const current = contractProfitMap.get(contractId)!;
            current.totalCredit += creditAmount;
          });

          for (const [contractId, { totalCredit, downPayment }] of contractProfitMap) {
            if (totalCredit > downPayment) {
              totalInterest += (totalCredit - downPayment);
            }
          }
        }
      }

    } catch (error) {
      console.error(`Error fetching ${contractType} interest data:`, error);
    }

    return totalInterest;
  };



  // Get transaction data for income/expense
  const getTransactionData = async () => {
    if (!currentStore?.id) return { income: 0, expense: 0 };

    const storeId = currentStore.id;
    const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
    const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));

    try {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('credit_amount, debit_amount')
        .eq('store_id', storeId)
        .gte('created_at', startDateObj.toISOString())
        .lte('created_at', endDateObj.toISOString())
        .eq('is_deleted', false);

      if (transactions) {
        const income = transactions.reduce((sum, t) => sum + (t.credit_amount || 0), 0);
        const expense = transactions.reduce((sum, t) => sum + (t.debit_amount || 0), 0);
        return { income, expense };
      }
    } catch (error) {
      console.error('Error fetching transaction data:', error);
    }

    return { income: 0, expense: 0 };
  };

  // Count contracts by status
  const countContractsByStatus = (contracts: any[]) => {
    const counts = {
      total: contracts.length,
      closed: 0,
      active: 0,
      lateInterest: 0,
      overdue: 0,
      deleted: 0
    };

    contracts.forEach(contract => {
      switch (contract.calculatedStatus) {
        case 'CLOSED':
          counts.closed++;
          break;
        case 'ON_TIME':
          counts.active++;
          break;
        case 'LATE_INTEREST':
          counts.lateInterest++;
          break;
        case 'OVERDUE':
          counts.overdue++;
          break;
        case 'DELETED':
          counts.deleted++;
          break;
      }
    });

    return counts;
  };

    // Fetch all profit summary data
  const fetchProfitSummary = async () => {
    if (!currentStore?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Execute all data fetching in parallel for better performance
      const [
        pawnData,
        creditData, 
        installmentData,
        pawnFinancials,
        creditFinancials,
        installmentFinancials,
        transactionSummary
      ] = await Promise.all([
        getContractsWithStatus('pawns', calculatePawnStatus),
        getContractsWithStatus('credits', calculateCreditStatus),
        getContractsWithStatus('installments', calculateInstallmentStatus),
        getPawnFinancialsForStore(currentStore.id),
        getCreditFinancialsForStore(currentStore.id),
        getInstallmentFinancialsForStore(currentStore.id),
        getTransactionData()
      ]);

      setTransactionData(transactionSummary);

      // Get customer debt data (these use the same financial functions)
      const pawnDebt = pawnFinancials.oldDebt || 0;
      const creditDebt = creditFinancials.oldDebt || 0;
      const installmentDebt = installmentFinancials.oldDebt || 0;

       // Process data for each contract type
       const processContractData = async (
         allContracts: any[],
         newContracts: any[],
         financials: any,
         debt: number,
         category: string,
         categoryKey: string,
         contractType: 'pawns' | 'credits' | 'installments'
       ): Promise<ProfitSummaryRow> => {
         const allCounts = countContractsByStatus(allContracts);
         const newCounts = countContractsByStatus(newContracts);

         // Calculate loan amounts
         const totalLoanAmount = newContracts.reduce((sum, contract) => {
           const amount = categoryKey === 'installment' 
             ? (contract.down_payment || 0)  // Use down_payment for installments
             : (contract.loan_amount || 0);
           return sum + amount;
         }, 0);

         // Get interest data for all contracts in date range (like interestDetail)
         const contractProfit = await getInterestDataForDateRange(contractType);

         return {
           category,
           categoryKey,
           total: allCounts.total,
           new: newCounts.total,
           old: allCounts.total - newCounts.total,
           closed: allCounts.closed,
           active: allCounts.active,
           lateInterest: allCounts.lateInterest,
           overdue: allCounts.overdue,
           deleted: allCounts.deleted,
           totalLoanAmount,
           currentLoanAmount: financials.totalLoan || 0,
           profit: contractProfit, // Profit from new contracts only
           customerDebt: debt
         };
       };

             const summaryData: ProfitSummaryRow[] = await Promise.all([
         processContractData(
           pawnData.all,
           pawnData.filtered,
           pawnFinancials,
           pawnDebt,
           'Cầm đồ',
           'pawn',
           'pawns'
         ),
         processContractData(
           creditData.all,
           creditData.filtered,
           creditFinancials,
           creditDebt,
           'Tín chấp',
           'credit',
           'credits'
         ),
         processContractData(
           installmentData.all,
           installmentData.filtered,
           installmentFinancials,
           installmentDebt,
           'Trả góp',
           'installment',
           'installments'
         )
       ]);

      setProfitData(summaryData);

    } catch (err) {
      console.error('Error fetching profit summary:', err);
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on mount and when filters change
  useEffect(() => {
    if (currentStore?.id && canAccessReport && !permissionsLoading) {
      fetchProfitSummary();
    }
  }, [currentStore?.id, startDate, endDate, canAccessReport, permissionsLoading]);

  // Calculate totals
  const calculateTotals = () => {
    return profitData.reduce((totals, row) => ({
      total: totals.total + row.total,
      new: totals.new + row.new,
      old: totals.old + row.old,
      closed: totals.closed + row.closed,
      active: totals.active + row.active,
      lateInterest: totals.lateInterest + row.lateInterest,
      overdue: totals.overdue + row.overdue,
      deleted: totals.deleted + row.deleted,
      totalLoanAmount: totals.totalLoanAmount + row.totalLoanAmount,
      currentLoanAmount: totals.currentLoanAmount + row.currentLoanAmount,
      profit: totals.profit + row.profit,
      customerDebt: totals.customerDebt + row.customerDebt
    }), {
      total: 0, new: 0, old: 0, closed: 0, active: 0, lateInterest: 0, 
      overdue: 0, deleted: 0, totalLoanAmount: 0, currentLoanAmount: 0, 
      profit: 0, customerDebt: 0
    });
  };

  const totals = calculateTotals();

  // Handle date changes
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
  };

  const handleRefresh = () => {
    fetchProfitSummary();
  };

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
        {/* Title and Controls */}
        <div className="flex flex-col gap-4 border-b pb-4 mb-4">
          {/* Header with Title and Summary Cards */}
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Thống kê lợi nhuận</h1>
            
            {/* Summary Cards - Right side */}
            <div className="flex items-center gap-3">
              <Card className="px-4 py-2">
                <div className="flex flex-col items-center">
                  <div className="text-xs font-medium text-red-600 mb-1">HỢP ĐỒNG MỚI</div>
                  <div className="text-lg font-bold text-red-600">{totals.new}</div>
                </div>
              </Card>
              <Card className="px-4 py-2">
                <div className="flex flex-col items-center">
                  <div className="text-xs font-medium text-green-600 mb-1">LỢI NHUẬN</div>
                  <div className="text-lg font-bold text-green-600">
                    {formatCurrency(totals.profit)}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Date Filters and Action Buttons */}
          <div className="flex items-center gap-4 w-full">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Từ ngày:</label>
              <DatePickerWithControls
                value={startDate}
                onChange={handleStartDateChange}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Đến ngày:</label>
              <DatePickerWithControls
                value={endDate}
                onChange={handleEndDateChange}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button onClick={handleRefresh} className="bg-blue-600 hover:bg-blue-700">
                Tìm kiếm
              </Button>
              <ExcelExport
                profitData={profitData}
                transactionData={transactionData}
                startDate={startDate}
                endDate={endDate}
                storeName={currentStore?.name}
              />
              <Button
                onClick={handleRefresh}
                disabled={isLoading}
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Làm mới
              </Button>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="text-red-700 py-2 mb-4" role="alert">
            <p>{error}</p>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Đang tải dữ liệu...</span>
          </div>
        )}

        {/* Main Table */}
        <div className="rounded-md border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="border-collapse min-w-full">
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead rowSpan={2} className="py-2 px-3 text-center font-bold border-b border-r border-gray-200 min-w-[100px]">
                    Hợp đồng
                  </TableHead>
                  <TableHead colSpan={3} className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">
                    Tạo mới/cũ
                  </TableHead>
                  <TableHead colSpan={5} className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">
                    Theo trạng thái
                  </TableHead>
                  <TableHead colSpan={4} className="py-2 px-3 text-center font-bold border-b border-gray-200">
                    Thông tin tiền
                  </TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Tổng</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Mới</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Cũ</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Đóng</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Trả lãi phí</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Nợ lãi</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Quá hạn</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">T.Lý</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Tổng tiền cho vay</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Đang cho vay</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Lợi nhuận</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Khách nợ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitData.map((row) => (
                  <TableRow key={row.categoryKey} className="hover:bg-gray-50">
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                      {row.category}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">
                      {row.total}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">
                      {row.new}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">
                      {row.old}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">
                      {row.closed}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">
                      {row.active}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">
                      {row.lateInterest}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">
                      {row.overdue}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">
                      {row.deleted}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-right text-blue-600">
                      {formatCurrency(row.totalLoanAmount)}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-right text-blue-600">
                      {formatCurrency(row.currentLoanAmount)}
                    </TableCell>
                    <TableCell className={`py-3 px-3 border-b border-r border-gray-200 text-right ${
                      row.profit > 0 ? 'text-green-600' : row.profit < 0 ? 'text-red-600' : ''
                    }`}>
                      {row.profit > 0 ? '+' : ''}{formatCurrency(row.profit)}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-gray-200 text-right">
                      {formatCurrency(row.customerDebt)}
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Additional rows for Thu hoạt động, Chi hoạt động, Trả lãi vốn vay */}
                <TableRow className="hover:bg-gray-50">
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                    Thu hoạt động
                  </TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-right">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-right">0</TableCell>
                  <TableCell className={`py-3 px-3 border-b border-r border-gray-200 text-right ${
                    transactionData.income > 0 ? 'text-green-600' : ''
                  }`}>
                    {transactionData.income > 0 ? '+' : ''}{formatCurrency(transactionData.income)}
                  </TableCell>
                  <TableCell className="py-3 px-3 border-b border-gray-200 text-right">0</TableCell>
                </TableRow>

                <TableRow className="hover:bg-gray-50">
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                    Chi hoạt động
                  </TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-right">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-right">0</TableCell>
                  <TableCell className={`py-3 px-3 border-b border-r border-gray-200 text-right ${
                    transactionData.expense > 0 ? 'text-red-600' : ''
                  }`}>
                    -{formatCurrency(transactionData.expense)}
                  </TableCell>
                  <TableCell className="py-3 px-3 border-b border-gray-200 text-right">0</TableCell>
                </TableRow>

                <TableRow className="hover:bg-gray-50">
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                    Trả lãi vốn vay
                  </TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-center">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-right">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-right">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-r border-gray-200 text-right">0</TableCell>
                  <TableCell className="py-3 px-3 border-b border-gray-200 text-right">0</TableCell>
                </TableRow>
              </TableBody>
              <TableFooter className="bg-yellow-50">
                <TableRow>
                  <TableCell className="py-3 px-3 font-bold border-t-2 border-r border-gray-300">
                    Tổng cộng
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-center border-t-2 border-r border-gray-300">
                    {totals.total}
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-center border-t-2 border-r border-gray-300">
                    {totals.new}
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-center border-t-2 border-r border-gray-300">
                    {totals.old}
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-center border-t-2 border-r border-gray-300">
                    {totals.closed}
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-center border-t-2 border-r border-gray-300">
                    {totals.active}
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-center border-t-2 border-r border-gray-300">
                    {totals.lateInterest}
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-center border-t-2 border-r border-gray-300">
                    {totals.overdue}
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-center border-t-2 border-r border-gray-300">
                    {totals.deleted}
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-right border-t-2 border-r border-gray-300 text-blue-600">
                    {formatCurrency(totals.totalLoanAmount)}
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-right border-t-2 border-r border-gray-300 text-blue-600">
                    {formatCurrency(totals.currentLoanAmount)}
                  </TableCell>
                  <TableCell className={`py-3 px-3 font-bold text-right border-t-2 border-r border-gray-300 ${
                    (totals.profit + transactionData.income - transactionData.expense) > 0 ? 'text-green-600' : 
                    (totals.profit + transactionData.income - transactionData.expense) < 0 ? 'text-red-600' : ''
                  }`}>
                    {(totals.profit + transactionData.income - transactionData.expense) > 0 ? '+' : ''}
                    {formatCurrency(totals.profit + transactionData.income - transactionData.expense)}
                  </TableCell>
                  <TableCell className="py-3 px-3 font-bold text-right border-t-2 border-gray-300">
                    {formatCurrency(totals.customerDebt)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
