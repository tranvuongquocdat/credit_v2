'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { format, startOfDay, endOfDay, parse, parseISO } from 'date-fns';
import { RefreshCw } from 'lucide-react';
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
  
  // Use permissions hook
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();
  
  // Check access permission
  const canAccessReport = hasPermission('tong_ket_giao_dich');
  
  // Redirect if user doesn't have permission
  useEffect(() => {
    if (!permissionsLoading && !canAccessReport) {
      router.push('/');
    }
  }, [permissionsLoading, canAccessReport, router]);
  
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
  const [employees, setEmployees] = useState<{full_name: string, username: string}[]>([]);

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
        .from('employees')
        .select(`
          full_name,
          profiles!inner(username)
        `)
        .eq('store_id', currentStore.id)
        .eq('status', 'working')
        .not('full_name', 'is', null)
        .order('full_name');
      
      if (error) throw error;
      
      // Transform the data to flatten the structure
      const transformedData = (data || []).map(item => ({
        full_name: item.full_name,
        username: item.profiles?.username || ''
      }));
      
      setEmployees(transformedData);
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

  // Fetch transaction data using the exact same aggregation logic as TransactionDetailsTable
  const fetchTransactionData = async (): Promise<TransactionData> => {
    if (!currentStore?.id) {
      return {
        pawn: { income: 0, expense: 0 },
        credit: { income: 0, expense: 0 },
        installment: { income: 0, expense: 0 },
        incomeExpense: { income: 0, expense: 0 },
        capital: { income: 0, expense: 0 }
      };
    }

    try {
      const storeId = currentStore.id;

      // Helper similar to TransactionDetailsTable
      const translateTransactionType = (transactionType: string, isDeleted: boolean = false): string => {
        const translations: { [key: string]: string } = {
          payment: isDeleted ? 'Huỷ đóng lãi' : 'Đóng lãi',
          loan: 'Cho vay',
          additional_loan: 'Vay thêm',
          principal_repayment: 'Trả gốc',
          contract_close: 'Đóng HĐ',
          contract_reopen: 'Mở lại HĐ',
          debt_payment: 'Trả nợ',
          extension: 'Gia hạn',
          deposit: 'Nộp tiền',
          withdrawal: 'Rút tiền',
          income: 'Thu nhập',
          expense: 'Chi phí',
          penalty: 'Phạt',
          interest: 'Lãi',
          fee: 'Phí',
          refund: 'Hoàn tiền',
          initial_loan: 'Khoản vay ban đầu',
          update_contract: 'Cập nhật HĐ',
          contract_delete: 'Xóa HĐ',
          contract_extension: 'Gia hạn HĐ',
          contract_rotate: 'Đảo HĐ',
          thu_khac: 'Thu khác',
          thu_tra_quy: 'Thu trả quỹ',
          thu_tien_no: 'Thu tiền nợ',
          thu_tien_ung: 'Thu tiền ứng',
          thu_tien_phat: 'Thu tiền phạt',
          hoa_hong_thu: 'Hoa hồng thu',
          thu_ve: 'Thu vé',
          tra_luong: 'Trả lương',
          tra_lai_phi: 'Trả lãi phí',
          chi_tieu_dung: 'Chi tiêu dùng',
          chi_tra_quy: 'Chi trả quỹ',
          tam_ung: 'Tạm ứng',
          hoa_hong_chi: 'Hoa hồng chi',
          chi_ve: 'Chi vé',
          chi_van_phong: 'Chi văn phòng',
          chi_khac: 'Chi khác',
        };
        return translations[transactionType] || transactionType;
      };

      type FundHistoryItem = {
        id: string;
        date: string;
        description: string;
        transactionType: string;
        source: string;
        income: number;
        expense: number;
        contractCode?: string;
        employeeName?: string;
        customerName?: string;
        itemName?: string;
      };

      const allHistoryItems: FundHistoryItem[] = [];

      const processItems = (data: any[], source: string) => {
        if (!data || data.length === 0) return;

        data.forEach((item) => {
          if (!item.created_at) return;

          const getCommonData = () => {
            let employeeName = '';
            if (source === 'Thu chi') {
              employeeName = item.employee_name || '';
            } else if (source === 'Cầm đồ' || source === 'Tín chấp' || source === 'Trả góp') {
              employeeName = item.profiles?.username || '';
            }

            let customerName = '';
            if (source === 'Cầm đồ') {
              customerName = item.pawns?.customers?.name || '';
            } else if (source === 'Tín chấp') {
              customerName = item.credits?.customers?.name || '';
            } else if (source === 'Trả góp') {
              customerName = item.installments?.customers?.name || '';
            } else if (source === 'Nguồn vốn') {
              customerName = (item as any).name || '';
            } else if (source === 'Thu chi') {
              customerName = (item as any).customers?.name || '';
            }

            let itemName = '';
            if (source === 'Cầm đồ') {
              try {
                if (item.pawns?.collateral_detail) {
                  const detail = typeof item.pawns.collateral_detail === 'string'
                    ? JSON.parse(item.pawns.collateral_detail)
                    : item.pawns.collateral_detail;
                  itemName = detail?.name || '';
                }
              } catch {}
            }
            return { employeeName, customerName, itemName };
          };

          if ((source === 'Cầm đồ' || source === 'Tín chấp' || source === 'Trả góp') && item.transaction_type === 'payment') {
            const { employeeName, customerName, itemName } = getCommonData();
            const amount = (item.credit_amount || 0) - (item.debit_amount || 0);

            allHistoryItems.push({
              id: `${source.toLowerCase()}-${item.id}`,
              date: item.created_at,
              description: translateTransactionType(item.transaction_type, false),
              transactionType: item.transaction_type,
              source,
              income: amount > 0 ? amount : 0,
              expense: amount < 0 ? -amount : 0,
              contractCode: item.contract_code || '-',
              employeeName,
              customerName,
              itemName,
            });

            if (item.is_deleted && item.updated_at) {
              allHistoryItems.push({
                id: `${source.toLowerCase()}-${item.id}-cancel`,
                date: item.updated_at,
                description: translateTransactionType(item.transaction_type, true),
                transactionType: item.transaction_type,
                source,
                income: amount < 0 ? -amount : 0,
                expense: amount > 0 ? amount : 0,
                contractCode: item.contract_code || '-',
                employeeName,
                customerName,
                itemName,
              });
            }
          } else {
            let amount = 0;
            if (source === 'Nguồn vốn') {
              amount = item.transaction_type === 'withdrawal' ? -Number(item.fund_amount || 0) : Number(item.fund_amount || 0);
            } else if (source === 'Thu chi') {
              amount = (item.credit_amount || 0) - (item.debit_amount || 0);
              if (amount === 0) {
                amount = item.transaction_type === 'expense' ? -Number(item.amount || 0) : Number(item.amount || 0);
              }
            } else {
              amount = (item.credit_amount || 0) - (item.debit_amount || 0);
            }

            const { employeeName, customerName, itemName } = getCommonData();
            allHistoryItems.push({
              id: `${source.toLowerCase()}-${item.id}`,
              date: item.created_at,
              description: translateTransactionType(item.transaction_type || ''),
              transactionType: item.transaction_type || '',
              source,
              income: amount > 0 ? amount : 0,
              expense: amount < 0 ? -amount : 0,
              contractCode: item.contract_code || '-',
              employeeName,
              customerName,
              itemName,
            });
          }
        });
      };

      // Fetch all relevant data (no date filter here; we filter after aggregation)
      const creditHistoryData = await fetchAllData(
        supabase
          .from('credit_history')
          .select(`
            id,
            created_at,
            updated_at,
            is_deleted,
            transaction_type,
            credit_amount,
            debit_amount,
            created_by,
            credits!inner (
              contract_code,
              store_id,
              customers (name)
            ),
            profiles:created_by (username)
          `)
          .eq('credits.store_id', storeId)
      );

      if (creditHistoryData) {
        const processedCreditData = creditHistoryData.map((item: any) => ({
          ...item,
          contract_code: item.credits?.contract_code || null,
        }));
        processItems(processedCreditData, 'Tín chấp');
      }

      const pawnHistoryData = await fetchAllData(
        supabase
          .from('pawn_history')
          .select(`
            id,
            created_at,
            updated_at,
            is_deleted,
            transaction_type,
            credit_amount,
            debit_amount,
            created_by,
            pawns!inner (
              contract_code,
              store_id,
              customers (name),
              collateral_detail
            ),
            profiles:created_by (username)
          `)
          .eq('pawns.store_id', storeId)
      );

      if (pawnHistoryData) {
        const processedPawnData = pawnHistoryData.map((item: any) => ({
          ...item,
          contract_code: item.pawns?.contract_code || null,
        }));
        processItems(processedPawnData, 'Cầm đồ');
      }

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
            created_by,
            installments!inner (
              contract_code,
              employee_id,
              employees!inner (store_id),
              customers (name)
            ),
            profiles:created_by (username)
          `)
          .eq('installments.employees.store_id', storeId)
          .not('transaction_type', 'in', '(contract_close,contract_rotate)')
      );

      if (installmentHistoryData) {
        const processedInstallmentData = installmentHistoryData.map((item: any) => ({
          ...item,
          contract_code: item.installments?.contract_code || null,
        }));
        processItems(processedInstallmentData, 'Trả góp');
      }

      const { data: storeFundData } = await supabase
        .from('store_fund_history')
        .select('*')
        .eq('store_id', storeId)
        .limit(10000);
      if (storeFundData) processItems(storeFundData as any[], 'Nguồn vốn');

      const allTransactionsData = await fetchAllData(
        supabase
          .from('transactions')
          .select('*, customers:customer_id(name)')
          .eq('store_id', storeId)
      );

      const transformTransactionsForDisplay = (rawTransactions: any[]) => {
        const displayTransactions: any[] = [];
        rawTransactions.forEach((transaction) => {
          if (transaction.is_deleted) {
            displayTransactions.push({
              ...transaction,
              is_cancellation: false,
            });
            displayTransactions.push({
              ...transaction,
              id: `${transaction.id}_cancel`,
              is_cancellation: true,
              created_at: transaction.update_at || transaction.created_at,
              credit_amount: transaction.credit_amount ? -transaction.credit_amount : null,
              debit_amount: transaction.debit_amount ? -transaction.debit_amount : null,
              description: transaction.credit_amount > 0 ? 'Huỷ thu' : 'Huỷ chi',
            });
          } else {
            displayTransactions.push({
              ...transaction,
              is_cancellation: false,
            });
          }
        });
        return displayTransactions;
      };
      const displayTransactionsData = transformTransactionsForDisplay(allTransactionsData);
      if (displayTransactionsData) processItems(displayTransactionsData, 'Thu chi');

      // Group by contract/date/type/source/description to aggregate as in details
      const groupedData = new Map<string, FundHistoryItem>();
      allHistoryItems.forEach((item) => {
        const transactionDate = new Date(item.date).toDateString();
        const groupKey = `${item.contractCode}-${transactionDate}-${item.transactionType}-${item.source}-${item.description}`;
        if (groupedData.has(groupKey)) {
          const existing = groupedData.get(groupKey)!;
          existing.income += item.income;
          existing.expense += item.expense;
          if (new Date(item.date) > new Date(existing.date)) {
            existing.date = item.date;
          }
        } else {
          groupedData.set(groupKey, { ...item });
        }
      });

      // Convert to array, sort by date desc
      const aggregatedTransactions = Array.from(groupedData.values()).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // Filter by date range
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      let filteredTransactions = aggregatedTransactions.filter((item) => {
        const itemDate = new Date(item.date);
        return itemDate >= start && itemDate <= end;
      });

      // Apply filters consistent with details table
      if (selectedTransactionType !== 'all') {
        filteredTransactions = filteredTransactions.filter(
          (item) => item.source === selectedTransactionType
        );
      }
      if (selectedEmployee !== 'all') {
        filteredTransactions = filteredTransactions.filter(
          (item) => item.employeeName === selectedEmployee
        );
      }

      // Totals by source
      const totalsBySource: { [key: string]: { income: number; expense: number } } = {
        'Tín chấp': { income: 0, expense: 0 },
        'Cầm đồ': { income: 0, expense: 0 },
        'Trả góp': { income: 0, expense: 0 },
        'Nguồn vốn': { income: 0, expense: 0 },
        'Thu chi': { income: 0, expense: 0 },
      };
      filteredTransactions.forEach((item) => {
        if (item.source in totalsBySource) {
          totalsBySource[item.source].income += item.income;
          totalsBySource[item.source].expense += item.expense;
        }
      });

      return {
        pawn: { income: totalsBySource['Cầm đồ'].income, expense: totalsBySource['Cầm đồ'].expense },
        credit: { income: totalsBySource['Tín chấp'].income, expense: totalsBySource['Tín chấp'].expense },
        installment: { income: totalsBySource['Trả góp'].income, expense: totalsBySource['Trả góp'].expense },
        incomeExpense: { income: totalsBySource['Thu chi'].income, expense: totalsBySource['Thu chi'].expense },
        capital: { income: totalsBySource['Nguồn vốn'].income, expense: totalsBySource['Nguồn vốn'].expense },
      };
    } catch (err) {
      console.error('Error fetching transaction data:', err);
      return {
        pawn: { income: 0, expense: 0 },
        credit: { income: 0, expense: 0 },
        installment: { income: 0, expense: 0 },
        incomeExpense: { income: 0, expense: 0 },
        capital: { income: 0, expense: 0 },
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

  // Load data when component mounts or when date range or store changes
  useEffect(() => {
    if (currentStore?.id && canAccessReport && !permissionsLoading) {
      fetchTransactionSummaryData();
      fetchEmployees();
    }
  }, [currentStore?.id, startDate, endDate, canAccessReport, permissionsLoading, selectedTransactionType, selectedEmployee]);

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
            <div className="space-y-4">
              {/* Date range selectors */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium whitespace-nowrap">Từ ngày</span>
                  <DatePickerWithControls
                    value={startDate} 
                    onChange={handleStartDateChange}
                    placeholder="Chọn ngày bắt đầu"
                    className="w-40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium whitespace-nowrap">Đến ngày</span>
                  <DatePickerWithControls
                    value={endDate} 
                    onChange={handleEndDateChange}
                    placeholder="Chọn ngày kết thúc"
                    className="w-40"
                  />
                </div>
              </div>
              
              {/* Filter controls */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium whitespace-nowrap">Loại giao dịch:</span>
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
                  <span className="text-sm font-medium whitespace-nowrap">Nhân viên:</span>
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
                  className="w-fit"
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
            <div className="rounded-md border border-gray-200 overflow-x-auto">
              <Table className="border-collapse min-w-full">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 min-w-[200px]">Bảng Tổng Kết</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 min-w-[150px]">Thu</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200 min-w-[150px]">Chi</TableHead>
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
