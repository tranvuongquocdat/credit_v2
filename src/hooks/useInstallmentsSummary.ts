import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { InstallmentStatus } from '@/models/installment';
import { StoreFinancialData } from '@/lib/store';

export function useInstallmentsSummary() {
  const [data, setData] = useState<StoreFinancialData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Lấy tháng và năm hiện tại
      const now = new Date();
      const currentMonth = now.getMonth() + 1; // Tháng bắt đầu từ 0
      const currentYear = now.getFullYear();
      const firstDayOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const lastDayOfMonth = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
      
      // Lấy tất cả hợp đồng chưa bị xóa và chưa đóng
      const { data: activeInstallments, error: installmentsError } = await supabase
        .from('installments')
        .select(`
          id,
          contract_code,
          down_payment,
          installment_amount,
          status,
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
      
      if (installmentsError) {
        throw installmentsError;
      }
      
      // Lấy tất cả các kỳ đóng tiền trong tháng hiện tại
      const { data: currentMonthPayments, error: paymentsError } = await supabase
        .from('installment_payment_period')
        .select('*')
        .gte('date', firstDayOfMonth)
        .lte('date', lastDayOfMonth);
      
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
          if (oldDebt > 0) {
            totalOldDebt += oldDebt;
          }
          
          // Tính lãi phí đã thu: tiền đã đóng - tiền giao khách, nếu dương
          const profit = paidAmount - (installment.down_payment || 0);
          if (profit > 0) {
            collectedProfit += profit;
          }
          
          // Tính lãi phí dự kiến trong tháng
          const monthlyPayments = paymentsByInstallment.get(installment.id) || [];
          const monthlyExpectedAmount = monthlyPayments.reduce((sum: number, payment: any) => {
            return sum + (payment.expected_amount || 0);
          }, 0);
          
          // Lãi phí dự kiến = kỳ đóng tiền trong tháng - tiền giao khách (nếu dương)
          const expectedMonthlyProfit = Math.max(0, monthlyExpectedAmount - (installment.down_payment || 0));
          expectedProfit += expectedMonthlyProfit;
        });
      }
      
      const summaryData: StoreFinancialData = {
        totalFund: 0, // Để mặc định, sẽ lấy từ API khác nếu cần
        availableFund: 0, // Để mặc định, sẽ lấy từ API khác nếu cần
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

  useEffect(() => {
    fetchData();
  }, []);

  return { data, loading, error, refresh: fetchData };
} 