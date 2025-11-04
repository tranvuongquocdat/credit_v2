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
import { InstallmentTransaction } from './types';

interface InstallmentTableProps {
  transactions: InstallmentTransaction[];
  isLoading: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN').format(value);
};

// Function to translate transaction_type to Vietnamese
const translateTransactionType = (transactionType: string): string => {
  const translations: Record<string, string> = {
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

export default function InstallmentTable({ transactions, isLoading }: InstallmentTableProps) {
  // Calculate totals from the passed transactions
  const totals = transactions.reduce(
    (acc, item) => {
      return {
        totalLoanAmount: acc.totalLoanAmount + (item.loanAmount || 0),
        totalInterestAmount: acc.totalInterestAmount + (item.interestAmount || 0),
      };
    },
    { totalLoanAmount: 0, totalInterestAmount: 0 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base font-bold bg-orange-500 text-white p-2 rounded">
            Giao dịch trả góp
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
        <CardTitle className="text-base font-bold bg-orange-500 text-white p-2 rounded">
          Giao dịch trả góp
        </CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Không có giao dịch trả góp trong khoảng thời gian đã chọn
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
                    Mã HĐ
                  </TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">
                    Diễn giải
                  </TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">
                    Giải ngân
                  </TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">
                    Thu lãi
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
                      {item.contractCode === 'N/A' ? (
                        <span className="text-gray-500">{item.contractCode}</span>
                      ) : (
                        <Link
                          href={`/installments/${item.contractCode}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {item.contractCode}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-r border-gray-200">
                      {item.description}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-r border-gray-200">
                      <span className="text-red-600">
                        {formatCurrency(item.loanAmount)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-r border-gray-200">
                      <span className="text-green-600">
                        {formatCurrency(item.interestAmount)}
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
                    colSpan={3}
                    className="py-2 px-3 text-center font-bold border-r border-gray-200"
                  >
                    Tổng cộng
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold border-r border-gray-200">
                    <span className="text-red-600">
                      {formatCurrency(totals.totalLoanAmount)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold border-r border-gray-200">
                    <span className="text-green-600">
                      {formatCurrency(totals.totalInterestAmount)}
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