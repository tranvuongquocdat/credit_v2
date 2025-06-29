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
  const translateTransactionType = (transactionType: string): string => {
    const translations: { [key: string]: string } = {
      // Contract transaction types
      'payment': 'Đóng lãi',
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
      
      // Simplified processItems function - only use credit_amount and debit_amount with is_deleted = false
      const processItems = (data: GenericHistoryItem[], source: string) => {
        if (data && data.length > 0) {
          data.forEach((item) => {
            if (!item.created_at) return;

            // Calculate net amount from credit_amount and debit_amount
            let amount = 0;
            if(source === 'Nguồn vốn'){
              amount = item.transaction_type === 'withdrawal' ? -Number(item.fund_amount || 0) : Number(item.fund_amount || 0);
            } else if(source === 'Thu chi'){
              amount = (item.credit_amount || 0) - (item.debit_amount || 0);
              if(amount === 0){
                amount = item.transaction_type === 'expense' ? -Number(item.amount || 0) : Number(item.amount || 0);
              }
            }
            else {
              // For contract transactions, use simple credit_amount - debit_amount
              amount = (item.credit_amount || 0) - (item.debit_amount || 0);
            }

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
          });
        }
      };

      // Use simplified data fetching logic with only is_deleted = false condition
      
      // Credit history with profiles join and customer data
      const creditHistoryData = await fetchAllData(
        supabase
          .from('credit_history')
          .select(`
            *,
            credits!inner (
              contract_code, 
              store_id,
              customers (name)
            ),
            profiles:created_by (username)
          `)
          .eq('credits.store_id', storeId)
          .eq('is_deleted', false)
      );
      
      if (creditHistoryData) {
        const processedCreditData = creditHistoryData.map(item => ({
          ...item,
          contract_code: item.credits?.contract_code || null
        }));
        processItems(processedCreditData, 'Tín chấp');
      }

      // Pawn history with profiles join and collateral_detail
      const pawnHistoryData = await fetchAllData(
        supabase
          .from('pawn_history')
          .select(`
            *,
            pawns!inner (
              contract_code, 
              store_id,
              customers (name),
              collateral_detail
            ),
            profiles:created_by (username)
          `)
          .eq('pawns.store_id', storeId)
          .eq('is_deleted', false)
      );
      
      if (pawnHistoryData) {
        const processedPawnData = pawnHistoryData.map(item => ({
          ...item,
          contract_code: item.pawns?.contract_code || null
        }));
        processItems(processedPawnData, 'Cầm đồ');
      }

      // Installment history with profiles join and customer data
      const installmentHistoryData = await fetchAllData(
        supabase
          .from('installment_history')
          .select(`
            *,
            installments!inner (
              contract_code,
              employee_id,
              employees!inner (store_id),
              customers (name)
            ),
            profiles:created_by (username)
          `)
          .eq('installments.employees.store_id', storeId)
          .eq('is_deleted', false)
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
      
      // Transactions (join customers:customer_id(name))
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*, customers:customer_id(name)')
        .eq('store_id', storeId)
        .eq('is_deleted', false)
        .limit(10000);
      
      if (transactionsData) processItems(transactionsData, 'Thu chi');
      
      // Group and aggregate transactions by contract, date, and transaction type
      const groupedData = new Map<string, FundHistoryItem>();

      allHistoryItems.forEach(item => {
        // Create grouping key: contractCode + date (without time) + transactionType + source
        const transactionDate = new Date(item.date).toDateString();
        const groupKey = `${item.contractCode}-${transactionDate}-${item.transactionType}-${item.source}`;
        
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
          <div className="rounded-md border border-gray-200 overflow-auto">
            <Table className="border-collapse">
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-12">#</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Loại Hình</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Mã HĐ</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Người Giao Dịch</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Khách Hàng</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tên Hàng</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Ngày</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Diễn Giải</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Thu</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Chi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((item, index) => (
                  <TableRow key={item.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {index + 1}
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                      {item.source}
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200">
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
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                      {item.employeeName || '-'}
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                      {item.customerName || '-'}
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                      {item.itemName || '-'}
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                      {new Date(item.date).toLocaleDateString('vi-VN')}
                    </TableCell>
                    <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                      {item.description}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-r border-b border-gray-200">
                      {item.income > 0 ? (
                        <span className="text-green-600 font-medium">{item.income.toLocaleString()} VND</span>
                      ) : (
                        ""
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-b border-gray-200">
                      {item.expense > 0 ? (
                        <span className="text-red-600 font-medium">{item.expense.toLocaleString()} VND</span>
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
                    <TableCell className="py-2 px-3 text-right font-semibold border-r border-t border-gray-200">
                      <span className="text-green-600">{values.income.toLocaleString()} VND</span>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-semibold border-t border-gray-200">
                      <span className="text-red-600">{values.expense.toLocaleString()} VND</span>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={8} className="py-2 px-3 text-right font-bold text-lg border-r border-t border-gray-200">
                    TỔNG BIẾN ĐỘNG
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold text-lg border-r border-t border-gray-200">
                    <span className="text-green-600">{totalIncome.toLocaleString()} VND</span>
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold text-lg border-t border-gray-200">
                    <span className="text-red-600">{totalExpense.toLocaleString()} VND</span>
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