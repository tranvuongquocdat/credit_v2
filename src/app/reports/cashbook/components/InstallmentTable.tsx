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
import { InstallmentTransaction } from './types';

interface InstallmentTableProps {
  storeId: string | undefined;
  startDate: string;
  endDate: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN').format(value);
};

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
  };
  
  return translations[transactionType] || transactionType;
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

export default function InstallmentTable({ storeId, startDate, endDate }: InstallmentTableProps) {
  const [transactions, setTransactions] = useState<InstallmentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchInstallmentTransactions = async () => {
    if (!storeId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      const data = await fetchAllData(
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
            installments!inner (
              contract_code,
              employee_id,
              employees!inner (store_id)
            )
          `)
          .eq('installments.employees.store_id', storeId)
          .order('created_at', { ascending: false })
      );
      
      // Process data to handle both original and cancelled payments
      const allTransactions: InstallmentTransaction[] = [];
      
      data.forEach((item: any) => {
        // Filter by date range first
        const itemDate = new Date(item.created_at);
        if (itemDate < start || itemDate > end) {
          // If this is a cancelled payment, check if cancel date is in range
          if (item.transaction_type === 'payment' && item.is_deleted && item.updated_at) {
            const cancelDate = new Date(item.updated_at);
            if (cancelDate < start || cancelDate > end) {
              return; // Skip if neither original nor cancel date is in range
            }
          } else {
            return; // Skip if original date is not in range
          }
        }

        // Always add original transaction record if payment and within date range
        if (item.transaction_type === 'payment') {
          // Only add original record if created_at is in range
          if (itemDate >= start && itemDate <= end) {
            allTransactions.push({
              id: item.id,
              date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
              contractCode: item.installments?.contract_code || 'N/A',
              customerName: 'N/A',
              description: translateTransactionType(item.transaction_type, false),
              loanAmount: item.debit_amount || 0,
              interestAmount: item.credit_amount || 0,
              transactionType: item.transaction_type,
              createdAt: item.created_at
            });
          }

          // If payment is cancelled (is_deleted = true), add separate cancel record
          if (item.is_deleted && item.updated_at) {
            const cancelDate = new Date(item.updated_at);
            if (cancelDate >= start && cancelDate <= end) {
              allTransactions.push({
                id: `${item.id}-cancel`,
                date: format(parseISO(item.updated_at), 'dd/MM/yyyy HH:mm'),
                contractCode: item.installments?.contract_code || 'N/A',
                customerName: 'N/A',
                description: translateTransactionType(item.transaction_type, true),
                loanAmount: 0, // Don't show loan amount for cancellation
                interestAmount: -(item.credit_amount || 0), // Only reverse interest amount in "Thu về" column
                transactionType: item.transaction_type,
                createdAt: item.updated_at
              });
            }
          }
        } else {
          // For non-payment transactions, use original logic and check date range
          if (itemDate >= start && itemDate <= end) {
            allTransactions.push({
              id: item.id,
              date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
              contractCode: item.installments?.contract_code || 'N/A',
              customerName: 'N/A',
              description: translateTransactionType(item.transaction_type || ''),
              loanAmount: item.debit_amount || 0,
              interestAmount: item.credit_amount || 0,
              transactionType: item.transaction_type || '',
              createdAt: item.created_at
            });
          }
        }
      });
      
      // Group and aggregate transactions by contract, date, transaction type, and description
      const groupedData = new Map<string, InstallmentTransaction>();

      allTransactions.forEach(item => {
        // Create grouping key: contractCode + date (without time) + transactionType + description
        // Add description to distinguish between "Đóng lãi" and "Huỷ đóng lãi"
        const transactionDate = new Date(item.createdAt).toDateString();
        const groupKey = `${item.contractCode}-${transactionDate}-${item.transactionType}-${item.description}`;
        
        if (groupedData.has(groupKey)) {
          const existingItem = groupedData.get(groupKey)!;
          
          // Aggregate amounts
          existingItem.loanAmount += item.loanAmount;
          existingItem.interestAmount += item.interestAmount;
          
          // Use the latest transaction time
          if (new Date(item.createdAt) > new Date(existingItem.createdAt)) {
            existingItem.date = item.date;
            existingItem.createdAt = item.createdAt;
          }
        } else {
          // Create new grouped item
          groupedData.set(groupKey, { ...item });
        }
      });

      // Convert map back to array and sort by transaction date (newest first)
      const aggregatedTransactions = Array.from(groupedData.values());
      aggregatedTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setTransactions(aggregatedTransactions);
    } catch (err) {
      console.error('Error fetching installment transactions:', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchInstallmentTransactions();
  }, [storeId, startDate, endDate]);
  
  // Calculate totals
  const totalLoan = transactions.reduce((sum, item) => sum + item.loanAmount, 0);
  const totalInterest = transactions.reduce((sum, item) => sum + item.interestAmount, 0);
  const netAmount = totalInterest - totalLoan;
  
  return (
    <Card className="mt-4">
      <CardHeader className="py-3">
        <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">Trả góp</CardTitle>
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
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Mã HĐ</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Loại GD</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Biến động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((item, index) => {
                  // Calculate net amount for this transaction (same logic as TransactionDetailsTable)
                  const netAmount = item.interestAmount - item.loanAmount;
                  
                  return (
                    <TableRow key={item.id} className="hover:bg-gray-50 transition-colors">
                      <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                        {index + 1}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                        {item.date}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                        {item.contractCode !== 'N/A' ? (
                          <Link href={`/installments/${item.contractCode}`} className="text-blue-600 hover:underline">
                            {item.contractCode}
                          </Link>
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                        {item.description}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right border-b border-gray-200">
                        {netAmount > 0 ? (
                          <span className="text-green-600">+{formatCurrency(netAmount)}</span>
                        ) : netAmount < 0 ? (
                          <span className="text-red-600">{formatCurrency(netAmount)}</span>
                        ) : (
                          "0"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter className="bg-gray-50">
                <TableRow>
                  <TableCell colSpan={4} className="py-2 px-3 text-right font-bold border-r border-t border-gray-200">
                    Tổng giao dịch trả góp
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold border-t border-gray-200">
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