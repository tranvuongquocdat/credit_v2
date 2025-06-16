'use client';

import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { supabase } from '@/lib/supabase';
import { RefreshCw } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import {
  FinancialSummary,
  getPawnFinancialsForStore,
  getCreditFinancialsForStore,
  getInstallmentFinancialsForStore
} from '@/lib/overview';

// Shadcn UI components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StoreData {
  id: string;
  name: string;
  cash_fund: number;
  investment: number;
}

interface StoreSummary {
  pawn: FinancialSummary;
  credit: FinancialSummary;
  installment: FinancialSummary;
}

export default function OverviewPage() {
  const { currentStore } = useStore();
  const [stores, setStores] = useState<StoreData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeSummaries, setStoreSummaries] = useState<Record<string, StoreSummary>>({});
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();
  
  const canAccessOverview = hasPermission('tong_quat_chuoi_cua_hang');
  
  // Redirect if user doesn't have permission
  useEffect(() => {
    if (!permissionsLoading && !canAccessOverview) {
      router.push('/');
    }
  }, [permissionsLoading, canAccessOverview, router]);

  // Format currency
  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  // Fetch all data for all stores
  const fetchAllData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('id, name, cash_fund, investment')
        .order('name', { ascending: true });
      
      if (storesError) {
        throw new Error(storesError.message);
      }
      
      setStores(storesData || []);

      const summaries: Record<string, StoreSummary> = {};
      
      await Promise.all(storesData.map(async (store) => {
        const [pawn, credit, installment] = await Promise.all([
          getPawnFinancialsForStore(store.id),
          getCreditFinancialsForStore(store.id),
          getInstallmentFinancialsForStore(store.id)
        ]);
        summaries[store.id] = { pawn, credit, installment };
      }));
      
      setStoreSummaries(summaries);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on mount and when store changes
  useEffect(() => {
    if (canAccessOverview) {
      fetchAllData();
      
      const intervalId = setInterval(() => {
        fetchAllData();
      }, 30000);
      
      return () => clearInterval(intervalId);
    }
  }, [canAccessOverview]);

  // Calculate totals
  const calculateTotals = () => {
    let totalCashFund = 0;
    let totalInvestment = 0;
    let totalPawnLoan = 0;
    let totalCreditLoan = 0;
    let totalInstallmentLoan = 0;
    let totalExpectedProfit = 0;
    let totalCollectedProfit = 0;

    stores.forEach(store => {
      totalCashFund += store.cash_fund || 0;
      totalInvestment += store.investment || 0;
      
      const summary = storeSummaries[store.id];
      if (summary) {
        totalPawnLoan += summary.pawn.totalLoan;
        totalCreditLoan += summary.credit.totalLoan;
        totalInstallmentLoan += summary.installment.totalLoan;
        totalExpectedProfit += summary.pawn.profit + summary.credit.profit + summary.installment.profit;
        totalCollectedProfit += summary.pawn.collectedInterest + summary.credit.collectedInterest + summary.installment.collectedInterest;
      }
    });

    return {
      totalCashFund,
      totalInvestment,
      totalPawnLoan,
      totalCreditLoan,
      totalInstallmentLoan,
      totalExpectedProfit,
      totalCollectedProfit
    };
  };

  const totals = calculateTotals();

  return (
    <Layout>
      {permissionsLoading ? (
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-4">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Tổng quát các cửa hàng</h1>
            </div>
          </div>
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Đang kiểm tra quyền truy cập...</span>
          </div>
        </div>
      ) : !canAccessOverview ? (
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-4">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Tổng quát các cửa hàng</h1>
            </div>
          </div>
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Bạn không có quyền truy cập chức năng này</p>
          </div>
        </div>
      ) : (
        <div className="max-w-full">
          {/* Title */}
          <div className="flex items-center justify-between border-b pb-2 mb-4">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Tổng quát các cửa hàng</h1>
            </div>
          </div>
          
          {/* Error message */}
          {error && (
            <div className="text-red-700 py-2" role="alert">
              <p>{error}</p>
            </div>
          )}
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center justify-center p-4">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Đang tải dữ liệu...</span>
            </div>
          )}
          
          {/* Table */}
          <div className="rounded-md border mt-4 mb-1 border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50 border-b">
                  <TableRow>
                    <TableHead rowSpan={2} className="py-2 px-3 text-left font-bold border-b border-r border-gray-200">Tên cửa hàng</TableHead>
                    <TableHead rowSpan={2} className="py-2 px-3 text-left font-bold border-b border-r border-gray-200">Quỹ tiền mặt</TableHead>
                    <TableHead rowSpan={2} className="py-2 px-3 text-left font-bold border-b border-r border-gray-200">Vốn đầu tư</TableHead>
                    <TableHead colSpan={3} className="py-2 px-3 text-center font-bold border-b border-r border-gray-200">Tiền cho vay</TableHead>
                    <TableHead rowSpan={2} className="py-2 px-3 text-left font-bold border-b border-r border-gray-200">Lãi phí dự kiến</TableHead>
                    <TableHead rowSpan={2} className="py-2 px-3 text-left font-bold border-b border-gray-200">Lãi phí đã thu</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="py-2 px-3 text-left font-bold border-b border-r border-gray-200">Cầm Đồ</TableHead>
                    <TableHead className="py-2 px-3 text-left font-bold border-b border-r border-gray-200">Tín chấp</TableHead>
                    <TableHead className="py-2 px-3 text-left font-bold border-b border-r border-gray-200">Trả góp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store) => {
                    const summary = storeSummaries[store.id];
                    return (
                      <TableRow key={store.id} className="hover:bg-gray-50 transition-colors">
                        <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                          {store.name}
                        </TableCell>
                        <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                          {formatCurrency(store.cash_fund)}
                        </TableCell>
                        <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                          {formatCurrency(store.investment)}
                        </TableCell>
                        <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                          {summary ? formatCurrency(summary.pawn.totalLoan) : '...'}
                        </TableCell>
                        <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                          {summary ? formatCurrency(summary.credit.totalLoan) : '...'}
                        </TableCell>
                        <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                          {summary ? formatCurrency(summary.installment.totalLoan) : '...'}
                        </TableCell>
                        <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                          {summary ? 
                            formatCurrency(summary.pawn.profit + summary.credit.profit + summary.installment.profit) : '...'}
                        </TableCell>
                        <TableCell className="py-3 px-3 border-b border-gray-200">
                          {summary ? 
                            formatCurrency(summary.pawn.collectedInterest + summary.credit.collectedInterest + summary.installment.collectedInterest) : '...'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  
                  {/* Totals row */}
                  <TableRow className="bg-yellow-50">
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-bold text-red-600">
                      Tổng
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                      {formatCurrency(totals.totalCashFund)}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                      {formatCurrency(totals.totalInvestment)}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                      {formatCurrency(totals.totalPawnLoan)}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                      {formatCurrency(totals.totalCreditLoan)}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                      {formatCurrency(totals.totalInstallmentLoan)}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200 font-medium">
                      {formatCurrency(totals.totalExpectedProfit)}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-gray-200 font-medium">
                      {formatCurrency(totals.totalCollectedProfit)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
