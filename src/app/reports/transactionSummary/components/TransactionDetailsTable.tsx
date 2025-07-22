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
import Link from 'next/link';

interface TransactionDetailsTableProps {
  storeId: string | undefined;
  startDate: string;
  endDate: string;
  selectedTransactionType?: string;
  selectedEmployee?: string;
}

// Use the same interfaces as total-fund page with additional fields
interface FundHistoryItem {
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
}

interface GenericHistoryItem {
  id: string;
  created_at: string | null;
  updated_at?: string | null;
  is_deleted?: boolean | null;
  description?: string | null;
  note?: string | null;
  transaction_type?: string | null;
  debit_amount?: number | null;
  credit_amount?: number | null;
  fund_amount?: number | null;
  amount?: number | null;
  contract_id?: string | null;
  pawn_id?: string | null;
  credit_id?: string | null;
  installment_id?: string | null;
  contract_code?: string | null;
  employee_name?: string | null;
  customer_name?: string | null;
  profiles?: {
    username?: string;
  } | null;
  // Nested relations for customer data
  credits?: {
    contract_code?: string;
    customers?: {
      name?: string;
    };
  } | null;
  pawns?: {
    contract_code?: string;
    customers?: {
      name?: string;
    };
    collateral_asset?: {
      name?: string;
    };
    collateral_detail?: any;
  } | null;
  installments?: {
    contract_code?: string;
    customers?: {
      name?: string;
    };
  } | null;
}

