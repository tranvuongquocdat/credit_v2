'use client';

import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { supabase } from '@/lib/supabase';
import { RefreshCw } from 'lucide-react';
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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Note: We no longer import status calculation functions to improve performance
// Using database status directly instead of calculating each contract status

interface StoreData {
  id: string;
  name: string;
  phone: string;
  address: string;
  cash_fund: number;
  investment: number;
}

interface StoreSummary {
  pawn: FinancialSummary;
  credit: FinancialSummary;
  installment: FinancialSummary;
}

interface ContractSummary {
  total: number;
  active: number;
  closed: number;
  totalLoan: number;
  customerDebt: number;
  expectedProfit: number;
  collectedProfit: number;
}

interface TransactionSummary {
  totalIncome: number;
  totalExpense: number;
}

export default function StoreDetailPage() {
  const { currentStore } = useStore();
  const [storeData, setStoreData] = useState<StoreData | null>(null);
  const [storeSummary, setStoreSummary] = useState<StoreSummary | null>(null);
  const [contractSummaries, setContractSummaries] = useState<{
    pawn: ContractSummary;
    credit: ContractSummary;
    installment: ContractSummary;
  } | null>(null);
  const [transactionSummary, setTransactionSummary] = useState<TransactionSummary>({
    totalIncome: 0,
    totalExpense: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Format currency
  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '0';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  // Fetch store data
  const fetchStoreData = async () => {
    if (!currentStore?.id) return;

    try {
      setIsLoading(true);
      setError(null);

      // Fetch store details
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id, name, phone, address, cash_fund, investment')
        .eq('id', currentStore.id)
        .single();

      if (storeError) {
        throw storeError;
      }

      setStoreData(store);

      // Fetch financial summaries
      const [pawn, credit, installment] = await Promise.all([
        getPawnFinancialsForStore(currentStore.id),
        getCreditFinancialsForStore(currentStore.id),
        getInstallmentFinancialsForStore(currentStore.id)
      ]);

      setStoreSummary({ pawn, credit, installment });

      // Fetch contract summaries (pass storeSummary data directly)
      const summaryData = { pawn, credit, installment };
      await fetchContractSummaries(summaryData);
      
      // Fetch transaction summaries
      await fetchTransactionSummaries();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch contract summaries
  const fetchContractSummaries = async (summaryData?: StoreSummary) => {
    if (!currentStore?.id) return;

    try {
      const storeId = currentStore.id;

      // Fetch contract data for each type
      const [pawnData, creditData, installmentData] = await Promise.all([
        fetchContractData('pawns', storeId, summaryData),
        fetchContractData('credits', storeId, summaryData),
        fetchInstallmentData(storeId, summaryData)
      ]);

      setContractSummaries({
        pawn: pawnData,
        credit: creditData,
        installment: installmentData
      });
    } catch (err) {
      console.error('Error fetching contract summaries:', err);
    }
  };

  // Fetch contract data for pawns/credits (optimized version)
  const fetchContractData = async (
    contractType: 'pawns' | 'credits',
    storeId: string,
    summaryData?: StoreSummary
  ): Promise<ContractSummary> => {
    // Use database status for faster performance instead of calculating each status
    const { data: contracts, error } = await supabase
      .from(contractType)
      .select('id, loan_amount, status')
      .eq('store_id', storeId);

    if (error) {
      console.error(`Error fetching ${contractType}:`, error);
      return {
        total: 0,
        active: 0,
        closed: 0,
        totalLoan: 0,
        customerDebt: 0,
        expectedProfit: 0,
        collectedProfit: 0
      };
    }

    // Count by database status for better performance (no individual status calculation)
    let active = 0;
    let closed = 0;

    (contracts || []).forEach(contract => {
      if (contract.status === 'closed') {
        closed++;
      } else if (contract.status === 'on_time' || contract.status === 'overdue' || contract.status === 'late_interest') {
        active++;
      }
    });

    // Get financial data from overview (already calculated correctly)
    let totalLoan = 0;
    let expectedProfit = 0;
    let collectedProfit = 0;
    let customerDebt = 0;

    const summaryToUse = summaryData || storeSummary;
    if (summaryToUse) {
      if (contractType === 'pawns') {
        totalLoan = summaryToUse.pawn.totalLoan; // This is "Đang cho vay" from profitSummary
        expectedProfit = summaryToUse.pawn.profit;
        collectedProfit = summaryToUse.pawn.collectedInterest;
        customerDebt = summaryToUse.pawn.oldDebt;
      } else {
        totalLoan = summaryToUse.credit.totalLoan; // This is "Đang cho vay" from profitSummary
        expectedProfit = summaryToUse.credit.profit;
        collectedProfit = summaryToUse.credit.collectedInterest;
        customerDebt = summaryToUse.credit.oldDebt;
      }
    }

    return {
      total: active + closed,
      active,
      closed,
      totalLoan,
      customerDebt,
      expectedProfit,
      collectedProfit
    };
  };

  // Fetch installment data (optimized version)
  const fetchInstallmentData = async (storeId: string, summaryData?: StoreSummary): Promise<ContractSummary> => {
    // Use database status for faster performance instead of calculating each status
    const { data: contracts, error } = await supabase
      .from('installments_by_store')
      .select('id, installment_amount, status_code')
      .eq('store_id', storeId);

    if (error) {
      console.error('Error fetching installments:', error);
      return {
        total: 0,
        active: 0,
        closed: 0,
        totalLoan: 0,
        customerDebt: 0,
        expectedProfit: 0,
        collectedProfit: 0
      };
    }

    // Count by database status for better performance (no individual status calculation)
    let active = 0;
    let closed = 0;

    (contracts || []).forEach(contract => {
      if (contract.status_code === 'CLOSED' || contract.status_code === 'FINISHED') {
        closed++;
      } else if (contract.status_code === 'ON_TIME' || contract.status_code === 'OVERDUE' || contract.status_code === 'LATE_INTEREST') {
        active++;
      }
    });

    // Get financial data from overview (already calculated correctly)
    let totalLoan = 0;
    let expectedProfit = 0;
    let collectedProfit = 0;
    let customerDebt = 0;

    const summaryToUse = summaryData || storeSummary;
    if (summaryToUse) {
      totalLoan = summaryToUse.installment.totalLoan; // This is "Đang cho vay" from profitSummary
      expectedProfit = summaryToUse.installment.profit;
      collectedProfit = summaryToUse.installment.collectedInterest;
      customerDebt = summaryToUse.installment.oldDebt;
    }

    return {
      total: active + closed,
      active,
      closed,
      totalLoan,
      customerDebt,
      expectedProfit,
      collectedProfit
    };
  };

  // Fetch transaction summaries
  const fetchTransactionSummaries = async () => {
    if (!currentStore?.id) return;

    try {
      const storeId = currentStore.id;

      // Fetch income transactions (credit_amount not null means income)
      const { data: incomeData, error: incomeError } = await supabase
        .from('transactions')
        .select('credit_amount')
        .eq('store_id', storeId)
        .not('credit_amount', 'is', null);

      // Fetch expense transactions (debit_amount not null means expense)
      const { data: expenseData, error: expenseError } = await supabase
        .from('transactions')
        .select('debit_amount')
        .eq('store_id', storeId)
        .not('debit_amount', 'is', null);

      if (incomeError) {
        console.error('Error fetching income data:', incomeError);
      }

      if (expenseError) {
        console.error('Error fetching expense data:', expenseError);
      }

      const totalIncome = (incomeData || []).reduce((sum, item) => sum + (item.credit_amount || 0), 0);
      const totalExpense = (expenseData || []).reduce((sum, item) => sum + (item.debit_amount || 0), 0);

      setTransactionSummary({
        totalIncome,
        totalExpense
      });
    } catch (err) {
      console.error('Error fetching transaction summaries:', err);
    }
  };

  // Load data on mount and when store changes
  useEffect(() => {
    fetchStoreData();
  }, [currentStore?.id]);

  if (!currentStore) {
    return (
      <Layout>
        <div className="flex items-center justify-center p-8">
          <p>Vui lòng chọn cửa hàng để xem chi tiết</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-full space-y-6">
        {/* Store Information Header */}
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Cửa hàng: {storeData?.name || currentStore.name}
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <span>Số điện thoại: {storeData?.phone || '0936363636'}</span>
              <span>Địa chỉ: {storeData?.address || ''}</span>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="text-red-700 py-2 bg-red-50 px-4 rounded-md" role="alert">
            <p>{error}</p>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Đang tải dữ liệu...</span>
          </div>
        )}

        {!isLoading && (
          <>
            {/* Top 4 Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Thông tin vốn */}
              <Card>
                <CardHeader className="bg-gray-50">
                  <CardTitle className="text-lg">Thông tin vốn</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Vốn đầu tư</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(storeData?.investment || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Quỹ tiền mặt</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(storeData?.cash_fund || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Tiền đang cho vay</TableCell>
                        <TableCell className="text-right font-medium">
                          {storeSummary ? formatCurrency(
                            storeSummary.pawn.totalLoan + 
                            storeSummary.credit.totalLoan + 
                            storeSummary.installment.totalLoan
                          ) : '0'}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Thông tin lãi phí */}
              <Card>
                <CardHeader className="bg-gray-50">
                  <CardTitle className="text-lg">Thông tin lãi phí</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Lãi phí dự kiến</TableCell>
                        <TableCell className="text-right font-medium">
                          {storeSummary ? formatCurrency(
                            storeSummary.pawn.profit + 
                            storeSummary.credit.profit + 
                            storeSummary.installment.profit
                          ) : '0'}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-red-600">Lãi phí đã thu</TableCell>
                        <TableCell className="text-right font-medium">
                          {storeSummary ? formatCurrency(
                            storeSummary.pawn.collectedInterest + 
                            storeSummary.credit.collectedInterest + 
                            storeSummary.installment.collectedInterest
                          ) : '0'}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Thông tin hợp đồng */}
              <Card>
                <CardHeader className="bg-gray-50">
                  <CardTitle className="text-lg">Thông tin hợp đồng</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Hợp đồng mở</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries ? (
                            contractSummaries.pawn.active + 
                            contractSummaries.credit.active + 
                            contractSummaries.installment.active
                          ) : 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Hợp đồng đóng</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries ? (
                            contractSummaries.pawn.closed + 
                            contractSummaries.credit.closed + 
                            contractSummaries.installment.closed
                          ) : 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Tổng số hợp đồng</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries ? (
                            contractSummaries.pawn.total + 
                            contractSummaries.credit.total + 
                            contractSummaries.installment.total
                          ) : 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-red-600">Tổng số hợp đồng nợ lãi phí</TableCell>
                        <TableCell className="text-right font-medium">0</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Thu / Chi */}
              <Card>
                <CardHeader className="bg-gray-50">
                  <CardTitle className="text-lg">Thu / Chi</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Chi tiêu</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(transactionSummary.totalExpense)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Thu bất thường</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(transactionSummary.totalIncome)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Số tiền rút từ lãi phí</TableCell>
                        <TableCell className="text-right font-medium">0</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-red-600">Tổng tiền khách nợ</TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {contractSummaries ? formatCurrency(
                            contractSummaries.pawn.customerDebt + 
                            contractSummaries.credit.customerDebt + 
                            contractSummaries.installment.customerDebt
                          ) : '0'}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Bottom 3 Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Tín chấp */}
              <Card>
                <CardHeader className="bg-blue-50">
                  <CardTitle className="text-lg">Tín chấp</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Số hợp đồng</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries?.credit.total || 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Hợp đồng đóng</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries?.credit.closed || 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Hợp đồng mở</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries?.credit.active || 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-red-600">Tiền cho vay</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contractSummaries?.credit.totalLoan || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Lãi phí dự kiến</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contractSummaries?.credit.expectedProfit || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Lãi phí đã thu</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contractSummaries?.credit.collectedProfit || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-red-600">Tiền khách nợ</TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {formatCurrency(contractSummaries?.credit.customerDebt || 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Trả góp */}
              <Card>
                <CardHeader className="bg-blue-50">
                  <CardTitle className="text-lg">Trả góp</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Số hợp đồng</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries?.installment.total || 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Hợp đồng đóng</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries?.installment.closed || 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Hợp đồng mở</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries?.installment.active || 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-red-600">Tiền cho vay</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contractSummaries?.installment.totalLoan || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Lãi phí dự kiến</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contractSummaries?.installment.expectedProfit || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Lãi phí đã thu</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contractSummaries?.installment.collectedProfit || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-red-600">Tiền khách nợ</TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {formatCurrency(contractSummaries?.installment.customerDebt || 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Cầm đồ */}
              <Card>
                <CardHeader className="bg-blue-50">
                  <CardTitle className="text-lg">Cầm đồ</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Số hợp đồng</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries?.pawn.total || 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Hợp đồng đóng</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries?.pawn.closed || 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Hợp đồng mở</TableCell>
                        <TableCell className="text-right font-medium">
                          {contractSummaries?.pawn.active || 0}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-red-600">Tiền cho vay</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contractSummaries?.pawn.totalLoan || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Lãi phí dự kiến</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contractSummaries?.pawn.expectedProfit || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Lãi phí đã thu</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contractSummaries?.pawn.collectedProfit || 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-red-600">Tiền khách nợ</TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {formatCurrency(contractSummaries?.pawn.customerDebt || 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
