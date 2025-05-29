import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditStatus } from '@/models/credit';
import { useStore } from '@/contexts/StoreContext';

// Định nghĩa interface cho dữ liệu tài chính của cửa hàng
export interface StoreFinancialData {
  totalFund: number;       // Tổng vốn đầu tư
  availableFund: number;   // Quỹ tiền mặt khả dụng
  totalLoan: number;       // Tổng tiền cho vay
  oldDebt: number;         // Tổng nợ cũ
  profit: number;          // Lợi nhuận dự kiến trong tháng
  collectedInterest: number; // Lãi phí đã thu
}

export function useCreditsSummary() {
  const [financialData, setFinancialData] = useState<StoreFinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentStore } = useStore();
  
  const fetchFinancialData = async () => {
    try {
      setLoading(true);
      
      // 1. Lấy thông tin cơ bản từ store
      const storeId = currentStore?.id || '1';
      const { data: storeData } = await supabase
        .from('stores')
        .select('investment, cash_fund')
        .eq('id', storeId)
        .single();
      
      // Get credits for interest calculation
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      // 2. Lấy tổng tiền cho vay (tổng loan_amount của các hợp đồng đang vay)
      const { data: activeCreditsData, error: activeCreditsError } = await supabase
        .from('credits')
        .select('loan_amount')
        .in('status', [CreditStatus.ON_TIME, CreditStatus.OVERDUE, CreditStatus.LATE_INTEREST, CreditStatus.BAD_DEBT]);
      
      if (activeCreditsError) {
        console.error('Lỗi khi lấy dữ liệu hợp đồng đang hoạt động:', activeCreditsError);
      }
      
      // Tính tổng tiền cho vay
      const totalLoan = activeCreditsData?.reduce((sum, credit) => sum + (credit.loan_amount || 0), 0) || 0;
      
      // 3. Lấy tổng tiền nợ cũ
      const { data: oldDebtData, error: oldDebtError } = await supabase
        .from('credits')
        .select('debt_amount')
        .in('status', [CreditStatus.ON_TIME, CreditStatus.OVERDUE, CreditStatus.LATE_INTEREST, CreditStatus.BAD_DEBT]);
      
      if (oldDebtError) {
        console.error('Lỗi khi lấy dữ liệu nợ cũ:', oldDebtError);
      }
      
      // Tính tổng tiền nợ cũ sử dụng trường debt_amount
      const oldDebt = oldDebtData?.reduce((sum, credit) => sum + (credit.debt_amount || 0), 0) || 0;
      
      // 4. Lấy tổng lãi phí đã thu (sửa đổi công thức tính)
      // Lấy tất cả các hợp đồng (bao gồm cả đang vay và đã đóng)
      const { data: allCredits, error: allCreditsError } = await supabase
        .from('credits')
        .select('id, loan_amount');
      
      if (allCreditsError) {
        console.error('Lỗi khi lấy dữ liệu tất cả hợp đồng:', allCreditsError);
      }
      
      // Tính tổng lãi phí đã thu từ lịch sử giao dịch (credit_amount_history)
      let collectedInterest = 0;
      
      if (allCredits && allCredits.length > 0) {
        // Xử lý từng hợp đồng
        for (const credit of allCredits) {
          // Lấy lịch sử giao dịch của hợp đồng
          const { data: historyData, error: historyError } = await supabase
            .from('credit_amount_history')
            .select('*')
            .eq('credit_id', credit.id)
            .in('transaction_type', [
              'payment', // đóng lãi
              'payment_cancel', // hủy đóng lãi
              'contract_close', // đóng hợp đồng
            ]);
          
          if (historyError) {
            console.error(`Lỗi khi lấy lịch sử giao dịch cho hợp đồng ${credit.id}:`, historyError);
            continue;
          }
          
          if (!historyData || historyData.length === 0) {
            continue;
          }
          // Tính tổng credit_amount và debit_amount
          const totalCredit = historyData.reduce((sum, record) => sum + (record.credit_amount || 0), 0);
          const totalDebit = historyData.reduce((sum, record) => sum + (record.debit_amount || 0), 0);
          console.log(totalCredit, totalDebit);
          // Tổng số tiền thực thu = tổng credit - tổng debit
          const totalCollected = totalCredit - totalDebit;
          console.log(totalCollected);
          // Lãi phí thu được = tổng thu - tiền gốc
          // Chỉ tính lãi nếu tổng thu lớn hơn tiền gốc
          if (totalCollected > credit.loan_amount) {
            const interestForThisCredit = totalCollected - credit.loan_amount;
            collectedInterest += interestForThisCredit;
          }
        }
      }
      
      // 5. Lấy dữ liệu credits đang hoạt động để tính lãi dự kiến trong tháng này
      const { data: activeCredits, error: expectedInterestError } = await supabase
        .from('credits')
        .select(`
          id, 
          loan_amount, 
          interest_type, 
          interest_value, 
          loan_period,
          interest_period,
          interest_ui_type,
          interest_notation,
          loan_date,
          status
        `)
        .in('status', [CreditStatus.ON_TIME, CreditStatus.OVERDUE, CreditStatus.LATE_INTEREST, CreditStatus.BAD_DEBT])
        .lte('loan_date', lastDayOfMonth.toISOString());
      
      if (expectedInterestError) {
        console.error('Lỗi khi lấy dữ liệu tín dụng đang hoạt động:', expectedInterestError);
      }
      
      // Tính tổng lãi phí dự kiến trong tháng này
      let monthlyInterestAmount = 0;
      
      if (activeCredits) {
        monthlyInterestAmount = activeCredits.reduce((total, credit) => {
          let interestPerMonth = 0;
          
          // Đã vay được bao nhiêu ngày
          const loanDate = new Date(credit.loan_date);
          const daysSinceLoan = Math.max(0, Math.floor((today.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24)));
          
          // Không tính nếu khoản vay bắt đầu sau tháng này
          if (loanDate > lastDayOfMonth) return total;
          
          // Kiểm tra credit còn trong thời hạn vay không
          const isWithinLoanPeriod = daysSinceLoan <= credit.loan_period;
          if (!isWithinLoanPeriod) return total;
          
          // Tính toán lãi dựa trên loại lãi và cách tính
          switch (credit.interest_ui_type) {
            case 'daily':
              // Số ngày trong tháng này mà khoản vay đang hoạt động
              const daysInMonth = Math.min(
                lastDayOfMonth.getDate(),
                credit.loan_period - (daysSinceLoan - today.getDate())
              );
              
              if (credit.interest_notation === 'k_per_million') {
                // k/triệu/ngày
                interestPerMonth = (credit.loan_amount / 1000000) * credit.interest_value * daysInMonth * 1000;
              } else if (credit.interest_notation === 'k_per_day') {
                // k/ngày
                interestPerMonth = credit.interest_value * daysInMonth * 1000;
              }
              break;
              
            case 'monthly_30':
            case 'monthly_custom':
              if (credit.interest_notation === 'percent_per_month') {
                // %/tháng
                const monthlyRate = credit.interest_value / 100;
                interestPerMonth = credit.loan_amount * monthlyRate;
              }
              break;
              
            case 'weekly_percent':
              if (credit.interest_notation === 'percent_per_week') {
                // %/tuần
                const weeklyRate = credit.interest_value / 100;
                // Số tuần trong tháng này (xấp xỉ 4.35 tuần/tháng)
                const weeksInMonth = 4.35;
                interestPerMonth = credit.loan_amount * weeklyRate * weeksInMonth;
              }
              break;
              
            case 'weekly_k':
              if (credit.interest_notation === 'k_per_week') {
                // k/tuần
                // Số tuần trong tháng này (xấp xỉ 4.35 tuần/tháng)
                const weeksInMonth = 4.35;
                interestPerMonth = credit.interest_value * weeksInMonth * 1000;
              }
              break;
          }
          
          return total + interestPerMonth;
        }, 0);
      }
      
      // Sử dụng monthlyInterestAmount làm profit
      const profit = Math.round(monthlyInterestAmount);
      
      // 6. Tổng hợp dữ liệu
      const financialSummary: StoreFinancialData = {
        totalFund: storeData?.investment || 0,
        availableFund: storeData?.cash_fund || 0,
        totalLoan: totalLoan,
        oldDebt: oldDebt,
        profit: profit,
        collectedInterest: collectedInterest
      };
      
      setFinancialData(financialSummary);
    } catch (error) {
      console.error('Lỗi khi lấy dữ liệu tài chính:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchFinancialData();
  }, [currentStore?.id]);
  
  return { data: financialData, loading, refresh: fetchFinancialData };
} 