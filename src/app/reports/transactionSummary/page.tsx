'use client';

import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { useTransactionSummary } from '@/hooks/useTransactionSummary';

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

  // Use permissions hook
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();

  // Check access permission
  const canAccessReport = hasPermission('tong_ket_giao_dich');

  // Redirect if user doesn't have permission
  React.useEffect(() => {
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

  // Use React Query hook for cached transaction summary data
  const {
    openingBalance,
    closingBalance,
    employees,
    summary,
    transactionDetails,
    isLoading,
    error,
    refetch
  } = useTransactionSummary(
    currentStore?.id || '',
    startDate,
    endDate,
    selectedTransactionType,
    selectedEmployee
  );

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

  // Handle date changes
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
  };

  // Handle refresh
  const handleRefresh = () => {
    refetch();
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
        {/* Title and Export Button */}
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Tổng kết giao dịch</h1>
          </div>
          <ExcelExport
            summaryData={{
              openingBalance,
              totalIncome: summary.pawn.income + summary.credit.income + summary.installment.income + summary.incomeExpense.income + summary.capital.income,
              totalExpense: summary.pawn.expense + summary.credit.expense + summary.installment.expense + summary.incomeExpense.expense + summary.capital.expense,
              closingBalance,
              transactionSummary: {
                'Cầm đồ': { income: summary.pawn.income, expense: summary.pawn.expense },
                'Tín chấp': { income: summary.credit.income, expense: summary.credit.expense },
                'Trả góp': { income: summary.installment.income, expense: summary.installment.expense },
                'Nguồn vốn': { income: summary.capital.income, expense: summary.capital.expense },
                'Thu chi': { income: summary.incomeExpense.income, expense: summary.incomeExpense.expense }
              }
            }}
            transactionDetails={transactionDetails}
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
            <p>{error.message}</p>
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
                      <span className="text-blue-600 font-medium">{openingBalance.toLocaleString()} VND</span>
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
                      <span className="text-blue-600 font-medium">{closingBalance.toLocaleString()} VND</span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Transaction Details Table */}
        <TransactionDetailsTable
          transactions={transactionDetails}
          isLoading={isLoading}
        />
      </div>
    </Layout>
  );
}
