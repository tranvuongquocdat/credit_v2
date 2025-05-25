import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { InstallmentStatus } from '@/models/installment';
import { StoreFinancialData, getStoreFinancialData } from '@/lib/store';
import { useStore } from '@/contexts/StoreContext';

export function useInstallmentsSummary() {
  const [data, setData] = useState<StoreFinancialData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Get current store from context
  const { currentStore } = useStore();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First, get the store financial data for cash_fund
      const storeFinancialData = await getStoreFinancialData(currentStore?.id || '1');
      
      // Lấy tháng và năm hiện tại
      const now = new Date();
      const currentMonth = now.getMonth() + 1; // Tháng bắt đầu từ 0
      const currentYear = now.getFullYear();
      const firstDayOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const lastDayOfMonth = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
      
      // Lấy tất cả hợp đồng chưa bị xóa, chưa đóng và thuộc cửa hàng hiện tại
      let query = supabase
        .from('installments_by_store')
        .select(`
          id,
          contract_code,
          down_payment,
          installment_amount,
          status,
          store_id,
          installment_payment_period (
            id,
            period_number,
            date,
            expected_amount,
            actual_amount
          )
        `)
        .neq('status', InstallmentStatus.DELETED)
        .neq('status', InstallmentStatus.CLOSED);
      
      // Filter by store if a store is selected
      if (currentStore?.id) {
        query = query.eq('store_id', currentStore.id);
      }
      
      const { data: activeInstallments, error: installmentsError } = await query;
      
      if (installmentsError) {
        throw installmentsError;
      }
      
      // Lấy tất cả các kỳ đóng tiền trong tháng hiện tại
      let paymentsQuery = supabase
        .from('installment_payment_period')
        .select('*')
        .gte('date', firstDayOfMonth)
        .lte('date', lastDayOfMonth);
      
      // Filter by contracts from the current store
      if (activeInstallments && activeInstallments.length > 0) {
        const installmentIds = activeInstallments
          .map(inst => inst.id)
          .filter((id): id is string => id !== null);
        paymentsQuery = paymentsQuery.in('installment_id', installmentIds);
      } else {
        // No installments to check payments for
        setData(storeFinancialData);
        return;
      }
      
      const { data: currentMonthPayments, error: paymentsError } = await paymentsQuery;
      
      if (paymentsError) {
        throw paymentsError;
      }
      // Tính toán các giá trị theo yêu cầu
      let totalLoan = 0; // Tổng tiền giao khách
      let totalOldDebt = 0; // Tổng nợ cũ
      let expectedProfit = 0; // Lãi phí dự kiến
      let collectedProfit = 0; // Lãi phí đã thu
      
      // Map để lưu trữ kỳ thanh toán theo installment_id
      const paymentsByInstallment = new Map();
      if (currentMonthPayments) {
        currentMonthPayments.forEach(payment => {
          if (!paymentsByInstallment.has(payment.installment_id)) {
            paymentsByInstallment.set(payment.installment_id, []);
          }
          paymentsByInstallment.get(payment.installment_id).push(payment);
        });
      }
      
      if (activeInstallments) {
        // Tính tổng tiền cho vay (tiền giao khách)
        totalLoan = activeInstallments.reduce((sum: number, installment: any) => {
          return sum + (installment.down_payment || 0);
        }, 0);
        // Tính tiền nợ cũ và lãi phí đã thu
        activeInstallments.forEach(installment => {
          // Tính tổng tiền đã đóng được cho hợp đồng này
          const paidAmount = installment.installment_payment_period?.reduce((sum: number, period: any) => {
            return sum + (period.actual_amount || 0);
          }, 0) || 0;
          
          // Tính tổng tiền lãi dự kiến cho hợp đồng này
          const expectedAmount = installment.installment_payment_period?.reduce((sum: number, period: any) => {
            return sum + (period.expected_amount || 0);
          }, 0) || 0;
          
          // Tính nợ cũ: nếu đã đóng ít hơn dự kiến
          const oldDebt = expectedAmount - paidAmount;
          if (oldDebt < 0) {
            totalOldDebt += Math.abs(oldDebt);
          }
          
          // Tính lãi phí đã thu: cộng tất cả actual_amount của các kỳ đóng tiền của installment
          const profit = installment.installment_payment_period?.reduce((sum: number, period: any) => {
            return sum + (period.actual_amount || 0);
          }, 0) || 0;
          if (profit > 0) {
            collectedProfit += profit;
          }
          
          // Lãi phí dự kiến = kỳ đóng tiền trong tháng - tiền giao khách (nếu dương)
          expectedProfit += installment.installment_amount || 0;
          console.log("expectedMonthlyProfit", expectedProfit);
        });
      }
      
      const summaryData: StoreFinancialData = {
        // Use the cash_fund from the store financial data
        totalFund: storeFinancialData.availableFund || 0,
        availableFund: storeFinancialData.availableFund || 0,
        totalLoan: totalLoan,
        oldDebt: totalOldDebt,
        profit: expectedProfit,
        collectedInterest: collectedProfit
      };
      
      setData(summaryData);
    } catch (err) {
      console.error('Error fetching installment summary:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when component mounts or when store changes
  useEffect(() => {
    fetchData();
  }, [currentStore?.id]);

  return { data, loading, error, refresh: fetchData };
} 