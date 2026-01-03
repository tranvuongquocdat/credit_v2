'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import { FinancialSummary } from '@/components/common/FinancialSummary';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatePickerWithControls } from '@/components/ui/date-picker-with-controls';
import { format, startOfDay } from 'date-fns';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { StoreFinancialData } from '@/hooks/useCreditCalculation';

// Define a simple interface for our display data
interface FundHistoryItem {
  id: string;
  date: string;
  description: string;
  transactionType: string;
  source: string;
  income: number;
  expense: number;
  contractCode?: string;
}

interface BySourceTotals {
  [key: string]: {
    income: number;
    expense: number;
  };
}

interface GenericHistoryItem {
  id: string;
  created_at: string | null;
  description?: string | null;
  note?: string | null;
  transaction_type?: string | null;
  debit_amount?: number | null;
  credit_amount?: number | null;
  fund_amount?: number | null;
  amount?: number | null;
  contract_id?: string | null;
  pawn_id?: string | null;
  credit_id?: string | null;
  installment_id?: string | null;
  contract_code?: string | null;
}

interface DailyFundRecord {
  day: string;
  total_fund: number;
}

export default function TotalFundPage() {
  const router = useRouter();
  const { currentStore } = useStore();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [financialSummary, setFinancialSummary] = useState<StoreFinancialData>({
    totalFund: 0,
    availableFund: 0,
    totalLoan: 0,
    oldDebt: 0,
    profit: 0,
    collectedInterest: 0
  });
  const [fundHistory, setFundHistory] = useState<FundHistoryItem[]>([]);
  const [dailyFundHistory, setDailyFundHistory] = useState<DailyFundRecord[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  
  // Date range for filtering
  const [startDate, setStartDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );

  // Check authentication and role
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
        
        if (!user || !['admin', 'superadmin'].includes(user.role)) {
          router.push('/dashboard');
          return;
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        router.push('/dashboard');
      } finally {
        setIsCheckingAuth(false);
      }
    };
    
    checkAuth();
  }, [router]);

  // Fetch financial summary data
  const fetchFinancialSummary = async () => {
    try {
      if (!currentStore?.id) return;

      const { data: totalFundData } = await supabase
        .from('store_total_fund')
        .select('total_fund')
        .eq('store_id', currentStore.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      const { data: storeData } = await supabase
        .from('stores')
        .select('investment, cash_fund')
        .eq('id', currentStore.id)
        .single();

      setFinancialSummary({
        totalFund: totalFundData?.total_fund || storeData?.investment || 0,
        availableFund: storeData?.cash_fund || 0,
        totalLoan: 0,
        oldDebt: 0,
        profit: 0,
        collectedInterest: 0
      });
    } catch (error) {
      console.error('Error fetching financial summary:', error);
    }
  };

  const fetchDailyFundHistory = async () => {
    if (!currentStore?.id) return;
    try {
      const { data, error } = await supabase
        .from('store_total_fund')
        .select('created_at, total_fund')
        .eq('store_id', currentStore.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      const dailySummary: { [key: string]: number } = {};
      data.forEach(record => {
        const day = format(new Date(record.created_at), 'yyyy-MM-dd');
        dailySummary[day] = record.total_fund;
      });

      const formattedHistory = Object.entries(dailySummary)
        .map(([day, total_fund]) => ({ day, total_fund }))
        .sort((a, b) => new Date(b.day).getTime() - new Date(a.day).getTime());

      setDailyFundHistory(formattedHistory);
    } catch (error) {
      console.error('Error fetching daily fund history:', error);
    }
  };

  const updateTotalFund = async (allItems: FundHistoryItem[]) => {
    try {
      if (!currentStore?.id) return;

      const grandTotal = allItems.reduce((sum, item) => sum + item.income - item.expense, 0);

      const { data: existingRecord } = await supabase
        .from('store_total_fund')
        .select('id')
        .eq('store_id', currentStore.id)
        .limit(1)
        .single();

      if (existingRecord) {
        await supabase
          .from('store_total_fund')
          .update({
            total_fund: grandTotal,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRecord.id);
      } else {
        await supabase
          .from('store_total_fund')
          .insert({
            store_id: currentStore.id,
            total_fund: grandTotal
          });
      }

      await supabase
        .from('stores')
        .update({ cash_fund: grandTotal })
        .eq('id', currentStore.id);
      
      await fetchFinancialSummary();
      await fetchDailyFundHistory();

    } catch (error) {
      console.error('Error updating total fund:', error);
    }
  };

  const fetchAllData = async (query: any, pageSize: number = 1000) => {
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await query.range(from, from + pageSize - 1);
      
      if (error) {
        console.error('Error fetching data:', error);
        break;
      }

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  // Fetch all fund history
  const fetchAndProcessHistory = async () => {
    setLoading(true);
    try {
      if (!currentStore?.id) return;
      
      const allHistoryItems: FundHistoryItem[] = [];
      const storeId = currentStore.id;
      
      const processItems = (data: GenericHistoryItem[], source: string) => {
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
            }
            else {
              amount = (item.credit_amount || 0) - (item.debit_amount || 0);
            }

            allHistoryItems.push({
              id: `${source.toLowerCase()}-${item.id}`,
              date: item.created_at,
              description: item.description || item.note || `Giao dịch ${source}`,
              transactionType: item.transaction_type || '',
              source,
              income: amount > 0 ? amount : 0,
              expense: amount < 0 ? -amount : 0,
              contractCode: item.contract_code || '-'
            });
          });
        }
      };

      // Sử dụng fetchAllData cho credit history
      const creditHistoryData = await fetchAllData(
        supabase
          .from('credit_history')
          .select(`
            *,
            credits!inner (contract_code, store_id)
          `)
          .eq('credits.store_id', storeId)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('id')
      );
      
      if (creditHistoryData) {
        const processedCreditData = creditHistoryData.map(item => ({
          ...item,
          contract_code: item.credits?.contract_code || null
        }));
        processItems(processedCreditData, 'Tín chấp');
      }

      // Tương tự cho các truy vấn khác...
      const pawnHistoryData = await fetchAllData(
        supabase
          .from('pawn_history')
          .select(`
            *,
            pawns!inner (contract_code, store_id)
          `)
          .eq('pawns.store_id', storeId)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('id')
      );
      
      if (pawnHistoryData) {
        const processedPawnData = pawnHistoryData.map(item => ({
          ...item,
          contract_code: item.pawns?.contract_code || null
        }));
        processItems(processedPawnData, 'Cầm đồ');
      }

      // For installment history
      const installmentHistoryData = await fetchAllData(
        supabase
          .from('installment_history')
          .select(`
            *,
            installments!inner (
              contract_code,
              employee_id,
              employees!inner (store_id)
            )
          `)
          .eq('installments.employees.store_id', storeId)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('id')
      );
      
      if (installmentHistoryData) {
        // Prepare data for processing
        const processedInstallmentData = installmentHistoryData.map(item => ({
          ...item,
          contract_code: item.installments?.contract_code || null
        }));
        processItems(processedInstallmentData, 'Trả góp');
      }
      
      // For fund history
      const { data: storeFundData } = await supabase
        .from('store_fund_history')
        .select('*')
        .eq('store_id', storeId)
        .limit(10000);
      
      if (storeFundData) processItems(storeFundData, 'Nguồn vốn');
      
      // For transactions
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*')
        .eq('store_id', storeId)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .limit(10000);
      
      if (transactionsData) processItems(transactionsData, 'Thu chi');
      
      allHistoryItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      await updateTotalFund(allHistoryItems);

      const start = startOfDay(new Date(startDate));
      const end = startOfDay(new Date(endDate));
      end.setHours(23, 59, 59, 999);
      
      const filteredForDisplay = allHistoryItems.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= start && itemDate <= end;
      });

      setFundHistory(filteredForDisplay);

    } catch (error) {
      console.error('Error fetching fund history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
  };

  const filteredHistory = useMemo(() => activeTab === 'all' 
    ? fundHistory 
    : fundHistory.filter(item => item.source === activeTab),
    [fundHistory, activeTab]);

  const totals = useMemo(() => {
    const totalIncome = filteredHistory.reduce((sum, item) => sum + item.income, 0);
    const totalExpense = filteredHistory.reduce((sum, item) => sum + item.expense, 0);

    let bySource: BySourceTotals | null = null;
    if (activeTab === 'all') {
      bySource = {
        'Tín chấp': { income: 0, expense: 0 },
        'Cầm đồ': { income: 0, expense: 0 },
        'Trả góp': { income: 0, expense: 0 },
        'Nguồn vốn': { income: 0, expense: 0 },
        'Thu chi': { income: 0, expense: 0 },
      };
      filteredHistory.forEach(item => {
        if (bySource && item.source in bySource) {
           bySource[item.source].income += item.income;
           bySource[item.source].expense += item.expense;
        }
      });
    }
    
    return { totalIncome, totalExpense, netChange: totalIncome - totalExpense, bySource };
  }, [filteredHistory, activeTab]);

  useEffect(() => {
    if(currentStore?.id) {
      fetchFinancialSummary();
      fetchAndProcessHistory();
      fetchDailyFundHistory();
    }
  }, [currentStore?.id, startDate, endDate]);
  
  const handleRefresh = () => {
    if(currentStore?.id) {
      fetchAndProcessHistory();
    }
  }

  // Don't render if still checking auth or not admin/superadmin
  if (isCheckingAuth || !currentUser || !['admin', 'superadmin'].includes(currentUser.role)) {
    return null;
  }

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold">Quỹ Tổng Hợp</h1>
        
        <FinancialSummary 
          fundStatus={financialSummary} 
          onRefresh={handleRefresh} 
          storeId={currentStore?.id}
        />
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Biến động quỹ</CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <DatePickerWithControls value={startDate} onChange={handleStartDateChange} placeholder="Chọn ngày bắt đầu" className="px-3 py-2" />
                <span>đến</span>
                <DatePickerWithControls value={endDate} onChange={handleEndDateChange} placeholder="Chọn ngày kết thúc" className="px-3 py-2" />
              </div>
              <Button onClick={handleRefresh}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Làm mới'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="flex space-x-2 border-b">
                {['all', 'Tín chấp', 'Cầm đồ', 'Trả góp', 'Nguồn vốn', 'Thu chi'].map((tab) => (
                  <button
                    key={tab}
                    className={`px-4 py-2 ${activeTab === (tab === 'all' ? 'all' : tab) ? 'border-b-2 border-blue-500 text-blue-600 font-medium' : 'text-gray-600'}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === 'all' ? 'Tất cả' : tab}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Nguồn</TableHead>
                    <TableHead>Mã HĐ</TableHead>
                    <TableHead>Mô tả</TableHead>
                    <TableHead className="text-right">Thu</TableHead>
                    <TableHead className="text-right">Chi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{new Date(item.date).toLocaleDateString('vi-VN')}</TableCell>
                        <TableCell>{item.source}</TableCell>
                        <TableCell>
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
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {item.income > 0 ? `${item.income.toLocaleString()} VND` : ''}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {item.expense > 0 ? `${item.expense.toLocaleString()} VND` : ''}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={6} className="text-center py-4">Không có dữ liệu</TableCell></TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  {filteredHistory.length > 0 && (
                    <>
                      {activeTab === 'all' && totals.bySource && Object.entries(totals.bySource).map(([source, values]) => (
                        <TableRow key={source}>
                          <TableCell colSpan={4} className="text-right font-semibold">{`Tổng ${source}`}</TableCell>
                          <TableCell className="text-right font-semibold text-green-600">{values.income.toLocaleString()} VND</TableCell>
                          <TableCell className="text-right font-semibold text-red-600">{values.expense.toLocaleString()} VND</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-gray-50">
                        <TableCell colSpan={4} className="text-right font-bold text-lg">TỔNG BIẾN ĐỘNG</TableCell>
                        <TableCell className="text-right font-bold text-lg text-green-600">{totals.totalIncome.toLocaleString()} VND</TableCell>
                        <TableCell className="text-right font-bold text-lg text-red-600">{totals.totalExpense.toLocaleString()} VND</TableCell>
                      </TableRow>
                       <TableRow className="bg-gray-100">
                        <TableCell colSpan={5} className="text-right font-bold text-lg">LỢI NHUẬN</TableCell>
                        <TableCell className={`text-right font-bold text-lg ${totals.netChange < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {totals.netChange.toLocaleString()} VND
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableFooter>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lịch sử tổng quỹ</CardTitle>
          </CardHeader>
          <CardContent>
             {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead className="text-right">Tổng quỹ cuối ngày</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyFundHistory.length > 0 ? (
                    dailyFundHistory.map((item) => (
                      <TableRow key={item.day}>
                        <TableCell>{new Date(item.day).toLocaleDateString('vi-VN')}</TableCell>
                        <TableCell className="text-right font-medium">{item.total_fund.toLocaleString()} VND</TableCell>
                      </TableRow>
                    ))
                  ) : (
                     <TableRow><TableCell colSpan={2} className="text-center py-4">Không có dữ liệu</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}