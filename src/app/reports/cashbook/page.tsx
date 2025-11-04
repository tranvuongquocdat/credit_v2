'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { useCashbookSummary } from '@/hooks/useCashbook';

// Shadcn UI components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePickerWithControls } from '@/components/ui/date-picker-with-controls';

// Custom components for different tables
import PawnTable from './components/PawnTable';
import CreditTable from './components/CreditTable';
import InstallmentTable from './components/InstallmentTable';
import TransactionTable from './components/TransactionTable';
import CapitalTable from './components/CapitalTable';
import ExcelExporter from './components/ExcelExporter';

// Import type definitions
import { 
  CashbookSummary,
  PawnTransaction,
  CreditTransaction,
  InstallmentTransaction,
  Transaction,
  CapitalTransaction
} from './components/types';

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

export default function CashbookPage() {
  const { currentStore } = useStore();

  // Use permissions hook
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();

  // Check access permission
  const canAccessReport = hasPermission('so_quy_tien_mat');

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

  // Use React Query hook for cached cashbook data
  const {
    openingBalance,
    closingBalance,
    transactions,
    isLoading,
    error,
    refetch
  } = useCashbookSummary(
    currentStore?.id || '',
    startDate,
    endDate
  );

  // Create summary object from cached data
  const summary: CashbookSummary = {
    openingBalance,
    pawnActivity: transactions.summary.pawn,
    creditActivity: transactions.summary.credit,
    installmentActivity: transactions.summary.installment,
    incomeExpense: transactions.summary.incomeExpense,
    capital: transactions.summary.capital,
    closingBalance
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
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
            <h1 className="text-lg font-bold">Sổ quỹ tiền mặt</h1>
          </div>
          <ExcelExporter
            summaryData={summary}
            pawnData={transactions.pawn}
            creditData={transactions.credit}
            installmentData={transactions.installment}
            transactionData={transactions.incomeExpense}
            capitalData={transactions.capital}
            startDate={startDate}
            endDate={endDate}
            storeName={currentStore?.name || 'Unknown'}
          />
        </div>
        
        {/* Date range selector */}
        <Card className="mb-4">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Khoảng thời gian</CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center">
                    <span className="mr-2 text-sm font-medium">Từ ngày</span>
                    <DatePickerWithControls
                      value={startDate} 
                      onChange={handleStartDateChange}
                      placeholder="Chọn ngày bắt đầu"
                      className="w-40"
                    />
                  </div>
                  <div className="flex items-center">
                    <span className="mx-2 text-sm font-medium">Đến ngày</span>
                    <DatePickerWithControls
                      value={endDate} 
                      onChange={handleEndDateChange}
                      placeholder="Chọn ngày kết thúc"
                      className="w-40"
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
        
        {/* Error message */}
        {error && (
          <div className="text-red-700 py-2" role="alert">
            <p>{error instanceof Error ? error.message : 'Đã xảy ra lỗi khi tải dữ liệu'}</p>
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
            <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">Bảng Tổng Kết</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-gray-200 overflow-hidden">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Quỹ tiền mặt đầu kỳ</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Cầm đồ</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tín chấp</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Trả góp</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Thu chi</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Vốn</TableHead>
                    <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Quỹ tiền mặt cuối kỳ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className="text-blue-600 font-medium">{formatCurrency(summary.openingBalance)}</span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className={summary.pawnActivity > 0 ? "text-green-600" : summary.pawnActivity < 0 ? "text-red-600" : ""}>
                        {formatCurrency(summary.pawnActivity)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className={summary.creditActivity > 0 ? "text-green-600" : summary.creditActivity < 0 ? "text-red-600" : ""}>
                        {formatCurrency(summary.creditActivity)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className={summary.installmentActivity > 0 ? "text-green-600" : summary.installmentActivity < 0 ? "text-red-600" : ""}>
                        {formatCurrency(summary.installmentActivity)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className={summary.incomeExpense > 0 ? "text-green-600" : summary.incomeExpense < 0 ? "text-red-600" : ""}>
                        {formatCurrency(summary.incomeExpense)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center border-r border-gray-200">
                      <span className={summary.capital > 0 ? "text-green-600" : summary.capital < 0 ? "text-red-600" : ""}>
                        {formatCurrency(summary.capital)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center">
                      <span className="text-blue-600 font-medium">{formatCurrency(summary.closingBalance)}</span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        
        {/* Individual Transaction Tables */}
        <PawnTable
          transactions={transactions.pawn}
          isLoading={isLoading}
        />

        <CreditTable
          transactions={transactions.credit}
          isLoading={isLoading}
        />

        <InstallmentTable
          transactions={transactions.installment}
          isLoading={isLoading}
        />

        <TransactionTable
          transactions={transactions.incomeExpense}
          isLoading={isLoading}
        />

        <CapitalTable
          transactions={transactions.capital}
          isLoading={isLoading}
        />
        
      </div>
    </Layout>
  );
}
