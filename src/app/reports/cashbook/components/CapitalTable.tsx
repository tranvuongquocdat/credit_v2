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
import { CapitalTransaction } from './types';

interface CapitalTableProps {
  transactions: CapitalTransaction[];
  isLoading: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN').format(value);
};

// Function to translate transaction_type to Vietnamese
const translateTransactionType = (transactionType: string): string => {
  const translations: Record<string, string> = {
    'deposit': 'Nạp vốn',
    'withdrawal': 'Rút vốn',
    'initial_capital': 'Vốn ban đầu',
    'additional_capital': 'Thêm vốn',
    'return_capital': 'Trả vốn',
    'transfer_in': 'Chuyển vào',
    'transfer_out': 'Chuyển ra',
    'adjustment': 'Điều chỉnh',
    'profit_distribution': 'Phân chia lợi nhuận',
    'loss_coverage': 'Bù lỗ',
    'investment': 'Đầu tư',
    'dividend': 'Cổ tức',
    'other': 'Khác',
  };
  return translations[transactionType] || transactionType;
};

export default function CapitalTable({ transactions, isLoading }: CapitalTableProps) {
  // Calculate totals from the passed transactions
  const totalPositive = transactions.reduce((sum, item) => 
    sum + (item.amount > 0 ? item.amount : 0), 0);
  const totalNegative = transactions.reduce((sum, item) => 
    sum + (item.amount < 0 ? -item.amount : 0), 0);
  const netAmount = totalPositive - totalNegative;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base font-bold bg-teal-500 text-white p-2 rounded">
            Giao dịch nguồn vốn
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
        <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">Nguồn vốn</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Đang tải dữ liệu...</span>
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
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Mô tả</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Số tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((item, index) => (
                  <TableRow key={item.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {index + 1}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {item.date}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {item.description}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-b border-gray-200">
                      {item.amount !== 0 && (
                        <span className={item.amount > 0 ? "text-green-600" : "text-red-600"}>
                          {item.amount > 0 ? "+" : ""}{formatCurrency(item.amount)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-gray-50">
                <TableRow>
                  <TableCell colSpan={3} className="py-2 px-3 text-right font-bold border-r border-t border-gray-200">
                    Tổng nguồn vốn
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