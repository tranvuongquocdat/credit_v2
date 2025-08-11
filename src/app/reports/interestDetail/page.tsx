'use client';

import { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { format, startOfDay, endOfDay, parse, subDays } from 'date-fns';
import { RefreshCw, FileSpreadsheet } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';

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

// Import Excel Export component
import ExcelExport from './components/ExcelExport';

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

  // Debounce timer for data fetching
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Use permissions hook
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();
  
  // Check access permission
  const canAccessReport = hasPermission('chi_tiet_tien_lai');
  
  // Redirect if user doesn't have permission
  useEffect(() => {
    if (!permissionsLoading && !canAccessReport) {
      router.push('/');
    }
  }, [permissionsLoading, canAccessReport, router]);

  // Memoized fetch function to avoid unnecessary re-fetches
  const debouncedFetchData = useCallback(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    const timer = setTimeout(() => {
      fetchInterestDetails();
    }, 300); // 300ms debounce
    
    setDebounceTimer(timer);
  }, [startDate, endDate, selectedContractType, currentStore?.id]);

  // Effect to trigger debounced data fetching when filters change
  useEffect(() => {
    if (currentStore?.id && canAccessReport && !permissionsLoading) {
      debouncedFetchData();
    }
    
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [currentStore?.id, debouncedFetchData, canAccessReport, permissionsLoading]);

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

  // Optimized function to fetch data in chunks with better pagination
  const fetchDataOptimized = async (query: any, pageSize: number = 2000) => {
    const { data, error, count } = await query
      .range(0, pageSize - 1)
      .order('created_at', { ascending: false }); // Add ordering for consistent results
    
    if (error) {
      console.error('Error fetching data:', error);
      return [];
    }

    return data || [];
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

      // Create parallel query promises based on selected contract type
      const queryPromises: Promise<void>[] = [];

      // Pawn interest details - run all pawn queries in parallel
      if (selectedContractType === 'all' || selectedContractType === 'Cầm đồ') {
        const pawnQueries = [
          // Payment transactions query - get ALL payment records with updated_at for cancel tracking
          supabase
            .from('pawn_history')
            .select(`
              id,
              pawn_id,
              transaction_type,
              credit_amount,
              debit_amount,
              created_at,
              updated_at,
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
            .eq('transaction_type', 'payment'),

          // Contract close transactions query - get ALL records with updated_at for cancel tracking
          supabase
            .from('pawn_history')
            .select(`
              id,
              pawn_id,
              transaction_type,
              created_at,
              updated_at,
              is_deleted,
              pawns!inner(
                id,
                contract_code,
                loan_amount,
                customers(name),
                collateral_detail
              )
            `)
            .eq('pawns.store_id', storeId)
            .eq('transaction_type', 'contract_close'),

          // Contract reopen transactions query - get ALL records with updated_at for cancel tracking
          supabase
            .from('pawn_history')
            .select(`
              id,
              pawn_id,
              transaction_type,
              created_at,
              updated_at,
              is_deleted,
              pawns!inner(
                id,
                contract_code,
                loan_amount,
                customers(name),
                collateral_detail
              )
            `)
            .eq('pawns.store_id', storeId)
            .eq('transaction_type', 'contract_reopen'),

          // Debt payment transactions query
          supabase
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
            .lte('created_at', endDateISO)
        ];

        // Execute all pawn queries in parallel
        queryPromises.push(
          Promise.all([
            fetchAllData(pawnQueries[0]), // Get ALL payment records, not just in date range
            fetchAllData(pawnQueries[1]),
            fetchAllData(pawnQueries[2]),
            fetchAllData(pawnQueries[3])
          ]).then(async ([pawnPaymentData, pawnCloseData, pawnReopenData, pawnDebtData]) => {
            // Process payment transactions - show both original and cancelled payments
            // PAWN LOGIC: Show original payments and cancelled payments (as separate "Huỷ đóng lãi" records)
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

              // Always add original payment record (positive amount) if within date range
              if (new Date(item.created_at) >= startDateObj && new Date(item.created_at) <= endDateObj) {
                allInterestDetails.push({
                  id: `pawn-payment-${item.id}`,
                  contractId: item.pawn_id,
                  contractCode: item.pawns?.contract_code || '',
                  customerName: item.pawns?.customers?.name || '',
                  itemName,
                  loanAmount: item.pawns?.loan_amount || 0,
                  transactionDate: new Date(item.created_at).toLocaleString('vi-VN'),
                  transactionDateTime: new Date(item.created_at).toLocaleString('vi-VN'),
                  interestAmount: item.credit_amount || 0,
                  otherAmount: 0,
                  totalAmount: item.credit_amount || 0,
                  transactionType: 'Đóng lãi',
                  type: 'Cầm đồ'
                });
              }

              // If payment is cancelled (is_deleted = true), add separate cancel record
              if (item.is_deleted && item.updated_at) {
                const cancelDate = new Date(item.updated_at);
                if (cancelDate >= startDateObj && cancelDate <= endDateObj) {
                  allInterestDetails.push({
                    id: `pawn-payment-cancel-${item.id}`,
                    contractId: item.pawn_id,
                    contractCode: item.pawns?.contract_code || '',
                    customerName: item.pawns?.customers?.name || '',
                    itemName,
                    loanAmount: item.pawns?.loan_amount || 0,
                    transactionDate: cancelDate.toLocaleString('vi-VN'),
                    transactionDateTime: cancelDate.toLocaleString('vi-VN'),
                    interestAmount: -(item.credit_amount || 0),
                    otherAmount: 0,
                    totalAmount: -(item.credit_amount || 0),
                    transactionType: 'Huỷ đóng lãi',
                    type: 'Cầm đồ'
                  });
                }
              }
            }

            // Process contract close transactions in parallel
            const closePromises = (pawnCloseData || []).filter(item => 
              new Date(item.created_at) >= startDateObj && new Date(item.created_at) <= endDateObj
            ).map(async (item) => {
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

              return {
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
                type: 'Cầm đồ' as const
              };
            });

            // Process contract close cancel transactions (if cancelled)
            const closeCancelPromises = (pawnCloseData || []).filter(item => 
              item.is_deleted && item.updated_at &&
              new Date(item.updated_at) >= startDateObj && new Date(item.updated_at) <= endDateObj
            ).map(async (item) => {
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

              const interestAmount = -(await calculateInterestAmount(item.pawn_id, 'Cầm đồ', item.created_at));

              return {
                id: `pawn-close-cancel-${item.id}`,
                contractId: item.pawn_id,
                contractCode: item.pawns?.contract_code || '',
                customerName: item.pawns?.customers?.name || '',
                itemName,
                loanAmount: item.pawns?.loan_amount || 0,
                transactionDate: new Date(item.updated_at).toLocaleString('vi-VN'),
                transactionDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
                interestAmount,
                otherAmount: 0,
                totalAmount: interestAmount,
                transactionType: 'Huỷ chuộc đồ',
                type: 'Cầm đồ' as const
              };
            });

            // Process contract reopen transactions in parallel
            const reopenPromises = (pawnReopenData || []).filter(item => 
              new Date(item.created_at) >= startDateObj && new Date(item.created_at) <= endDateObj
            ).map(async (item) => {
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

              return {
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
                type: 'Cầm đồ' as const
              };
            });

            // Process contract reopen cancel transactions (if cancelled)
            const reopenCancelPromises = (pawnReopenData || []).filter(item => 
              item.is_deleted && item.updated_at &&
              new Date(item.updated_at) >= startDateObj && new Date(item.updated_at) <= endDateObj
            ).map(async (item) => {
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

              // Calculate interest amount as positive (reverse of reopen)
              const interestAmount = await calculateInterestAmount(item.pawn_id, 'Cầm đồ', item.created_at);

              return {
                id: `pawn-reopen-cancel-${item.id}`,
                contractId: item.pawn_id,
                contractCode: item.pawns?.contract_code || '',
                customerName: item.pawns?.customers?.name || '',
                itemName,
                loanAmount: item.pawns?.loan_amount || 0,
                transactionDate: new Date(item.updated_at).toLocaleString('vi-VN'),
                transactionDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
                interestAmount,
                otherAmount: 0,
                totalAmount: interestAmount,
                transactionType: 'Chuộc đồ',
                type: 'Cầm đồ' as const
              };
            });

            // Process debt payment transactions
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

            // Wait for all parallel interest calculations to complete
            const [closeResults, closeCancelResults, reopenResults, reopenCancelResults] = await Promise.all([
              Promise.all(closePromises),
              Promise.all(closeCancelPromises),
              Promise.all(reopenPromises),
              Promise.all(reopenCancelPromises)
            ]);

            allInterestDetails.push(...closeResults, ...closeCancelResults, ...reopenResults, ...reopenCancelResults);
          })
        );
      }

      // Credit interest details - run all credit queries in parallel
      if (selectedContractType === 'all' || selectedContractType === 'Tín chấp') {
        const creditQueries = [
          // Payment transactions query
          supabase
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
            .eq('transaction_type', 'payment'),

          // Contract close transactions query - get ALL records with updated_at for cancel tracking
          supabase
            .from('credit_history')
            .select(`
              id,
              credit_id,
              transaction_type,
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
            .eq('transaction_type', 'contract_close'),

          // Contract reopen transactions query - get ALL records with updated_at for cancel tracking
          supabase
            .from('credit_history')
            .select(`
              id,
              credit_id,
              transaction_type,
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
            .eq('transaction_type', 'contract_reopen'),

          // Debt payment transactions query
          supabase
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
            .lte('created_at', endDateISO)
        ];

        // Execute all credit queries in parallel
        queryPromises.push(
          Promise.all([
            fetchAllData(creditQueries[0]), // Get ALL payment records, not just in date range
            fetchAllData(creditQueries[1]),
            fetchAllData(creditQueries[2]),
            fetchAllData(creditQueries[3])
          ]).then(async ([creditPaymentData, creditCloseData, creditReopenData, creditDebtData]) => {
            // Process payment transactions - separate original and cancel records
            // CREDIT LOGIC: Show both original payments and cancelled payments (as separate "Huỷ đóng lãi" records)
            for (const item of creditPaymentData || []) {
              // Always add original payment record (positive amount)
              if (new Date(item.created_at) >= startDateObj && new Date(item.created_at) <= endDateObj) {
                allInterestDetails.push({
                  id: `credit-payment-${item.id}`,
                  contractId: item.credit_id,
                  contractCode: item.credits?.contract_code || '',
                  customerName: item.credits?.customers?.name || '',
                  itemName: 'Tín chấp',
                  loanAmount: item.credits?.loan_amount || 0,
                  transactionDate: new Date(item.created_at).toLocaleString('vi-VN'),
                  transactionDateTime: new Date(item.created_at).toLocaleString('vi-VN'),
                  interestAmount: item.credit_amount || 0,
                  otherAmount: 0,
                  totalAmount: item.credit_amount || 0,
                  transactionType: 'Đóng lãi',
                  type: 'Tín chấp'
                });
              }

              // If payment is cancelled (is_deleted = true), add separate cancel record
              if (item.is_deleted && item.updated_at) {
                const cancelDate = new Date(item.updated_at);
                if (cancelDate >= startDateObj && cancelDate <= endDateObj) {
                  allInterestDetails.push({
                    id: `credit-payment-cancel-${item.id}`,
                    contractId: item.credit_id,
                    contractCode: item.credits?.contract_code || '',
                    customerName: item.credits?.customers?.name || '',
                    itemName: 'Tín chấp',
                    loanAmount: item.credits?.loan_amount || 0,
                    transactionDate: cancelDate.toLocaleString('vi-VN'),
                    transactionDateTime: cancelDate.toLocaleString('vi-VN'),
                    interestAmount: -(item.credit_amount || 0),
                    otherAmount: 0,
                    totalAmount: -(item.credit_amount || 0),
                    transactionType: 'Huỷ đóng lãi',
                    type: 'Tín chấp'
                  });
                }
              }
            }

            // Process contract close transactions in parallel
            const closePromises = (creditCloseData || []).filter(item => 
              new Date(item.created_at) >= startDateObj && new Date(item.created_at) <= endDateObj
            ).map(async (item) => {
              const interestAmount = await calculateInterestAmount(item.credit_id, 'Tín chấp', item.created_at);

              return {
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
                type: 'Tín chấp' as const
              };
            });

            // Process contract close cancel transactions (if cancelled)
            const closeCancelPromises = (creditCloseData || []).filter(item => 
              item.is_deleted && item.updated_at &&
              new Date(item.updated_at) >= startDateObj && new Date(item.updated_at) <= endDateObj
            ).map(async (item) => {
              const interestAmount = -(await calculateInterestAmount(item.credit_id, 'Tín chấp', item.created_at));

              return {
                id: `credit-close-cancel-${item.id}`,
                contractId: item.credit_id,
                contractCode: item.credits?.contract_code || '',
                customerName: item.credits?.customers?.name || '',
                itemName: 'Tín chấp',
                loanAmount: item.credits?.loan_amount || 0,
                transactionDate: new Date(item.updated_at).toLocaleString('vi-VN'),
                transactionDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
                interestAmount,
                otherAmount: 0,
                totalAmount: interestAmount,
                transactionType: 'Huỷ đóng HĐ',
                type: 'Tín chấp' as const
              };
            });

            // Process contract reopen transactions in parallel  
            const reopenPromises = (creditReopenData || []).filter(item => 
              new Date(item.created_at) >= startDateObj && new Date(item.created_at) <= endDateObj
            ).map(async (item) => {
              // Calculate interest amount as negative of contract close
              const interestAmount = -(await calculateInterestAmount(item.credit_id, 'Tín chấp', item.created_at));

              return {
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
                type: 'Tín chấp' as const
              };
            });

            // Process contract reopen cancel transactions (if cancelled)
            const reopenCancelPromises = (creditReopenData || []).filter(item => 
              item.is_deleted && item.updated_at &&
              new Date(item.updated_at) >= startDateObj && new Date(item.updated_at) <= endDateObj
            ).map(async (item) => {
              // Calculate interest amount as positive (reverse of reopen)
              const interestAmount = await calculateInterestAmount(item.credit_id, 'Tín chấp', item.created_at);

              return {
                id: `credit-reopen-cancel-${item.id}`,
                contractId: item.credit_id,
                contractCode: item.credits?.contract_code || '',
                customerName: item.credits?.customers?.name || '',
                itemName: 'Tín chấp',
                loanAmount: item.credits?.loan_amount || 0,
                transactionDate: new Date(item.updated_at).toLocaleString('vi-VN'),
                transactionDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
                interestAmount,
                otherAmount: 0,
                totalAmount: interestAmount,
                transactionType: 'Đóng HĐ',
                type: 'Tín chấp' as const
              };
            });

            // Process debt payment transactions
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

            // Wait for all parallel interest calculations to complete
            const [closeResults, closeCancelResults, reopenResults, reopenCancelResults] = await Promise.all([
              Promise.all(closePromises),
              Promise.all(closeCancelPromises),
              Promise.all(reopenPromises),
              Promise.all(reopenCancelPromises)
            ]);

            allInterestDetails.push(...closeResults, ...closeCancelResults, ...reopenResults, ...reopenCancelResults);
          })
        );
      }

      // Installment interest details
      if (selectedContractType === 'all' || selectedContractType === 'Trả góp') {
        queryPromises.push(
          fetchAllData(
            supabase
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
              .or('is_deleted.is.null,is_deleted.eq.false')
          ).then((installmentHistoryData) => {
            if (installmentHistoryData && installmentHistoryData.length > 0) {
              // Group by contract to calculate interest per contract (as-of selected end date)
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

              // For each contract, compute cumulative interest up to the selected end date and output a single row
              for (const [contractId, contractData] of contractsMap) {
                const contract = contractData.contract;
                const payments = contractData.payments;
                if (!contract || payments.length === 0) continue;

                const downPayment = contract.down_payment || 0;

                // Sum all credits up to endDate (inclusive)
                const cumulativeCreditAmount = payments
                  .filter(p => p.transaction_date && new Date(p.transaction_date) <= endDateObj)
                  .reduce((sum: number, p: any) => sum + (p.credit_amount || 0), 0);

                const totalInterestAmount = Math.max(0, cumulativeCreditAmount - downPayment);

                // Only include if there is some interest collected
                if (totalInterestAmount > 0) {
                  const asOfTime = new Date(endDateObj);

                  allInterestDetails.push({
                    id: `installment-interest-${contractId}-${format(asOfTime, 'yyyy-MM-dd')}`,
                    contractId: contractId,
                    contractCode: contract.contract_code || '',
                    customerName: contract.customers?.name || '',
                    itemName: 'Trả góp',
                    loanAmount: contract.installment_amount || 0,
                    transactionDate: asOfTime.toLocaleString('vi-VN'),
                    transactionDateTime: asOfTime.toLocaleString('vi-VN'),
                    interestAmount: totalInterestAmount,
                    otherAmount: 0,
                    totalAmount: totalInterestAmount,
                    transactionType: 'Lãi họ',
                    type: 'Trả góp'
                  });
                }
              }
            }
          })
        );
      }

      // Wait for all queries to complete in parallel
      await Promise.all(queryPromises);

      // Group and aggregate data by contract, date, and transaction type
      const groupedData = new Map<string, InterestDetailItem>();

      allInterestDetails.forEach(item => {
        // Create grouping key: contractId + date (without time) + transactionType
        const transactionDate = new Date(item.transactionDateTime).toDateString();
        const groupKey = `${item.contractId}-${transactionDate}-${item.transactionType}`;
        
        if (groupedData.has(groupKey)) {
          const existingItem = groupedData.get(groupKey)!;
          
          // Aggregate amounts
          existingItem.interestAmount += item.interestAmount;
          existingItem.otherAmount += item.otherAmount;
          existingItem.totalAmount += item.totalAmount;
          
          // Use the latest transaction time
          if (new Date(item.transactionDateTime) > new Date(existingItem.transactionDateTime)) {
            existingItem.transactionDate = item.transactionDate;
            existingItem.transactionDateTime = item.transactionDateTime;
          }
        } else {
          // Create new grouped item
          groupedData.set(groupKey, { ...item });
        }
      });

      // Convert map back to array and sort by transaction date (newest first)
      const aggregatedDetails = Array.from(groupedData.values());
      aggregatedDetails.sort((a, b) => new Date(b.transactionDateTime).getTime() - new Date(a.transactionDateTime).getTime());

      setInterestDetails(aggregatedDetails);
    } catch (error) {
      console.error('Error fetching interest details:', error);
      setError('Có lỗi xảy ra khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

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
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold text-blue-600">
                Báo cáo thu tiền lãi phí
              </CardTitle>
              <ExcelExport 
                data={interestDetails}
                storeId={currentStore?.id}
                startDate={startDate}
                endDate={endDate}
                storeName={currentStore?.name || 'Unknown'}
                selectedContractType={selectedContractType}
              />
            </div>
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
                              item.transactionType === 'Huỷ chuộc đồ' || item.transactionType === 'Huỷ đóng HĐ' ? 'bg-red-100 text-red-800' :
                              item.transactionType === 'Lãi họ' ? 'bg-purple-100 text-purple-800' :
                              item.transactionType === 'Trả nợ' ? 'bg-yellow-100 text-yellow-800' :
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