export default function TransactionDetailsTable({ 
  storeId, 
  startDate, 
  endDate, 
  selectedTransactionType = 'all',
  selectedEmployee = 'all'
}: TransactionDetailsTableProps) {
  const [transactions, setTransactions] = useState<FundHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to translate transaction_type to Vietnamese
  const translateTransactionType = (transactionType: string, isDeleted: boolean = false): string => {
    const translations: { [key: string]: string } = {
      // Contract transaction types
      'payment': isDeleted ? 'Huỷ đóng lãi' : 'Đóng lãi',
      'loan': 'Cho vay',
      'additional_loan': 'Vay thêm',
      'principal_repayment': 'Trả gốc',
      'contract_close': 'Đóng HĐ',
      'contract_reopen': 'Mở lại HĐ',
      'debt_payment': 'Trả nợ',
      'extension': 'Gia hạn',
      'deposit': 'Nộp tiền',
      'withdrawal': 'Rút tiền',
      'income': 'Thu nhập',
      'expense': 'Chi phí',
      'penalty': 'Phạt',
      'interest': 'Lãi',
      'fee': 'Phí',
      'refund': 'Hoàn tiền',
      'initial_loan': 'Khoản vay ban đầu',
      'update_contract': 'Cập nhật HĐ',
      'contract_delete': 'Xóa HĐ',
      'contract_extension': 'Gia hạn HĐ',
      'contract_rotate': 'Đảo HĐ',
      
      // Income transaction types (Thu)
      'thu_khac': 'Thu khác',
      'thu_tra_quy': 'Thu trả quỹ',
      'thu_tien_no': 'Thu tiền nợ',
      'thu_tien_ung': 'Thu tiền ứng',
      'thu_tien_phat': 'Thu tiền phạt',
      'hoa_hong_thu': 'Hoa hồng thu',
      'thu_ve': 'Thu vé',
      
      // Expense transaction types (Chi)
      'tra_luong': 'Trả lương',
      'tra_lai_phi': 'Trả lãi phí',
      'chi_tieu_dung': 'Chi tiêu dùng',
      'chi_tra_quy': 'Chi trả quỹ',
      'tam_ung': 'Tạm ứng',
      'hoa_hong_chi': 'Hoa hồng chi',
      'chi_ve': 'Chi vé',
      'chi_van_phong': 'Chi văn phòng',
      'chi_khac': 'Chi khác'
    };
    
    return translations[transactionType] || transactionType;
  };
  
  // Use the same fetchAllData function as total-fund page
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
  
  const fetchTransactions = async () => {
    if (!storeId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const allHistoryItems: FundHistoryItem[] = [];
      
      // Updated processItems function to handle both original and cancelled payments
      const processItems = (data: GenericHistoryItem[], source: string) => {
        if (data && data.length > 0) {
          data.forEach((item) => {
            if (!item.created_at) return;

            // Helper function to get common data
            const getCommonData = () => {
              // Get employee name based on source
              let employeeName = '';
              if (source === 'Thu chi') {
                employeeName = item.employee_name || '';
              } else if (source === 'Cầm đồ' || source === 'Tín chấp' || source === 'Trả góp') {
                employeeName = item.profiles?.username || '';
              }

              // Get customer name based on source
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

              // Get item name (only for pawn transactions)
              let itemName = '';
              if (source === 'Cầm đồ') {
                try {
                  if (item.pawns?.collateral_detail) {
                    const detail = typeof item.pawns.collateral_detail === 'string' 
                      ? JSON.parse(item.pawns.collateral_detail) 
                      : item.pawns.collateral_detail;
                    itemName = detail.name || '';
                  }
                } catch (e) {
                  console.error('Error parsing collateral_detail:', e);
                }
              }

              return { employeeName, customerName, itemName };
            };

            // For contract payment transactions (Cầm đồ, Tín chấp, Trả góp), handle original and cancelled separately
            if ((source === 'Cầm đồ' || source === 'Tín chấp' || source === 'Trả góp') && item.transaction_type === 'payment') {
              const { employeeName, customerName, itemName } = getCommonData();
              const amount = (item.credit_amount || 0) - (item.debit_amount || 0);

              // Always add original payment record (positive amount)
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
                itemName
              });

              // If payment is cancelled (is_deleted = true), add separate cancel record
              if (item.is_deleted && item.updated_at) {
                allHistoryItems.push({
                  id: `${source.toLowerCase()}-${item.id}-cancel`,
                  date: item.updated_at,
                  description: translateTransactionType(item.transaction_type, true),
                  transactionType: item.transaction_type,
                  source,
                  income: amount < 0 ? -amount : 0, // Reverse the amounts for cancel record
                  expense: amount > 0 ? amount : 0,
                  contractCode: item.contract_code || '-',
                  employeeName,
                  customerName,
                  itemName
                });
              }
            } else {
              // For non-payment transactions or non-contract sources, use original logic
              let amount = 0;
              if(source === 'Nguồn vốn'){
                amount = item.transaction_type === 'withdrawal' ? -Number(item.fund_amount || 0) : Number(item.fund_amount || 0);
              } else if(source === 'Thu chi'){
                amount = (item.credit_amount || 0) - (item.debit_amount || 0);
                if(amount === 0){
                  amount = item.transaction_type === 'expense' ? -Number(item.amount || 0) : Number(item.amount || 0);
                }
              } else {
                // For contract transactions that are not payments, use simple credit_amount - debit_amount
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
                itemName
              });
            }
          });
        }
      };

      // Updated data fetching logic to get all records for payment tracking
      
      // Credit history with profiles join and customer data - get all records to track cancellations
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
        const processedCreditData = creditHistoryData.map(item => ({
          ...item,
          contract_code: item.credits?.contract_code || null
        }));
        processItems(processedCreditData, 'Tín chấp');
      }

      // Pawn history with profiles join and collateral_detail - get all records to track cancellations
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
        const processedPawnData = pawnHistoryData.map(item => ({
          ...item,
          contract_code: item.pawns?.contract_code || null
        }));
        processItems(processedPawnData, 'Cầm đồ');
      }

      // Installment history with profiles join and customer data - get all records to track cancellations
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
      );
      
      if (installmentHistoryData) {
        const processedInstallmentData = installmentHistoryData.map(item => ({
          ...item,
          contract_code: item.installments?.contract_code || null
        }));
        processItems(processedInstallmentData, 'Trả góp');
      }
      
      // Fund history (use name field for customerName)
      const { data: storeFundData } = await supabase
        .from('store_fund_history')
        .select('*')
        .eq('store_id', storeId)
        .limit(10000);
      
      if (storeFundData) processItems(storeFundData, 'Nguồn vốn');
      
      // Transactions - Remove is_deleted filter and apply transform logic
      const allTransactionsData = await fetchAllData(
        supabase
          .from('transactions')
          .select('*, customers:customer_id(name)')
          .eq('store_id', storeId)
      );
      
      // Transform transactions to display format (same as income/outgoing pages)
      const transformTransactionsForDisplay = (rawTransactions: any[]) => {
        const displayTransactions: any[] = [];
        
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
              description: transaction.credit_amount > 0 ? 'Huỷ thu' : 'Huỷ chi',
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
      
      const displayTransactionsData = transformTransactionsForDisplay(allTransactionsData);
      
      if (displayTransactionsData) processItems(displayTransactionsData, 'Thu chi');
      
      // Group and aggregate transactions by contract, date, transaction type, and description
      const groupedData = new Map<string, FundHistoryItem>();

      allHistoryItems.forEach(item => {
        // Create grouping key: contractCode + date (without time) + transactionType + source + description
        // Add description to distinguish between "Đóng lãi" and "Huỷ đóng lãi"
        const transactionDate = new Date(item.date).toDateString();
        const groupKey = `${item.contractCode}-${transactionDate}-${item.transactionType}-${item.source}-${item.description}`;
        
        if (groupedData.has(groupKey)) {
          const existingItem = groupedData.get(groupKey)!;
          
          // Aggregate amounts
          existingItem.income += item.income;
          existingItem.expense += item.expense;
          
          // Use the latest transaction time
          if (new Date(item.date) > new Date(existingItem.date)) {
            existingItem.date = item.date;
          }
        } else {
          // Create new grouped item
          groupedData.set(groupKey, { ...item });
        }
      });

      // Convert map back to array and sort by date (newest first)
      const aggregatedTransactions = Array.from(groupedData.values());
      aggregatedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // Filter by date range
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      let filteredTransactions = aggregatedTransactions.filter(item => {
        const itemDate = new Date(item.date);
        // Ẩn các giao dịch 'Đóng HĐ', 'Đảo HĐ' của loại hình 'Trả góp'
        if (item.source === 'Trả góp' && (item.description === 'Đóng HĐ' || item.description === 'Đảo HĐ')) {
          return false;
        }
        return itemDate >= start && itemDate <= end;
      });

      // Apply transaction type filter
      if (selectedTransactionType !== 'all') {
        filteredTransactions = filteredTransactions.filter(item => 
          item.source === selectedTransactionType
        );
      }

      // Apply employee filter
      if (selectedEmployee !== 'all') {
        filteredTransactions = filteredTransactions.filter(item => 
          item.employeeName === selectedEmployee
        );
      }
      
      setTransactions(filteredTransactions);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchTransactions();
  }, [storeId, startDate, endDate, selectedTransactionType, selectedEmployee]);
  
  // Calculate totals by source (same as total-fund page)
  const totalsBySource: {[key: string]: {income: number, expense: number}} = {
    'Tín chấp': { income: 0, expense: 0 },
    'Cầm đồ': { income: 0, expense: 0 },
    'Trả góp': { income: 0, expense: 0 },
    'Nguồn vốn': { income: 0, expense: 0 },
    'Thu chi': { income: 0, expense: 0 },
  };
  
  transactions.forEach(item => {
    if (item.source in totalsBySource) {
      totalsBySource[item.source].income += item.income;
      totalsBySource[item.source].expense += item.expense;
    }
  });
  
  const totalIncome = transactions.reduce((sum, item) => sum + item.income, 0);
  const totalExpense = transactions.reduce((sum, item) => sum + item.expense, 0);
  
  return (
    <Card className="mt-4">
      <CardHeader className="py-3">
        <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">Chi tiết giao dịch</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Mobile-friendly summary totals */}
        <div className="lg:hidden mb-4 grid grid-cols-2 gap-2">
          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
            <div className="text-xs text-green-700 font-medium mb-1">TỔNG THU</div>
            <div className="text-lg font-bold text-green-600">{totalIncome.toLocaleString()}</div>
          </div>
          <div className="bg-red-50 p-3 rounded-lg border border-red-200">
            <div className="text-xs text-red-700 font-medium mb-1">TỔNG CHI</div>
            <div className="text-lg font-bold text-red-600">{totalExpense.toLocaleString()}</div>
          </div>
        </div>
        
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
          <>
          {/* Desktop: Use normal table with sticky columns */}
          <div className="hidden lg:block rounded-md border border-gray-200 overflow-x-auto relative">
            <Table className="border-collapse min-w-full">
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-12">#</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 min-w-[100px]">Loại Hình</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 min-w-[120px]">Mã HĐ</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 min-w-[130px]">Người Giao Dịch</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 min-w-[130px]">Khách Hàng</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 min-w-[120px]">Tên Hàng</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 min-w-[100px]">Ngày</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 min-w-[120px]">Diễn Giải</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-24 text-green-600 sticky right-24 bg-gray-50 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">Thu</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200 w-24 text-red-600 sticky right-0 bg-gray-50 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">Chi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((item, index) => (
                  <TableRow key={item.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {index + 1}
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                      <div className="text-sm font-medium">{item.source}</div>
                      {/* Show contract code on mobile */}
                      <div className="text-xs text-gray-500 lg:hidden">
                        {item.contractCode && item.contractCode !== '-' ? (
                          <Link
                            href={
                              item.source === 'Tín chấp'
                                ? `/credits/${item.contractCode}`
                                : item.source === 'Cầm đồ'
                                  ? `/pawns/${item.contractCode}`
                                  : item.source === 'Trả góp'
                                    ? `/installments/${item.contractCode}`
                                    : '#'
                            }
                            className={
                              (item.source === 'Tín chấp' || item.source === 'Cầm đồ' || item.source === 'Trả góp')
                                ? "text-blue-600 hover:underline"
                                : ""
                            }
                          >
                            {item.contractCode}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200 hidden lg:table-cell">
                      {item.contractCode && item.contractCode !== '-' ? (
                        <Link
                          href={
                            item.source === 'Tín chấp'
                              ? `/credits/${item.contractCode}`
                              : item.source === 'Cầm đồ'
                                ? `/pawns/${item.contractCode}`
                                : item.source === 'Trả góp'
                                  ? `/installments/${item.contractCode}`
                                  : '#'
                          }
                          className={
                            (item.source === 'Tín chấp' || item.source === 'Cầm đồ' || item.source === 'Trả góp')
                              ? "text-blue-600 hover:underline"
                              : ""
                          }
                        >
                          {item.contractCode}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200 hidden md:table-cell">
                      <div className="text-sm">{item.employeeName || '-'}</div>
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200 hidden sm:table-cell">
                      <div className="text-sm">{item.customerName || '-'}</div>
                      {/* Show employee name on mobile */}
                      <div className="text-xs text-gray-500 md:hidden">
                        {item.employeeName || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200 hidden xl:table-cell">
                      {item.itemName || '-'}
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                      <div className="text-sm">{new Date(item.date).toLocaleDateString('vi-VN')}</div>
                      {/* Show customer name on mobile */}
                      <div className="text-xs text-gray-500 sm:hidden">
                        {item.customerName || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                      <div className="text-sm">{item.description}</div>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-r border-b border-gray-200 sticky right-24 bg-white z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">
                      {item.income > 0 ? (
                        <span className="text-green-600 font-medium text-sm">{item.income.toLocaleString()}</span>
                      ) : (
                        ""
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-b border-gray-200 sticky right-0 bg-white z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">
                      {item.expense > 0 ? (
                        <span className="text-red-600 font-medium text-sm">{item.expense.toLocaleString()}</span>
                      ) : (
                        ""
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                {Object.entries(totalsBySource).map(([source, values]) => (
                  <TableRow key={source}>
                    <TableCell colSpan={8} className="py-2 px-3 text-right font-semibold border-r border-t border-gray-200">
                      {`Tổng ${source}`}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-semibold border-r border-t border-gray-200 sticky right-24 bg-gray-50 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">
                      <span className="text-green-600">{values.income.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-semibold border-t border-gray-200 sticky right-0 bg-gray-50 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">
                      <span className="text-red-600">{values.expense.toLocaleString()}</span>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={8} className="py-3 px-3 text-right font-bold text-lg border-r border-t border-gray-200">
                    TỔNG BIẾN ĐỘNG
                  </TableCell>
                  <TableCell className="py-3 px-3 text-right font-bold text-lg border-r border-t border-gray-200 sticky right-24 bg-gray-50 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">
                    <span className="text-green-600">{totalIncome.toLocaleString()}</span>
                  </TableCell>
                  <TableCell className="py-3 px-3 text-right font-bold text-lg border-t border-gray-200 sticky right-0 bg-gray-50 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">
                    <span className="text-red-600">{totalExpense.toLocaleString()}</span>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          
          <div className="lg:hidden">
            <div className="rounded-md border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="bg-gray-50 grid grid-cols-[1fr_auto_auto] gap-2 p-2 border-b border-gray-200 font-bold text-sm">
                <div className="text-center">Chi tiết</div>
                <div className="text-center text-green-600 w-20">Thu</div>
                <div className="text-center text-red-600 w-20">Chi</div>
              </div>
              
              {/* Transaction rows */}
              <div className="max-h-[70vh] overflow-y-auto">
                {transactions.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-2 p-1.5 border-b border-gray-200 text-sm hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="font-medium text-blue-800">{item.customerName || '-'}</div>
                      <div className="text-gray-600 text-xs">{item.description}</div>
                      <div className="text-xs text-gray-500">
                        {item.contractCode !== '-' && <span>{item.contractCode} • </span>}
                        <span className="text-gray-600">{item.source} • </span>
                        {new Date(item.date).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <div className="text-right w-20">
                      {item.income > 0 && (
                        <span className="text-green-600 font-medium text-xs">
                          {item.income.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-right w-20">
                      {item.expense > 0 && (
                        <span className="text-red-600 font-medium text-xs">
                          {item.expense.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Totals */}
              <div className="bg-gray-50 border-t border-gray-200">
                {Object.entries(totalsBySource).map(([source, values]) => (
                  <div key={source} className="grid grid-cols-[1fr_auto_auto] gap-6 p-2 border-b border-gray-200 font-semibold text-sm">
                    <div className="text-right">Tổng {source}</div>
                    <div className="text-right text-green-600 w-20">{values.income.toLocaleString()}</div>
                    <div className="text-right text-red-600 w-20">{values.expense.toLocaleString()}</div>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_auto_auto] gap-6 p-3 font-bold text-base bg-gray-100">
                  <div className="text-right">TỔNG BIẾN ĐỘNG</div>
                  <div className="text-right text-green-600 w-20">{totalIncome.toLocaleString()}</div>
                  <div className="text-right text-red-600 w-20">{totalExpense.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
} 