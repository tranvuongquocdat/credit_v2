import { format, parseISO } from 'date-fns';
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
import { CreditTransaction } from './types';

interface CreditTableProps {
  transactions: CreditTransaction[];
  isLoading: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN').format(value);
};

// Function to translate transaction_type to Vietnamese
const translateTransactionType = (transactionType: string): string => {
  const translations: Record<string, string> = {
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
    'asset_sale': 'Bán tài sản',
    'asset_redeem': 'Đ chuộc tài sản',
    'interest_payment': 'Trả lãi',
    'partial_payment': 'Trả một phần',
    'full_payment': 'Trả toàn bộ',
    'late_payment': 'Trả muộn',
    'early_payment': 'Trả sớm',
  };
  return translations[transactionType] || transactionType;
};

export default function CreditTable({ transactions, isLoading }: CreditTableProps) {
  // Calculate totals from the passed transactions
  const allTransactions: CreditTransaction[] = [];
  transactions.forEach((item: CreditTransaction) => {
    if (item.transactionType === 'payment' && item.isDeleted && item.updatedAt) {
      allTransactions.push({
        id: `${item.id}-cancel`,
        date: format(parseISO(item.updatedAt), 'dd/MM/yyyy HH:mm'),
        contractCode: item.contractCode,
        customerName: 'N/A',
        description: 'Huỷ đóng lãi',
        loanAmount: 0, // Don't show loan amount for cancellation
        interestAmount: -(item.interestAmount || 0), // Only reverse interest amount in "Thu về" column
        transactionType: item.transactionType,
        createdAt: item.updatedAt,
        isDeleted: item.isDeleted,
        updatedAt: item.updatedAt
      });
    } else {
      allTransactions.push({
        id: item.id,
        date: format(parseISO(item.createdAt), 'dd/MM/yyyy HH:mm'),
        contractCode: item.contractCode,
        customerName: 'N/A',
        description: translateTransactionType(item.transactionType || ''),
        loanAmount: item.loanAmount || 0,
        interestAmount: item.interestAmount || 0,
        transactionType: item.transactionType || '',
        createdAt: item.createdAt,
        isDeleted: item.isDeleted,
        updatedAt: item.updatedAt
      });
    }
  });

  // Group and aggregate transactions by contract, date, transaction type, and description
  const groupedData = new Map<string, CreditTransaction>();

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
  // Calculate totals
  const totalLoan = aggregatedTransactions.reduce((sum, item) => sum + item.loanAmount, 0);
  const totalInterest = aggregatedTransactions.reduce((sum, item) => sum + item.interestAmount, 0);
  const netAmount = totalInterest - totalLoan;
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base font-bold bg-green-500 text-white p-2 rounded">
            Giao dịch tín chấp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Đang tải dữ liệu...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="py-3">
        <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">Tín chấp</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Đang tải dữ liệu...</span>
          </div>
        ) : aggregatedTransactions.length === 0 ? (
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
                {aggregatedTransactions.map((item, index) => {
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
                          <Link href={`/credits/${item.contractCode}`} className="text-blue-600 hover:underline">
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
                    Tổng giao dịch tín chấp
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