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
import { Transaction } from './types';

interface TransactionTableProps {
  transactions: Transaction[];
  isLoading: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN').format(value);
};

// Function to translate transaction_type to Vietnamese
const translateTransactionType = (transactionType: string): string => {
  const translations: Record<string, string> = {
    'income': 'Thu nhập',
    'expense': 'Chi phí',
    'deposit': 'Nộp tiền',
    'withdrawal': 'Rút tiền',
    'loan': 'Cho vay',
    'repayment': 'Trả nợ',
    'transfer': 'Chuyển tiền',
    'adjustment': 'Điều chỉnh',
    'refund': 'Hoàn tiền',
    'penalty': 'Phạt',
    'interest': 'Lãi',
    'fee': 'Phí',
    'other': 'Khác',
  };
  return translations[transactionType] || transactionType;
};

export default function TransactionTable({ transactions, isLoading }: TransactionTableProps) {
  // Calculate totals from the passed transactions
  const totals = transactions.reduce(
    (acc, item) => {
      return {
        totalIncome: acc.totalIncome + item.income,
        totalExpense: acc.totalExpense + item.expense,
      };
    },
    { totalIncome: 0, totalExpense: 0 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">
            Giao dịch thu chi
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
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">
          Giao dịch thu chi
        </CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Không có giao dịch thu chi trong khoảng thời gian đã chọn
          </div>
        ) : (
          <div className="rounded-md border border-gray-200 overflow-hidden">
            <Table className="border-collapse">
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">
                    Thời gian
                  </TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">
                    Diễn giải
                  </TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">
                    Thu
                  </TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">
                    Chi
                  </TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">
                    Loại GD
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((item, index) => (
                  <TableRow key={`${item.id}-${index}`}>
                    <TableCell className="py-2 px-3 text-center border-r border-gray-200">
                      {item.date}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-r border-gray-200">
                      {item.description}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-r border-gray-200">
                      <span className="text-green-600">
                        {formatCurrency(item.income)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-r border-gray-200">
                      <span className="text-red-600">
                        {formatCurrency(item.expense)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-gray-200">
                      <span className="text-xs text-gray-600">
                        {translateTransactionType(item.transactionType)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-gray-100">
                  <TableCell
                    colSpan={2}
                    className="py-2 px-3 text-center font-bold border-r border-gray-200"
                  >
                    Tổng cộng
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold border-r border-gray-200">
                    <span className="text-green-600">
                      {formatCurrency(totals.totalIncome)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold border-r border-gray-200">
                    <span className="text-red-600">
                      {formatCurrency(totals.totalExpense)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 px-3"></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}