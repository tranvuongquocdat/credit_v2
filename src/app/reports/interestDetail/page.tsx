'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { format, startOfDay, endOfDay, parse, subDays } from 'date-fns';
import { RefreshCw, FileSpreadsheet } from 'lucide-react';

// Import calculation functions
import { calculateCloseContractInterest as calculatePawnCloseInterest } from '@/lib/Pawns/calculate_close_contract_interest';
import { calculateCloseContractInterest as calculateCreditCloseInterest } from '@/lib/Credits/calculate_close_contract_interest';

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
import Link from 'next/link';

// Interface for interest detail data
interface InterestDetailItem {
  id: string;
  contractId: string;
  contractCode: string;
  customerName: string;
  itemName: string;
  loanAmount: number;
  transactionDate: string;
  transactionDateTime: string;
  interestAmount: number;
  otherAmount: number;
  totalAmount: number;
  transactionType: string;
  type: 'Cầm đồ' | 'Tín chấp' | 'Trả góp';
}

export default function InterestDetailPage() {
  const { currentStore } = useStore();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [interestDetails, setInterestDetails] = useState<InterestDetailItem[]>([]);
  
  // Date range for filtering - default to today only
  const today = new Date();
  const [startDate, setStartDate] = useState<string>(
    format(today, 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    format(today, 'yyyy-MM-dd')
  );
  
  // Filter states
  const [selectedContractType, setSelectedContractType] = useState<string>('all');

  // Function to fetch all data from a query with pagination
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

  // Calculate interest amount for contract close/reopen transactions
  const calculateInterestAmount = async (contractId: string, type: 'Cầm đồ' | 'Tín chấp', transactionDate: string): Promise<number> => {
    try {
      const calculationDate = format(new Date(transactionDate), 'yyyy-MM-dd');
      
      if (type === 'Cầm đồ') {
        return await calculatePawnCloseInterest(contractId, calculationDate);
      } else {
        return await calculateCreditCloseInterest(contractId, calculationDate);
      }
    } catch (error) {
      console.error(`Error calculating interest for ${type} contract ${contractId}:`, error);
      return 0;
    }
  };

  // Fetch interest detail data
  const fetchInterestDetails = async () => {
    if (!currentStore?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const storeId = currentStore.id;
      const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
      const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
      
      const startDateISO = startDateObj.toISOString();
      const endDateISO = endDateObj.toISOString();
      
      const allInterestDetails: InterestDetailItem[] = [];

      // Fetch pawn interest details
      if (selectedContractType === 'all' || selectedContractType === 'Cầm đồ') {
        // Fetch payment transactions (Đóng lãi and Huỷ đóng lãi)
        const pawnPaymentQuery = supabase
          .from('pawn_history')
          .select(`
            id,
            pawn_id,
            transaction_type,
            credit_amount,
            debit_amount,
            created_at,
            is_deleted,
            pawns!inner(
              id,
              contract_code,
              loan_amount,
              updated_at,
              customers(name),
              collateral_detail
            )
          `)
          .eq('pawns.store_id', storeId)
          .eq('transaction_type', 'payment');

        // Apply date filter for payment transactions
        const pawnPaymentData = await fetchAllData(
          pawnPaymentQuery.gte('created_at', startDateISO).lte('created_at', endDateISO)
        );

        // Process payment transactions
        for (const item of pawnPaymentData || []) {
          let itemName = '';
          try {
            if (item.pawns?.collateral_detail) {
              const detail = typeof item.pawns.collateral_detail === 'string' 
                ? JSON.parse(item.pawns.collateral_detail) 
                : item.pawns.collateral_detail;
              itemName = detail.name || '';
            }
          } catch (e) {
            console.error('Error parsing collateral_detail:', e);
          }

          const transactionDate = item.is_deleted ? item.pawns.updated_at : item.created_at;
          const interestAmount = item.is_deleted ? -(item.credit_amount || 0) : (item.credit_amount || 0);
          const transactionType = item.is_deleted ? 'Huỷ đóng lãi' : 'Đóng lãi';

          // Only include if transaction date is within range
          if (new Date(transactionDate) >= startDateObj && new Date(transactionDate) <= endDateObj) {
            allInterestDetails.push({
              id: `pawn-payment-${item.id}`,
              contractId: item.pawn_id,
              contractCode: item.pawns?.contract_code || '',
              customerName: item.pawns?.customers?.name || '',
              itemName,
              loanAmount: item.pawns?.loan_amount || 0,
              transactionDate: new Date(transactionDate).toLocaleString('vi-VN'),
              transactionDateTime: new Date(transactionDate).toLocaleString('vi-VN'),
              interestAmount,
              otherAmount: 0,
              totalAmount: interestAmount,
              transactionType,
              type: 'Cầm đồ'
            });
          }
        }

        // Fetch contract_close transactions (Chuộc đồ)
        const pawnCloseQuery = supabase
          .from('pawn_history')
          .select(`
            id,
            pawn_id,
            transaction_type,
            created_at,
            pawns!inner(
              id,
              contract_code,
              loan_amount,
              customers(name),
              collateral_detail
            )
          `)
          .eq('pawns.store_id', storeId)
          .eq('transaction_type', 'contract_close')
          .gte('created_at', startDateISO)
          .lte('created_at', endDateISO);

        const pawnCloseData = await fetchAllData(pawnCloseQuery);

        for (const item of pawnCloseData || []) {
          let itemName = '';
          try {
            if (item.pawns?.collateral_detail) {
              const detail = typeof item.pawns.collateral_detail === 'string' 
                ? JSON.parse(item.pawns.collateral_detail) 
                : item.pawns.collateral_detail;
              itemName = detail.name || '';
            }
          } catch (e) {
            console.error('Error parsing collateral_detail:', e);
          }

          const interestAmount = await calculateInterestAmount(item.pawn_id, 'Cầm đồ', item.created_at);

          allInterestDetails.push({
            id: `pawn-close-${item.id}`,
            contractId: item.pawn_id,
            contractCode: item.pawns?.contract_code || '',
            customerName: item.pawns?.customers?.name || '',
            itemName,
            loanAmount: item.pawns?.loan_amount || 0,
            transactionDate: new Date(item.created_at).toLocaleString('vi-VN'),
            transactionDateTime: new Date(item.created_at).toLocaleString('vi-VN'),
            interestAmount,
            otherAmount: 0,
            totalAmount: interestAmount,
            transactionType: 'Chuộc đồ',
            type: 'Cầm đồ'
          });
        }

        // Fetch contract_reopen transactions (Huỷ chuộc đồ)
        const pawnReopenQuery = supabase
          .from('pawn_history')
          .select(`
            id,
            pawn_id,
            transaction_type,
            created_at,
            pawns!inner(
              id,
              contract_code,
              loan_amount,
              customers(name),
              collateral_detail
            )
          `)
          .eq('pawns.store_id', storeId)
          .eq('transaction_type', 'contract_reopen')
          .gte('created_at', startDateISO)
          .lte('created_at', endDateISO);

        const pawnReopenData = await fetchAllData(pawnReopenQuery);

        for (const item of pawnReopenData || []) {
          let itemName = '';
          try {
            if (item.pawns?.collateral_detail) {
              const detail = typeof item.pawns.collateral_detail === 'string' 
                ? JSON.parse(item.pawns.collateral_detail) 
                : item.pawns.collateral_detail;
              itemName = detail.name || '';
            }
          } catch (e) {
            console.error('Error parsing collateral_detail:', e);
          }

          // Calculate interest amount as negative of contract close
          const interestAmount = -(await calculateInterestAmount(item.pawn_id, 'Cầm đồ', item.created_at));

          allInterestDetails.push({
            id: `pawn-reopen-${item.id}`,
            contractId: item.pawn_id,
            contractCode: item.pawns?.contract_code || '',
            customerName: item.pawns?.customers?.name || '',
            itemName,
            loanAmount: item.pawns?.loan_amount || 0,
            transactionDate: new Date(item.created_at).toLocaleString('vi-VN'),
            transactionDateTime: new Date(item.created_at).toLocaleString('vi-VN'),
            interestAmount,
            otherAmount: 0,
            totalAmount: interestAmount,
            transactionType: 'Huỷ chuộc đồ',
            type: 'Cầm đồ'
          });
        }

        // Fetch debt_payment transactions (Trả nợ)
        const pawnDebtQuery = supabase
          .from('pawn_history')
          .select(`
            id,
            pawn_id,
            transaction_type,
            debit_amount,
            created_at,
            pawns!inner(
              id,
              contract_code,
              loan_amount,
              customers(name),
              collateral_detail
            )
          `)
          .eq('pawns.store_id', storeId)
          .eq('transaction_type', 'debt_payment')
          .gte('created_at', startDateISO)
          .lte('created_at', endDateISO);

        const pawnDebtData = await fetchAllData(pawnDebtQuery);

        for (const item of pawnDebtData || []) {
          let itemName = '';
          try {
            if (item.pawns?.collateral_detail) {
              const detail = typeof item.pawns.collateral_detail === 'string' 
                ? JSON.parse(item.pawns.collateral_detail) 
                : item.pawns.collateral_detail;
              itemName = detail.name || '';
            }
          } catch (e) {
            console.error('Error parsing collateral_detail:', e);
          }

          const interestAmount = item.debit_amount || 0;

          allInterestDetails.push({
            id: `pawn-debt-${item.id}`,
            contractId: item.pawn_id,
            contractCode: item.pawns?.contract_code || '',
            customerName: item.pawns?.customers?.name || '',
            itemName,
            loanAmount: item.pawns?.loan_amount || 0,
            transactionDate: new Date(item.created_at).toLocaleString('vi-VN'),
            transactionDateTime: new Date(item.created_at).toLocaleString('vi-VN'),
            interestAmount,
            otherAmount: 0,
            totalAmount: interestAmount,
            transactionType: 'Trả nợ',
            type: 'Cầm đồ'
          });
        }
      }

      // Fetch credit interest details
      if (selectedContractType === 'all' || selectedContractType === 'Tín chấp') {
        // Fetch payment transactions (Đóng lãi and Huỷ đóng lãi)
        const creditPaymentQuery = supabase
          .from('credit_history')
          .select(`
            id,
            credit_id,
            transaction_type,
            credit_amount,
            debit_amount,
            created_at,
            updated_at,
            is_deleted,
            credits!inner(
              id,
              contract_code,
              loan_amount,
              customers(name)
            )
          `)
          .eq('credits.store_id', storeId)
          .eq('transaction_type', 'payment');

        const creditPaymentData = await fetchAllData(creditPaymentQuery);

        // Process payment transactions
        for (const item of creditPaymentData || []) {
          const transactionDate = item.is_deleted ? item.updated_at : item.created_at;
          const interestAmount = item.is_deleted ? -(item.credit_amount || 0) : (item.credit_amount || 0);
          const transactionType = item.is_deleted ? 'Huỷ đóng lãi' : 'Đóng lãi';

          // Only include if transaction date is within range
          if (new Date(transactionDate) >= startDateObj && new Date(transactionDate) <= endDateObj) {
            allInterestDetails.push({
              id: `credit-payment-${item.id}`,
              contractId: item.credit_id,
              contractCode: item.credits?.contract_code || '',
              customerName: item.credits?.customers?.name || '',
              itemName: 'Tín chấp',
              loanAmount: item.credits?.loan_amount || 0,
              transactionDate: new Date(transactionDate).toLocaleString('vi-VN'),
              transactionDateTime: new Date(transactionDate).toLocaleString('vi-VN'),
              interestAmount,
              otherAmount: 0,
              totalAmount: interestAmount,
              transactionType,
              type: 'Tín chấp'
            });
          }
        }

        // Fetch contract_close transactions (Đóng HĐ)
        const creditCloseQuery = supabase
          .from('credit_history')
          .select(`
            id,
            credit_id,
            transaction_type,
            created_at,
            credits!inner(
              id,
              contract_code,
              loan_amount,
              customers(name)
            )
          `)
          .eq('credits.store_id', storeId)
          .eq('transaction_type', 'contract_close')
          .gte('created_at', startDateISO)
          .lte('created_at', endDateISO);

        const creditCloseData = await fetchAllData(creditCloseQuery);

        for (const item of creditCloseData || []) {
          const interestAmount = await calculateInterestAmount(item.credit_id, 'Tín chấp', item.created_at);

          allInterestDetails.push({
            id: `credit-close-${item.id}`,
            contractId: item.credit_id,
            contractCode: item.credits?.contract_code || '',
            customerName: item.credits?.customers?.name || '',
            itemName: 'Tín chấp',
            loanAmount: item.credits?.loan_amount || 0,
            transactionDate: new Date(item.created_at).toLocaleString('vi-VN'),
            transactionDateTime: new Date(item.created_at).toLocaleString('vi-VN'),
            interestAmount,
            otherAmount: 0,
            totalAmount: interestAmount,
            transactionType: 'Đóng HĐ',
            type: 'Tín chấp'
          });
        }

        // Fetch contract_reopen transactions (Huỷ đóng HĐ)
        const creditReopenQuery = supabase
          .from('credit_history')
          .select(`
            id,
            credit_id,
            transaction_type,
            created_at,
            credits!inner(
              id,
              contract_code,
              loan_amount,
              customers(name)
            )
          `)
          .eq('credits.store_id', storeId)
          .eq('transaction_type', 'contract_reopen')
          .gte('created_at', startDateISO)
          .lte('created_at', endDateISO);

        const creditReopenData = await fetchAllData(creditReopenQuery);

        for (const item of creditReopenData || []) {
          // Calculate interest amount as negative of contract close
          const interestAmount = -(await calculateInterestAmount(item.credit_id, 'Tín chấp', item.created_at));

          allInterestDetails.push({
            id: `credit-reopen-${item.id}`,
            contractId: item.credit_id,
            contractCode: item.credits?.contract_code || '',
            customerName: item.credits?.customers?.name || '',
            itemName: 'Tín chấp',
            loanAmount: item.credits?.loan_amount || 0,
            transactionDate: new Date(item.created_at).toLocaleString('vi-VN'),
            transactionDateTime: new Date(item.created_at).toLocaleString('vi-VN'),
            interestAmount,
            otherAmount: 0,
            totalAmount: interestAmount,
            transactionType: 'Huỷ đóng HĐ',
            type: 'Tín chấp'
          });
        }

        // Fetch debt_payment transactions (Trả nợ)
        const creditDebtQuery = supabase
          .from('credit_history')
          .select(`
            id,
            credit_id,
            transaction_type,
            debit_amount,
            created_at,
            credits!inner(
              id,
              contract_code,
              loan_amount,
              customers(name)
            )
          `)
          .eq('credits.store_id', storeId)
          .eq('transaction_type', 'debt_payment')
          .gte('created_at', startDateISO)
          .lte('created_at', endDateISO);

        const creditDebtData = await fetchAllData(creditDebtQuery);

        for (const item of creditDebtData || []) {
          const interestAmount = item.debit_amount || 0;

          allInterestDetails.push({
            id: `credit-debt-${item.id}`,
            contractId: item.credit_id,
            contractCode: item.credits?.contract_code || '',
            customerName: item.credits?.customers?.name || '',
            itemName: 'Tín chấp',
            loanAmount: item.credits?.loan_amount || 0,
            transactionDate: new Date(item.created_at).toLocaleString('vi-VN'),
            transactionDateTime: new Date(item.created_at).toLocaleString('vi-VN'),
            interestAmount,
            otherAmount: 0,
            totalAmount: interestAmount,
            transactionType: 'Trả nợ',
            type: 'Tín chấp'
          });
        }
      }

      // Fetch installment interest details
      if (selectedContractType === 'all' || selectedContractType === 'Trả góp') {
        // Query installment_history with proper joins like in TransactionDetailsTable
        const installmentHistoryQuery = supabase
          .from('installment_history')
          .select(`
            *,
            installments!inner (
              id,
              contract_code,
              down_payment,
              installment_amount,
              employee_id,
              employees!inner (store_id),
              customers (name)
            )
          `)
          .eq('installments.employees.store_id', storeId)
          .eq('transaction_type', 'payment')
          .or('is_deleted.is.null,is_deleted.eq.false');

        const installmentHistoryData = await fetchAllData(installmentHistoryQuery);

        if (installmentHistoryData && installmentHistoryData.length > 0) {
          // Group by contract to calculate interest per contract
          const contractsMap = new Map<string, {
            contract: any;
            payments: Array<{
              id: string;
              credit_amount: number;
              transaction_date: string | null;
            }>;
          }>();
          
          installmentHistoryData.forEach((item: any) => {
            const contractId = item.installments?.id;
            if (!contractId) return;
            
            if (!contractsMap.has(contractId)) {
              contractsMap.set(contractId, {
                contract: item.installments,
                payments: []
              });
            }
            
            contractsMap.get(contractId)!.payments.push({
              id: item.id,
              credit_amount: item.credit_amount || 0,
              transaction_date: item.transaction_date
            });
          });

          // Process each contract
          for (const [contractId, contractData] of contractsMap) {
            const contract = contractData.contract;
            const payments = contractData.payments;
            
            if (!contract || !payments.length) continue;

            // Calculate total credit amount for this contract
            const totalCreditAmount = payments.reduce((sum, payment) => sum + payment.credit_amount, 0);
            const downPayment = contract.down_payment || 0;

            // Only include if total credit amount > down payment (means there's interest)
            if (totalCreditAmount > downPayment) {
              // Group by transaction_date to show only one row per date
              const transactionDates = [...new Set(payments.map(p => p.transaction_date?.split('T')[0]))].filter(Boolean) as string[];
              
              for (const transactionDateStr of transactionDates) {
                const dateTransactionTime = new Date(transactionDateStr + 'T00:00:00');
                
                // Only include transactions within our date range
                if (dateTransactionTime >= startDateObj && dateTransactionTime <= endDateObj) {
                  // Calculate cumulative credit amount up to and including this date
                  const cumulativeCreditAmount = payments
                    .filter(p => p.transaction_date && new Date(p.transaction_date).toDateString() <= dateTransactionTime.toDateString())
                    .reduce((sum: number, payment: any) => sum + payment.credit_amount, 0);
                  
                  // Only show interest if cumulative amount > down payment
                  if (cumulativeCreditAmount > downPayment) {
                    // For each date, show the total interest amount earned so far
                    const totalInterestAmount = cumulativeCreditAmount - downPayment;
                    
                    // Get the actual transaction time from payments on this date
                    const datePayments = payments.filter((p: any) => 
                      p.transaction_date && new Date(p.transaction_date).toDateString() === dateTransactionTime.toDateString()
                    );
                    const actualTransactionTime = datePayments.length > 0 && datePayments[0].transaction_date ? 
                      new Date(datePayments[0].transaction_date) : dateTransactionTime;
                    
                    allInterestDetails.push({
                      id: `installment-interest-${contractId}-${transactionDateStr}`,
                      contractId: contractId,
                      contractCode: contract.contract_code || '',
                      customerName: contract.customers?.name || '',
                      itemName: 'Trả góp',
                      loanAmount: contract.installment_amount || 0,
                      transactionDate: actualTransactionTime.toLocaleString('vi-VN'),
                      transactionDateTime: actualTransactionTime.toLocaleString('vi-VN'),
                      interestAmount: totalInterestAmount,
                      otherAmount: 0,
                      totalAmount: totalInterestAmount,
                      transactionType: 'Lãi họ',
                      type: 'Trả góp'
                    });
                  }
                }
              }
            }
          }
        }
      }

      // Sort by transaction date (newest first)
      allInterestDetails.sort((a, b) => new Date(b.transactionDateTime).getTime() - new Date(a.transactionDateTime).getTime());

      setInterestDetails(allInterestDetails);
    } catch (error) {
      console.error('Error fetching interest details:', error);
      setError('Có lỗi xảy ra khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Load data when component mounts or filters change
  useEffect(() => {
    fetchInterestDetails();
  }, [currentStore, startDate, endDate, selectedContractType]);

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
  };

  const handleRefresh = () => {
    fetchInterestDetails();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate totals
  const totalInterestAmount = interestDetails.reduce((sum, item) => sum + item.interestAmount, 0);
  const totalOtherAmount = interestDetails.reduce((sum, item) => sum + item.otherAmount, 0);
  const totalTotalAmount = interestDetails.reduce((sum, item) => sum + item.totalAmount, 0);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-blue-600">
              Báo cáo thu tiền lãi phí
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Contract Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Loại hình</label>
                <Select value={selectedContractType} onValueChange={setSelectedContractType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn loại hình" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="Cầm đồ">Cầm đồ</SelectItem>
                    <SelectItem value="Tín chấp">Tín chấp</SelectItem>
                    <SelectItem value="Trả góp">Trả góp</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Từ ngày</label>
                <DatePickerWithControls
                  value={startDate}
                  onChange={handleStartDateChange}
                  placeholder="Chọn ngày bắt đầu"
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Đến ngày</label>
                <DatePickerWithControls
                  value={endDate}
                  onChange={handleEndDateChange}
                  placeholder="Chọn ngày kết thúc"
                />
              </div>

              {/* Search Button */}
              <div className="space-y-2">
                <label className="text-sm font-medium">&nbsp;</label>
                <Button 
                  onClick={handleRefresh} 
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Tìm kiếm
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardContent className="p-0">
            {error && (
              <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
                {error}
              </div>
            )}
            
            {isLoading ? (
              <div className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
                <p className="text-gray-600">Đang tải dữ liệu...</p>
              </div>
            ) : (
              <div className="rounded-md border border-gray-200 overflow-auto">
                <Table className="border-collapse">
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-12">#</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Loại<br/>Hình</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Mã HĐ</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Khách hàng</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tên hàng</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tiền vay</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Ngày GD</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tiền lãi phí</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tiền khác</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tổng lãi phí</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Loại GD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interestDetails.length > 0 ? (
                      interestDetails.map((item, index) => (
                        <TableRow key={item.id} className="hover:bg-gray-50 transition-colors">
                          <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                            {index + 1}
                          </TableCell>
                          <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                            {item.type}
                          </TableCell>
                          <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                            <Link 
                              href={
                                item.type === 'Cầm đồ'
                                  ? `/pawns/${item.contractCode}`
                                  : item.type === 'Tín chấp'
                                    ? `/credits/${item.contractCode}`
                                    : `/installments/${item.contractCode}`
                              }
                              className="text-blue-600 hover:text-blue-800 underline"
                            >
                              {item.contractCode}
                            </Link>
                          </TableCell>
                          <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                            {item.customerName}
                          </TableCell>
                          <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                            {item.itemName}
                          </TableCell>
                          <TableCell className="py-2 px-3 text-right border-r border-b border-gray-200">
                            <span className="font-medium">{formatCurrency(item.loanAmount)}</span>
                          </TableCell>
                          <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                            {item.transactionDate}
                          </TableCell>
                          <TableCell className={`py-2 px-3 text-right border-r border-b border-gray-200 ${item.interestAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <span className="font-medium">
                              {item.interestAmount >= 0 ? '+' : ''}{formatCurrency(item.interestAmount)}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 px-3 text-right border-r border-b border-gray-200">
                            <span className="font-medium">{formatCurrency(item.otherAmount)}</span>
                          </TableCell>
                          <TableCell className={`py-2 px-3 text-right border-r border-b border-gray-200 font-medium ${item.totalAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {item.totalAmount >= 0 ? '+' : ''}{formatCurrency(item.totalAmount)}
                          </TableCell>
                          <TableCell className="py-2 px-3 border-b border-gray-200">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              item.transactionType === 'Đóng lãi' ? 'bg-green-100 text-green-800' :
                              item.transactionType === 'Huỷ đóng lãi' ? 'bg-red-100 text-red-800' :
                              item.transactionType === 'Chuộc đồ' || item.transactionType === 'Đóng HĐ' ? 'bg-blue-100 text-blue-800' :
                              item.transactionType === 'Huỷ chuộc đồ' || item.transactionType === 'Huỷ đóng HĐ' ? 'bg-orange-100 text-orange-800' :
                              item.transactionType === 'Lãi họ' ? 'bg-purple-100 text-purple-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {item.transactionType}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-gray-500 border-b border-gray-200">
                          Không có dữ liệu trong khoảng thời gian đã chọn
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  <TableFooter>
                    {/* Summary Row */}
                    {interestDetails.length > 0 && (
                      <TableRow className="bg-gray-50">
                        <TableCell colSpan={7} className="py-2 px-3 text-right font-bold text-lg border-r border-t border-gray-200">
                          TỔNG CỘNG
                        </TableCell>
                        <TableCell className={`py-2 px-3 text-right font-bold text-lg border-r border-t border-gray-200 ${totalInterestAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(totalInterestAmount)}
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right font-bold text-lg border-r border-t border-gray-200 text-green-600">
                          {formatCurrency(totalOtherAmount)}
                        </TableCell>
                        <TableCell className={`py-2 px-3 text-right font-bold text-lg border-r border-t border-gray-200 ${totalTotalAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(totalTotalAmount)}
                        </TableCell>
                        <TableCell className="py-2 px-3 border-t border-gray-200"></TableCell>
                      </TableRow>
                    )}
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
