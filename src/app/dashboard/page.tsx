"use client";
import { useEffect, useState, useRef } from 'react';
import { getCurrentUser } from '../../lib/auth';
import { useRouter } from 'next/navigation';
import { useStore } from '@/contexts/StoreContext';
import { Layout } from '@/components/Layout';
import { Card } from '@/components/ui/card';
import { ArrowUp, ArrowDown, Bike, Salad, DollarSign, TrendingDown, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import {
  getPawnFinancialsForStore,
  getCreditFinancialsForStore,
  getInstallmentFinancialsForStore
} from '@/lib/overview';
import { startPerfTimer } from '@/lib/perf-debug';
import { fetchDashboardChartMetrics, type ChartDataPoint } from '@/lib/dashboard-chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import Link from 'next/link';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DashboardStats {
  totalLoan: {
    pawn: number;
    credit: number;
    installment: number;
  };
  totalCollectedInterest: {
    pawn: number;
    credit: number;
    installment: number;
  };
  newContracts: {
    pawn: number;
    credit: number;
    installment: number;
  };
}

interface TransactionItem {
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

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalLoan: { pawn: 0, credit: 0, installment: 0 },
    totalCollectedInterest: { pawn: 0, credit: 0, installment: 0 },
    newContracts: { pawn: 0, credit: 0, installment: 0 }
  });
  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const router = useRouter();
  const { currentStore } = useStore();

  // Request IDs for race condition prevention
  const statsRequestIdRef = useRef(0);
  const chartRequestIdRef = useRef(0);
  const transactionsRequestIdRef = useRef(0);

  // check if the build name is nuvoras_v2
  const isNuvorasV1 = process.env.NEXT_PUBLIC_BUILD_NAME === 'nuvoras';
  

  useEffect(() => {
    async function fetchUser() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
        if (!currentUser) {
          router.push('/login');
        }
      } catch (err) {
        console.error('fetchUser error:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [router]);

  // Fetch dashboard statistics
  const fetchStats = async () => {
    if (!currentStore?.id) return;
    const endFetchStats = startPerfTimer('Dashboard.fetchStats', {
      context: { storeId: currentStore.id },
    });

    const currentRequestId = ++statsRequestIdRef.current;

    try {
      // Get new contracts count for current month
      const now = new Date();
      const startOfCurrentMonth = startOfMonth(now);
      const endOfCurrentMonth = endOfMonth(now);

      // Chạy tất cả queries song song để tối ưu hiệu suất
      const endFetchStatsParallel = startPerfTimer('Dashboard.fetchStats.parallelQueries');
      const [
        pawnFinancials,
        creditFinancials,
        installmentFinancials,
        newPawns,
        newCredits,
        newInstallments
      ] = await Promise.all([
        getPawnFinancialsForStore(currentStore.id),
        getCreditFinancialsForStore(currentStore.id),
        getInstallmentFinancialsForStore(currentStore.id),
        supabase
          .from('pawns')
          .select('id', { count: 'exact' })
          .eq('store_id', currentStore.id)
          .gte('loan_date', startOfCurrentMonth.toISOString())
          .lte('loan_date', endOfCurrentMonth.toISOString()),
        supabase
          .from('credits')
          .select('id', { count: 'exact' })
          .eq('store_id', currentStore.id)
          .gte('loan_date', startOfCurrentMonth.toISOString())
          .lte('loan_date', endOfCurrentMonth.toISOString()),
        supabase
          .from('installments_by_store')
          .select('id', { count: 'exact' })
          .eq('store_id', currentStore.id)
          .gte('loan_date', startOfCurrentMonth.toISOString())
          .lte('loan_date', endOfCurrentMonth.toISOString())
      ]);
      endFetchStatsParallel();

      // Check if this request is still the latest one
      if (currentRequestId !== statsRequestIdRef.current) {
        return;
      }

      setStats({
        totalLoan: {
          pawn: pawnFinancials.totalLoan,
          credit: creditFinancials.totalLoan,
          installment: installmentFinancials.totalLoan
        },
        totalCollectedInterest: {
          pawn: pawnFinancials.collectedInterest,
          credit: creditFinancials.collectedInterest,
          installment: installmentFinancials.collectedInterest
        },
        newContracts: {
          pawn: newPawns.count || 0,
          credit: newCredits.count || 0,
          installment: newInstallments.count || 0
        }
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      endFetchStats();
    }
  };

  // Fetch chart data for last 3 months
  const fetchChartData = async () => {
    if (!currentStore?.id) return;
    const endFetchChartData = startPerfTimer('Dashboard.fetchChartData', {
      context: { storeId: currentStore.id },
    });

    const currentRequestId = ++chartRequestIdRef.current;


    setChartLoading(true);
    try {
      const chartPoints = await fetchDashboardChartMetrics(currentStore.id);

      // Check if this request is still the latest one
      if (currentRequestId !== chartRequestIdRef.current) {
        return;
      }


      setChartData(chartPoints);
    } catch (err) {
      console.error('[Dashboard.fetchChartData] error', {
        storeId: currentStore?.id,
        requestId: currentRequestId,
        err,
      });
    } finally {
      if (currentRequestId === chartRequestIdRef.current) {
        setChartLoading(false);
      }
      endFetchChartData();
    }
  };

  // Fetch recent transactions (similar to TransactionDetailsTable but limit to 10)
  const fetchRecentTransactions = async () => {
    if (!currentStore?.id) return;
    const endFetchRecentTransactions = startPerfTimer('Dashboard.fetchRecentTransactions', {
      context: { storeId: currentStore.id },
    });

    const currentRequestId = ++transactionsRequestIdRef.current;

    setTransactionsLoading(true);
    try {
      const allHistoryItems: TransactionItem[] = [];
      
      const processItems = (data: any[], source: string) => {
        if (data && data.length > 0) {
          data.forEach((item) => {
            if (!item.created_at) return;

            let amount = 0;
            if(source === 'Nguồn vốn'){
              amount = item.transaction_type === 'withdrawal' ? -Number(item.fund_amount || 0) : Number(item.fund_amount || 0);
            } else if(source === 'Thu chi'){
              amount = (item.credit_amount || 0) - (item.debit_amount || 0);
              if(amount === 0){
                amount = item.transaction_type === 'expense' ? -Number(item.amount || 0) : Number(item.amount || 0);
              }
            } else {
              amount = (item.credit_amount || 0) - (item.debit_amount || 0);
            }

            let employeeName = '';
            if (source === 'Thu chi') {
              employeeName = item.employee_name || '';
            } else if (source === 'Cầm đồ' || source === 'Tín chấp' || source === 'Trả góp') {
              employeeName = item.profiles?.username || '';
            }

            let customerName = '';
            if (source === 'Cầm đồ') {
              customerName = item.pawns?.customers?.name || '';
            } else if (source === 'Tín chấp') {
              customerName = item.credits?.customers?.name || '';
            } else if (source === 'Trả góp') {
              customerName = item.installments?.customers?.name || '';
            } else if (source === 'Nguồn vốn') {
              customerName = (item as any).name || '';
            } else if (source === 'Thu chi') {
              customerName = (item as any).customers?.name || '';
            }

            let itemName = '';
            if (source === 'Cầm đồ') {
              itemName = (item.pawns as any)?.['collateral_detail->>name'] || item.pawns?.collateral_detail?.name || '';
            }

            allHistoryItems.push({
              id: `${source.toLowerCase()}-${item.id}`,
              date: item.created_at,
              description: item.description || item.note || `Giao dịch ${source}`,
              transactionType: item.transaction_type || '',
              source,
              income: amount > 0 ? amount : 0,
              expense: amount < 0 ? -amount : 0,
              contractCode: item.contract_code || '-',
              employeeName,
              customerName,
              itemName
            });
          });
        }
      };

      // Fetch all transaction data (limited for performance)
      const endHistoryQueries = startPerfTimer('Dashboard.fetchRecentTransactions.parallelQueries');
      const [creditHistoryData, pawnHistoryData, installmentHistoryData, storeFundData, transactionsData] = await Promise.all([
        supabase
          .from('credit_history')
          .select(`
            *,
            credits!inner (
              contract_code, 
              store_id,
              customers (name)
            ),
            profiles:created_by (username)
          `)
          .eq('credits.store_id', currentStore.id)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('pawn_history')
          .select(`
            *,
            pawns!inner (
              contract_code, 
              store_id,
              customers (name),
              collateral_detail
            ),
            profiles:created_by (username)
          `)
          .eq('pawns.store_id', currentStore.id)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('installment_history')
          .select(`
            *,
            installments!inner (
              contract_code,
              employee_id,
              employees!inner (store_id),
              customers (name)
            ),
            profiles:created_by (username)
          `)
          .eq('installments.employees.store_id', currentStore.id)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('store_fund_history')
          .select('*')
          .eq('store_id', currentStore.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('transactions')
          .select('*, customers:customer_id(name)')
          .eq('store_id', currentStore.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);
      endHistoryQueries();

      // Process each data source
      if (creditHistoryData.data) {
        const processedCreditData = creditHistoryData.data.map(item => ({
          ...item,
          contract_code: item.credits?.contract_code || null
        }));
        processItems(processedCreditData, 'Tín chấp');
      }

      if (pawnHistoryData.data) {
        const processedPawnData = pawnHistoryData.data.map(item => ({
          ...item,
          contract_code: item.pawns?.contract_code || null
        }));
        processItems(processedPawnData, 'Cầm đồ');
      }

      if (installmentHistoryData.data) {
        const processedInstallmentData = installmentHistoryData.data.map(item => ({
          ...item,
          contract_code: item.installments?.contract_code || null
        }));
        processItems(processedInstallmentData, 'Trả góp');
      }

      if (storeFundData.data) processItems(storeFundData.data, 'Nguồn vốn');
      if (transactionsData.data) processItems(transactionsData.data, 'Thu chi');

      // Sort by date and take only 10 most recent
      const endSortTransactions = startPerfTimer('Dashboard.fetchRecentTransactions.sortAndSlice');
      allHistoryItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Check if this request is still the latest one
      if (currentRequestId !== transactionsRequestIdRef.current) {
        return;
      }

      setRecentTransactions(allHistoryItems.slice(0, 10));
      endSortTransactions();

    } catch (err) {
      console.error('Error fetching recent transactions:', err);
    } finally {
      if (currentRequestId === transactionsRequestIdRef.current) {
        setTransactionsLoading(false);
      }
      endFetchRecentTransactions();
    }
  };

  useEffect(() => {
    if (currentStore?.id) {
      fetchStats();
      fetchRecentTransactions();
      fetchChartData();
    }
  }, [currentStore?.id]);

  // Custom tooltip formatter for the chart
  const formatTooltipValue = (value: number, name: string) => {
    const formattedValue = new Intl.NumberFormat('vi-VN').format(value);
    return [`${formattedValue} VND`, name];
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '50px' }}>Đang tải...</div>;
  }

  if (!user) {
    return <div style={{ textAlign: 'center', padding: '50px' }}>Không tìm thấy thông tin người dùng.</div>;
  }

  const totalLoanAmount = stats.totalLoan.pawn + stats.totalLoan.credit + stats.totalLoan.installment;
  const totalCollectedInterestAmount = stats.totalCollectedInterest.pawn + stats.totalCollectedInterest.credit + stats.totalCollectedInterest.installment;
  const totalNewContracts = stats.newContracts.pawn + stats.newContracts.credit + stats.newContracts.installment;

  // Calculate totals for recent transactions
  const totalIncome = recentTransactions.reduce((sum, item) => sum + item.income, 0);
  const totalExpense = recentTransactions.reduce((sum, item) => sum + item.expense, 0);

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Tổng quan tín chấp</h1>
        </div>

        {/* Thông báo */}
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
          <p className="text-amber-800">Thông báo: Đang thực hiện kiểm chứng số liệu tín chấp. Xin vui lòng kiểm tra dữ liệu trước khi thực hiện.</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 - Tổng đang cho vay */}
          <Card className="p-4 border-l-4 border-green-500 bg-green-50 min-h-[140px]">
            <div className="flex justify-between items-start h-full">
              <div className="flex-1">
                <p className="text-green-700 text-sm font-medium">Tổng đang cho vay</p>
                <h3 className="text-2xl font-bold mt-1 mb-3">{formatCurrency(totalLoanAmount)}</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <Bike className="h-4 w-4 mr-2 text-green-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Cầm đồ
                        </div>
                      </div>
                      <span className="text-green-600 text-sm font-medium">{formatCurrency(stats.totalLoan.pawn)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <DollarSign className="h-4 w-4 mr-2 text-blue-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Tín chấp
                        </div>
                      </div>
                      <span className="text-blue-600 text-sm font-medium">{formatCurrency(stats.totalLoan.credit)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <Salad className="h-4 w-4 mr-2 text-amber-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Trả góp
                        </div>
                      </div>
                      <span className="text-amber-600 text-sm font-medium">{formatCurrency(stats.totalLoan.installment)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-green-200 h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0">
                <Bike className="h-5 w-5 text-green-700" />
              </div>
            </div>
          </Card>

          {/* Card 2 - Tổng lãi phí đã thu */}
          <Card className="p-4 border-l-4 border-blue-500 bg-blue-50 min-h-[140px]">
            <div className="flex justify-between items-start h-full">
              <div className="flex-1">
                <p className="text-blue-700 text-sm font-medium">Tổng lãi phí đã thu</p>
                <h3 className="text-2xl font-bold mt-1 mb-3">{formatCurrency(totalCollectedInterestAmount)}</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <Bike className="h-4 w-4 mr-2 text-green-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Cầm đồ
                        </div>
                      </div>
                      <span className="text-green-600 text-sm font-medium">{formatCurrency(stats.totalCollectedInterest.pawn)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <DollarSign className="h-4 w-4 mr-2 text-blue-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Tín chấp
                        </div>
                      </div>
                      <span className="text-blue-600 text-sm font-medium">{formatCurrency(stats.totalCollectedInterest.credit)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <Salad className="h-4 w-4 mr-2 text-amber-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Trả góp
                        </div>
                      </div>
                      <span className="text-amber-600 text-sm font-medium">{formatCurrency(stats.totalCollectedInterest.installment)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-blue-200 h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0">
                <Salad className="h-5 w-5 text-blue-700" />
              </div>
            </div>
          </Card>

          {/* Card 3 - Tổng nợ xấu */}
          <Card className="p-4 border-l-4 border-red-500 bg-red-50 min-h-[140px]">
            <div className="flex justify-between items-start h-full">
              <div className="flex-1">
                <p className="text-red-700 text-sm font-medium">Tổng nợ xấu</p>
                <h3 className="text-2xl font-bold mt-1 mb-3">0</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <Bike className="h-4 w-4 mr-2 text-green-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Cầm đồ
                        </div>
                      </div>
                      <span className="text-green-600 text-sm font-medium">0</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <DollarSign className="h-4 w-4 mr-2 text-blue-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Tín chấp
                        </div>
                      </div>
                      <span className="text-blue-600 text-sm font-medium">0</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <Salad className="h-4 w-4 mr-2 text-amber-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Trả góp
                        </div>
                      </div>
                      <span className="text-amber-600 text-sm font-medium">0</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-red-200 h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0">
                <TrendingDown className="h-5 w-5 text-red-700" />
              </div>
            </div>
          </Card>

          {/* Card 4 - Tổng hợp đồng mới */}
          <Card className="p-4 border-l-4 border-amber-500 bg-amber-50 min-h-[140px]">
            <div className="flex justify-between items-start h-full">
              <div className="flex-1">
                <p className="text-amber-700 text-sm font-medium">Tổng hợp đồng mới</p>
                <h3 className="text-2xl font-bold mt-1 mb-3">{totalNewContracts}</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <Bike className="h-4 w-4 mr-2 text-green-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Cầm đồ
                        </div>
                      </div>
                      <span className="text-green-600 text-sm font-medium">{stats.newContracts.pawn}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <DollarSign className="h-4 w-4 mr-2 text-blue-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Tín chấp
                        </div>
                      </div>
                      <span className="text-blue-600 text-sm font-medium">{stats.newContracts.credit}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative group">
                        <Salad className="h-4 w-4 mr-2 text-amber-600 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                          Trả góp
                        </div>
                      </div>
                      <span className="text-amber-600 text-sm font-medium">{stats.newContracts.installment}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-amber-200 h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0">
                <DollarSign className="h-5 w-5 text-amber-700" />
              </div>
            </div>
          </Card>
        </div>

        {/* Chart */}
        <Card className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium">Lợi nhuận - Cho vay</h2>
            <div className="space-x-2">
              <Badge variant="outline" className="text-blue-600 bg-blue-50">Cho vay</Badge>
              <Badge variant="outline" className="text-red-600 bg-red-50">Lợi nhuận</Badge>
            </div>
          </div>
          
          {chartLoading ? (
            <div className="h-64 w-full flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Đang tải dữ liệu biểu đồ...</span>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 12 }}
                    tickLine={{ stroke: '#ccc' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={{ stroke: '#ccc' }}
                    tickFormatter={(value) => {
                      if (value >= 1000000) {
                        return `${(value / 1000000).toFixed(0)}M`;
                      } else if (value >= 1000) {
                        return `${(value / 1000).toFixed(0)}K`;
                      }
                      return value.toString();
                    }}
                  />
                  <Tooltip 
                    formatter={formatTooltipValue}
                    labelFormatter={(label) => `Tháng: ${label}`}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: '4px'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="choVay" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                    name="Cho vay"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="loiNhuan" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                    name="Lợi nhuận"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Recent Transactions Table */}
        <Card className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium">Giao dịch gần nhất</h2>
            <Button size="sm" variant="outline" onClick={() => router.push('/reports/transactionSummary')}>
              Xem tất cả
            </Button>
          </div>
          
          {transactionsLoading ? (
            <div className="flex items-center justify-center p-4">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Đang tải dữ liệu...</span>
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              Không có giao dịch gần đây
            </div>
          ) : (
            <div className="w-full overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="min-w-full">
                  <TableHeader>
                    <tr className="border-b text-left">
                      <TableHead className="py-3 px-2 font-medium w-8">#</TableHead>
                      <TableHead className="py-3 px-2 font-medium">Loại</TableHead>
                      <TableHead className="py-3 px-2 font-medium">Mã HĐ</TableHead>
                      <TableHead className="py-3 px-2 font-medium">Khách hàng</TableHead>
                      <TableHead className="py-3 px-2 font-medium">Ngày</TableHead>
                      <TableHead className="py-3 px-2 font-medium">Diễn giải</TableHead>
                      <TableHead className="py-3 px-2 font-medium text-right">Thu</TableHead>
                      <TableHead className="py-3 px-2 font-medium text-right">Chi</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {recentTransactions.map((item, index) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        <TableCell className="py-2 px-2 text-center">{index + 1}</TableCell>
                        <TableCell className="py-2 px-2">
                          <Badge variant="outline" className="text-xs">
                            {item.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 px-2">
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
                                  ? "text-blue-600 hover:underline text-sm"
                                  : "text-sm"
                              }
                            >
                              {item.contractCode}
                            </Link>
                          ) : (
                            <span className="text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-sm">
                          {item.customerName || '-'}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-sm">
                          {format(new Date(item.date), 'dd/MM/yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-sm max-w-48 truncate">
                          {item.description}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-right text-sm">
                          {item.income > 0 ? (
                            <span className="text-green-600 font-medium">
                              {formatCurrency(item.income)}
                            </span>
                          ) : (
                            ""
                          )}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-right text-sm">
                          {item.expense > 0 ? (
                            <span className="text-red-600 font-medium">
                              {formatCurrency(item.expense)}
                            </span>
                          ) : (
                            ""
                          )}
                        </TableCell>
                      </tr>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <tr className="bg-gray-50">
                      <TableCell colSpan={6} className="py-3 px-2 text-right font-bold text-base">
                        Tổng Cộng
                      </TableCell>
                      <TableCell className="py-3 px-2 text-right font-bold text-base">
                        <span className="text-green-600">{formatCurrency(totalIncome)}</span>
                      </TableCell>
                      <TableCell className="py-3 px-2 text-right font-bold text-base">
                        <span className="text-red-600">{formatCurrency(totalExpense)}</span>
                      </TableCell>
                    </tr>
                  </TableFooter>
                </Table>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
