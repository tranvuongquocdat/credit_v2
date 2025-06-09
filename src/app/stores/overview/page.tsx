'use client';

import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { usePawnCalculations } from '@/hooks/usePawnCalculation';
import { useCreditCalculations } from '@/hooks/useCreditCalculation';
import { useInstallmentsSummary } from '@/hooks/useInstallmentsSummary';
import { supabase } from '@/lib/supabase';
import { RefreshCw } from 'lucide-react';

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

export default function OverviewPage() {
  const { currentStore } = useStore();
  const [stores, setStores] = useState<StoreData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from hooks
  const { summary: pawnSummary, loading: pawnLoading } = usePawnCalculations();
  const { summary: creditSummary, loading: creditLoading } = useCreditCalculations();
  const { data: installmentSummary, loading: installmentLoading } = useInstallmentsSummary();

  // Format currency
  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  // Fetch stores data
  const fetchStores = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, cash_fund, investment')
        .order('name', { ascending: true });
      
      if (error) {
        throw new Error(error.message);
      }
      
      setStores(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on mount and when store changes
  useEffect(() => {
    fetchStores();
    
    // Set up auto refresh interval (every 30 seconds)
    const intervalId = setInterval(() => {
      fetchStores();
    }, 30000);
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [currentStore?.id]);

  // Calculate totals
  const calculateTotals = () => {
    let totalCashFund = 0;
    let totalInvestment = 0;

    stores.forEach(store => {
      totalCashFund += store.cash_fund || 0;
      totalInvestment += store.investment || 0;
    });

    return {
      totalCashFund,
      totalInvestment,
      totalPawnLoan: pawnSummary?.totalLoan || 0,
      totalCreditLoan: creditSummary?.totalLoan || 0,
      totalInstallmentLoan: installmentSummary?.totalLoan || 0,
      totalExpectedProfit: (pawnSummary?.profit || 0) + (creditSummary?.profit || 0) + (installmentSummary?.profit || 0),
      totalCollectedProfit: (pawnSummary?.collectedInterest || 0) + (creditSummary?.collectedInterest || 0) + (installmentSummary?.collectedInterest || 0)
    };
  };

  const totals = calculateTotals();

  return (
    <Layout>
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
        {(isLoading || pawnLoading || creditLoading || installmentLoading) && (
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
                {stores.map((store) => (
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
                      {store.id === currentStore?.id ? formatCurrency(pawnSummary?.totalLoan) : '0'}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                      {store.id === currentStore?.id ? formatCurrency(creditSummary?.totalLoan) : '0'}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                      {store.id === currentStore?.id ? formatCurrency(installmentSummary?.totalLoan) : '0'}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                      {store.id === currentStore?.id ? 
                        formatCurrency((pawnSummary?.profit || 0) + (creditSummary?.profit || 0) + (installmentSummary?.profit || 0)) : '0'}
                    </TableCell>
                    <TableCell className="py-3 px-3 border-b border-gray-200">
                      {store.id === currentStore?.id ? 
                        formatCurrency((pawnSummary?.collectedInterest || 0) + (creditSummary?.collectedInterest || 0) + (installmentSummary?.collectedInterest || 0)) : '0'}
                    </TableCell>
                  </TableRow>
                ))}
                
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
    </Layout>
  );
}
