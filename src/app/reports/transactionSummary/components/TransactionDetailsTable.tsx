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

interface TransactionDetailsTableProps {
  transactions: FundHistoryItem[];
  isLoading: boolean;
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

export default function TransactionDetailsTable({
  transactions,
  isLoading
}: TransactionDetailsTableProps) {

  // Function to translate transaction_type to Vietnamese
  const translateTransactionType = (transactionType: string, isDeleted: boolean = false): string => {
    const translations: { [key: string]: string } = {
      // Contract transaction types
      'payment': isDeleted ? 'Huỷ đóng lãi' : 'Đóng lãi',
      'loan': 'Cho vay',
      'additional_loan': 'Vay thêm',
      'principal_repayment': 'Trả gốc',
      'contract_close': 'Đóng HĐ',
      'contract_close_adjustment': 'Điều chỉnh khi đóng HĐ',
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