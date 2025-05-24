'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { CreditWithCustomer, InterestType, Credit } from '@/models/credit';
import { CreditPaymentPeriod } from '@/models/credit-payment';
import { getCreditPaymentPeriods, savePaymentWithOtherAmount } from '@/lib/credit-payment';
import { getInterestDisplayString, calculateInterestAmount as calculateInterestForPeriod, calculateInterestWithPrincipalChanges, PrincipalChange } from '@/lib/interest-calculator';
import { addPrincipalRepayment, updateCreditPrincipal } from '@/lib/principal-repayment';
import { addAdditionalLoan, updateCreditWithAdditionalLoan } from '@/lib/additional-loan';
import { addExtension, updateCreditEndDate } from '@/lib/extension';
import { CreditActionTabs, DEFAULT_CREDIT_TABS, TabId } from './CreditActionTabs';
import { AdditionalLoanTab, BadCreditTab, CloseTab, DocumentsTab, ExtensionTab, PaymentTab, PrincipalRepaymentTab } from './tabs';
import { getCreditById } from '@/lib/credit';
import { getPrincipalChangesForCredit } from '@/lib/credit-principal-changes';
import { CreditAmountHistory, CreditTransactionType, getCreditAmountHistory } from '@/lib/credit-amount-history';


interface PaymentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  credit: CreditWithCustomer;
}

export function PaymentHistoryModal({
  isOpen,
  onClose,
  credit: initialCredit
}: PaymentHistoryModalProps) {
  // Properly declare the variables to fix TypeScript errors
  const [credit, setCredit] = useState<CreditWithCustomer>(initialCredit);
  const creditId = credit?.id || '';
  const [paymentPeriods, setPaymentPeriods] = useState<CreditPaymentPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('payment'); // Tab mặc định là "Đóng lãi phí"
  const [showPaymentForm, setShowPaymentForm] = useState(false); // Hiển thị form đóng lãi phí
  const [refreshRepayments, setRefreshRepayments] = useState(0); // Counter để refresh danh sách trả bớt gốc
  const [refreshAdditionalLoans, setRefreshAdditionalLoans] = useState(0); // Counter để refresh danh sách vay thêm
  const [principalChanges, setPrincipalChanges] = useState<PrincipalChange[]>([]);
  const [creditHistory, setCreditHistory] = useState<CreditAmountHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // State cho modal nhập tiền khách trả
  const [showPaymentInput, setShowPaymentInput] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [otherAmount, setOtherAmount] = useState<number>(0);
  
  // Cập nhật state credit khi initialCredit thay đổi
  useEffect(() => {
    setCredit(initialCredit);
  }, [initialCredit]);

  // Hàm reload thông tin hợp đồng
  const reloadCreditInfo = async () => {
    if (!credit?.id) return;
    
    try {
      const { data, error } = await getCreditById(credit.id);
      
      if (error) {
        throw error;
      }
      
      if (data) {
        setCredit(data);
      }
    } catch (err) {
      console.error('Error reloading credit info:', err);
    }
  };

  // Load credit amount history when tab changes to history or when credit changes
  useEffect(() => {
    async function loadCreditHistory() {
      if (!credit?.id || activeTab !== 'history') return;
      
      setHistoryLoading(true);
      try {
        const { data, error } = await getCreditAmountHistory(credit.id);
        
        if (error) {
          throw error;
        }
        
        // Force cast data to CreditAmountHistory[]
        setCreditHistory(data ? [...data] as unknown as CreditAmountHistory[] : []);
      } catch (err) {
        console.error('Error loading credit history:', err);
      } finally {
        setHistoryLoading(false);
      }
    }
    
    loadCreditHistory();
  }, [credit?.id, activeTab, refreshRepayments, refreshAdditionalLoans]);

  // Helper function to get transaction type display text
  const getTransactionTypeDisplay = (type: CreditTransactionType | string): string => {
    switch (type) {
      case CreditTransactionType.INITIAL_LOAN:
        return 'Tạo hợp đồng';
      case CreditTransactionType.ADDITIONAL_LOAN:
        return 'Vay thêm';
      case CreditTransactionType.PRINCIPAL_REPAYMENT:
        return 'Trả bớt gốc';
      case 'payment':
        return 'Đóng lãi phí';
      case 'payment_cancel':
        return 'Hủy đóng lãi phí';
      case 'contract_close':
        return 'Đóng hợp đồng';
      case 'contract_reopen':
        return 'Mở lại hợp đồng';
      default:
        return 'Giao dịch khác';
    }
  };

  // Helper function to calculate history totals
  const calculateHistoryTotals = () => {
    let totalDebit = 0;
    let totalCredit = 0;

    creditHistory.forEach(history => {
      // Add debit and credit amounts
      totalDebit += history.debit_amount || 0;
      totalCredit += history.credit_amount || 0;
    });

    return {
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit
    };
  };

  // Helper function to calculate interest amount based on credit details
  const calculateInterestAmount = (credit: CreditWithCustomer | null) => {
    if (!credit) return 0;
    
    if (credit.interest_type === InterestType.PERCENTAGE) {
      // For percentage interest: loan_amount * (interest_value/100/30) * days * 30
      return Math.round(credit.loan_amount * (credit.interest_value / 100 / 30) * credit.interest_period * 30);
    } else {
      // For fixed interest: (interest_value/interest_period) * days * interest_period
      return Math.round((credit.interest_value / credit.interest_period) * credit.interest_period * credit.interest_period);
    }
  }

  useEffect(() => {
    async function loadPaymentPeriods() {
      if (!credit?.id) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const { data, error } = await getCreditPaymentPeriods(credit.id);
        
        if (error) {
          throw error;
        }
        
        setPaymentPeriods(data || []);
      } catch (err) {
        console.error('Error loading payment periods:', err);
        setError('Không thể tải dữ liệu thanh toán');
      } finally {
        setLoading(false);
      }
    }
    
    if (isOpen) {
      loadPaymentPeriods();
    }
  }, [isOpen, credit?.id]);
  
  // Format currency helper
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(amount);
  };
  
  // Format date helper
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: vi });
    } catch (error) {
      return '-';
    }
  };
  
  // Format datetime helper for history display
  const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd-MM-yyyy HH:mm:ss', { locale: vi });
    } catch (error) {
      return '-';
    }
  };
  
  // Hàm tính chính xác số ngày giữa hai ngày (inclusive)
  const calculateDaysBetween = (startDate: Date, endDate: Date): number => {
    // Chuẩn hóa về đầu ngày để tránh sai lệch do giờ/phút/giây
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    
    // Tính ngày (bao gồm cả ngày đầu và cuối)
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };
  
  // Fetch principal changes when credit changes
  useEffect(() => {
    async function fetchPrincipalChanges() {
      if (!credit?.id) return;
      
      try {
        const { data, error } = await getPrincipalChangesForCredit(credit.id);
        
        if (error) {
          console.error('Error fetching principal changes:', error);
          return;
        }
        
        setPrincipalChanges(data || []);
      } catch (err) {
        console.error('Error in fetchPrincipalChanges:', err);
      }
    }
    
    fetchPrincipalChanges();
  }, [credit?.id, refreshRepayments, refreshAdditionalLoans]);
  
  // Hàm tạo các kỳ thanh toán dựa trên thông tin hợp đồng
  const generatePaymentPeriods = (credit: CreditWithCustomer | null): CreditPaymentPeriod[] => {
    if (!credit) return [];
    
    const result: CreditPaymentPeriod[] = [];
    const loanDate = new Date(credit.loan_date);
    const interestPeriod = credit.interest_period; // Số ngày của một kỳ lãi
    const loanPeriod = credit.loan_period; // Tổng số ngày vay
    
    // Tính toán tổng số kỳ
    const totalPeriods = Math.ceil(loanPeriod / interestPeriod);
    
    // Tạo từng kỳ thanh toán
    for (let i = 0; i < totalPeriods; i++) {
      // Tính ngày bắt đầu và kết thúc của kỳ
      let startDate;
      
      // Nếu là kỳ đầu tiên, ngày bắt đầu là loan_date
      // Nếu không phải kỳ đầu tiên, ngày bắt đầu là ngày tiếp theo sau ngày kết thúc của kỳ trước
      if (i > 0) {
        // Tính ngày kết thúc của kỳ trước
        const prevEndDate = new Date(loanDate.getTime());
        prevEndDate.setDate(loanDate.getDate() + (i * interestPeriod - 1));
        
        // Ngày bắt đầu kỳ này = ngày sau ngày kết thúc kỳ trước
        startDate = new Date(prevEndDate.getTime());
        startDate.setDate(prevEndDate.getDate() + 1);
      } else {
        // Kỳ đầu tiên, giữ nguyên startDate = loanDate
        startDate = new Date(loanDate.getTime());
      }
      
      const endDate = new Date(startDate);
      // Nếu là kỳ cuối cùng và không chia đều, chỉ cộng số ngày còn lại
      if (i === totalPeriods - 1 && loanPeriod % interestPeriod !== 0) {
        // Đảm bảo kỳ cuối không vượt quá tổng số ngày vay
        const loanEndDate = new Date(loanDate);
        loanEndDate.setDate(loanDate.getDate() + loanPeriod - 1); // Trừ 1 vì tính cả ngày đầu và cuối
        endDate.setTime(loanEndDate.getTime()); // Gán trực tiếp thởi gian
      } else {
        endDate.setDate(startDate.getDate() + interestPeriod - 1); // Trừ 1 vì tính cả ngày đầu và cuối
      }
      
      // Tính số ngày trong kỳ sử dụng hàm tính ngày chuẩn hóa
      const dayCount = calculateDaysBetween(startDate, endDate);
      
      // Tính số tiền lãi dự kiến của kỳ, xem xét đến thay đổi gốc
      let expectedAmount = 0;
      if (principalChanges && principalChanges.length > 0) {
        // Sử dụng hàm tính lãi nâng cao có xét đến thay đổi gốc
        expectedAmount = calculateInterestWithPrincipalChanges(
          credit,
          startDate,
          endDate,
          principalChanges
        );
      } else {
        // Sử dụng tính toán cũ nếu không có thay đổi gốc
        if (credit.interest_type === InterestType.PERCENTAGE) {
          // Xử lý dựa trên loại lãi suất (tuần, tháng, ngày)
          if (credit.interest_ui_type?.startsWith('weekly')) {
            // Lãi suất theo tuần (ví dụ 1%/tuần)
            const weeksCount = Math.ceil(dayCount / 7);
            expectedAmount = Math.round(credit.loan_amount * (credit.interest_value / 100) * weeksCount);
          } else if (credit.interest_ui_type?.startsWith('monthly')) {
            // Lãi suất theo tháng (ví dụ 3%/tháng)
            const monthsCount = Math.ceil(dayCount / 30);
            expectedAmount = Math.round(credit.loan_amount * (credit.interest_value / 100) * monthsCount);
          } else {
            // Lãi suất theo ngày (mặc định)
            expectedAmount = Math.round(credit.loan_amount * (credit.interest_value / 100 / 30) * dayCount * 30);
          }
        } else {
          // Lãi suất cố định
          const loanAmountInMillions = credit.loan_amount / 1000;
          expectedAmount = Math.round(credit.interest_value * loanAmountInMillions * dayCount);
        }
      }
      
      result.push({
        id: `calculated-${i}`, // ID tạm thời
        credit_id: credit.id,
        period_number: i + 1,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        expected_amount: expectedAmount,
        actual_amount: 0,
        payment_date: null,
        notes: null,
        other_amount: 0
      });
    }
    
    return result;
  };
  
  // Kết hợp kỳ thanh toán tính toán với dữ liệu thực từ database
  const mergePaymentPeriods = (calculated: CreditPaymentPeriod[], actual: CreditPaymentPeriod[]): CreditPaymentPeriod[] => {
    if (!credit) return actual;
    if (actual.length === 0) return calculated;
    if (calculated.length === 0) return actual;
    
    // Sắp xếp các kỳ thực tế theo số thứ tự
    const sortedActual = [...actual].sort((a, b) => a.period_number - b.period_number);
    
    // Tìm kỳ đã xác nhận sau cùng
    const lastConfirmedPeriod = sortedActual[sortedActual.length - 1];
    
    // Kết quả sẽ chứa tất cả các kỳ đã xác nhận trước
    const result: CreditPaymentPeriod[] = [...sortedActual];
    
    // Nếu có kỳ đã xác nhận, tính toán các kỳ tiếp theo dựa trên kỳ sau cùng
    if (lastConfirmedPeriod) {
      const loanEndDate = new Date(credit.loan_date);
      loanEndDate.setDate(loanEndDate.getDate() + credit.loan_period - 1); // Tính cả ngày đầu và cuối
      
      // Lấy ngày cuối kỳ của kỳ đã đóng gần nhất
      const lastEndDate = new Date(lastConfirmedPeriod.end_date);
      
      // Ngày bắt đầu kỳ tiếp theo là ngày sau của ngày kết thúc kỳ trước
      let nextStartDate = new Date(lastEndDate);
      nextStartDate.setDate(nextStartDate.getDate() + 1);
      
      // Nếu ngày bắt đầu kỳ tiếp theo đã vượt quá ngày kết thúc khoản vay, không cần tạo thêm kỳ
      if (nextStartDate.getTime() > loanEndDate.getTime()) {
        return result;
      }
      
      // Tính số kỳ còn lại
      const periodLength = credit.interest_period; // Số ngày của một kỳ
      let nextPeriodNumber = lastConfirmedPeriod.period_number + 1;
      
      // Tạo các kỳ tiếp theo
      while (nextStartDate.getTime() <= loanEndDate.getTime()) {
        let nextEndDate = new Date(nextStartDate);
        nextEndDate.setDate(nextStartDate.getDate() + periodLength - 1); // Trừ 1 vì tính cả ngày đầu và cuối
        
        // Nếu kỳ này vượt quá ngày kết thúc khoản vay, rút ngắn xuống ngày kết thúc
        if (nextEndDate.getTime() > loanEndDate.getTime()) {
          nextEndDate = new Date(loanEndDate);
        }
        
        // Tính số ngày trong kỳ sử dụng hàm tính ngày chuẩn hóa
        const daysCount = calculateDaysBetween(nextStartDate, nextEndDate);
        
        // Tính số tiền lãi dự kiến của kỳ, xem xét đến thay đổi gốc
        let expectedAmount = 0;
        if (principalChanges && principalChanges.length > 0) {
          // Sử dụng hàm tính lãi nâng cao có xét đến thay đổi gốc
          expectedAmount = calculateInterestWithPrincipalChanges(
            credit,
            nextStartDate,
            nextEndDate,
            principalChanges
          );
        } else {
          // Sử dụng tính toán cũ nếu không có thay đổi gốc
          if (credit.interest_type === InterestType.PERCENTAGE) {
            // Xử lý dựa trên loại lãi suất (tuần, tháng, ngày)
            if (credit.interest_ui_type?.startsWith('weekly')) {
              // Lãi suất theo tuần (ví dụ 1%/tuần)
              const weeksCount = Math.ceil(daysCount / 7);
              expectedAmount = Math.round(credit.loan_amount * (credit.interest_value / 100) * weeksCount);
            } else if (credit.interest_ui_type?.startsWith('monthly')) {
              // Lãi suất theo tháng (ví dụ 3%/tháng)
              const monthsCount = Math.ceil(daysCount / 30);
              expectedAmount = Math.round(credit.loan_amount * (credit.interest_value / 100) * monthsCount);
            } else {
              // Lãi suất theo ngày (mặc định)
              expectedAmount = Math.round(credit.loan_amount * (credit.interest_value / 100 / 30) * daysCount * 30);
            }
          } else {
            // Lãi suất cố định
            const loanAmountInMillions = credit.loan_amount / 1000;
            expectedAmount = Math.round(credit.interest_value * loanAmountInMillions * daysCount);
          }
        }
        
        // Tạo kỳ mới
        const newPeriod: CreditPaymentPeriod = {
          id: `calculated-${nextPeriodNumber}`,
          credit_id: credit.id,
          period_number: nextPeriodNumber,
          start_date: nextStartDate.toISOString(),
          end_date: nextEndDate.toISOString(),
          expected_amount: expectedAmount,
          actual_amount: 0,
          payment_date: null,
          notes: null,
          other_amount: 0
        };
        
        // Thêm kỳ mới vào kết quả
        result.push(newPeriod);
        
        // Chuẩn bị cho kỳ tiếp theo
        nextStartDate = new Date(nextEndDate);
        nextStartDate.setDate(nextEndDate.getDate() + 1);
        nextPeriodNumber++;
        
        // Nếu ngày bắt đầu kỳ tiếp đã vượt quá ngày kết thúc khoản vay, dừng
        if (nextStartDate.getTime() > loanEndDate.getTime()) {
          break;
        }
      }
    } else {
      // Nếu chưa có kỳ nào được xác nhận, sử dụng các kỳ tính toán
      return calculated;
    }
    
    // Sắp xếp lại theo số thứ tự kỳ
    return result.sort((a, b) => a.period_number - b.period_number);
  };

  // Generate calculated payment periods
  const calculatedPeriods = generatePaymentPeriods(credit);
  
  // Merge with actual data from database
  const combinedPaymentPeriods = mergePaymentPeriods(calculatedPeriods, paymentPeriods);
  
  // Calculate total amounts
  const totalAmount = credit?.loan_amount || 0;
  
  // Calculate total expected, paid, and remaining amounts from payment periods
  const totalExpected = combinedPaymentPeriods.reduce((sum, period) => sum + (period.expected_amount || 0), 0);
  const totalPaid = combinedPaymentPeriods.reduce((sum, period) => sum + (period.actual_amount || 0), 0);
  
  // Calculate old debt as the difference between customer payments and (interest fees + other fees) in database
  // Only consider periods that exist in database (not calculated ones)
  const databasePeriods = paymentPeriods.filter(p => p.id && !p.id.startsWith('calculated-'));
  const totalInterestAndOtherFees = databasePeriods.reduce((sum, period) => 
    sum + (period.expected_amount || 0) + (period.other_amount || 0), 0);
  const totalCustomerPayments = databasePeriods.reduce((sum, period) => 
    sum + (period.actual_amount || 0), 0);
  const remainingAmount = totalCustomerPayments - totalInterestAndOtherFees;
  
  // Generate date range for display
  const loanDateFormatted = formatDate(credit?.loan_date);
  const endDateFormatted = credit?.loan_date 
    ? formatDate(new Date(new Date(credit.loan_date).getTime() + (credit.loan_period - 1) * 24 * 60 * 60 * 1000).toISOString())
    : '-';
  
  // Giải thích: Chúng ta trừ 1 vì khi tính số ngày, ngày đầu và ngày cuối đều được tính vào (inclusive)
  // Ví dụ: từ 18/5 đến 17/6 là 31 ngày, nhưng khi tính số ngày cần nhảy là 30 ngày
  
  // Calculate totals for history display
  const historyTotals = calculateHistoryTotals();
  
  // Hàm xử lý việc lưu thanh toán khi người dùng nhập xong
  const handleSavePayment = async () => {
    if (!selectedPeriodId || !credit) return;
    
    try {
      // Tìm kỳ được chọn
      const periodToUpdate = paymentPeriods.find(p => p.id === selectedPeriodId);
      if (!periodToUpdate) return;
      
      // Kiểm tra xem đây có phải kỳ tính toán chưa lưu trong DB không
      const isCalculatedPeriod = selectedPeriodId.startsWith('calculated-');
      
      // Sử dụng hàm savePaymentWithOtherAmount để lưu hoặc cập nhật
      const { data, error } = await savePaymentWithOtherAmount(
        credit.id,
        periodToUpdate,
        paymentAmount,
        otherAmount,
        isCalculatedPeriod
      );
      
      if (error) {
        console.error('Lỗi khi lưu thanh toán:', error);
        return;
      }
      
      // Cập nhật lại danh sách kỳ thanh toán
      if (data) {
        // Tạo bản sao của danh sách hiện tại
        const updatedPeriods = [...paymentPeriods];
        
        // Tìm và thay thế kỳ được cập nhật
        const periodIndex = updatedPeriods.findIndex(p => p.id === selectedPeriodId);
        if (periodIndex >= 0) {
          // Nếu đây là kỳ tính toán, thay thế ID tạm bởi ID thật
          updatedPeriods[periodIndex] = {
            ...periodToUpdate,
            id: isCalculatedPeriod ? data.id : periodToUpdate.id,
            actual_amount: paymentAmount,
            other_amount: otherAmount,
            payment_date: new Date().toISOString(),
          };
        }
        
        // Cập nhật state
        setPaymentPeriods(updatedPeriods);
      }
      
      // Đóng dialog
      setShowPaymentInput(false);
      setSelectedPeriodId(null);
    } catch (error) {
      console.error('Lỗi khi xử lý thanh toán:', error);
    }
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="sm:max-w-[800px] md:max-w-[900px] max-h-[90vh] overflow-y-auto" 
      >
        <DialogHeader>
          <DialogTitle>Hợp đồng vay tiền</DialogTitle>
        </DialogHeader>
        
        <div className="mt-2">
          {/* Thông tin khách hàng */}
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">{credit?.customer?.name || 'Khách hàng'}</h3>
            <h3 className="font-medium">Tổng lãi phí: {formatCurrency(totalExpected)}</h3>
          </div>
          
          {/* Tổng hợp chi tiết */}
          <div className="grid grid-cols-2 gap-8 my-4">
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tiền vay</td>
                    <td className="py-1 px-2 text-right border">{formatCurrency(credit?.loan_amount || 0)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Lãi phí</td>
                    <td className="py-1 px-2 text-right border">
                      {credit ? getInterestDisplayString(credit) : '-'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Vay từ ngày</td>
                    <td className="py-1 px-2 text-right border">{loanDateFormatted} → {endDateFormatted}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Đã thanh toán</td>
                    <td className="py-1 px-2 text-right border">{formatCurrency(totalPaid)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">{remainingAmount > 0 ? 'Tiền thừa' : 'Nợ cũ'}</td>
                    <td className={`py-1 px-2 text-right border ${remainingAmount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Math.abs(remainingAmount))}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Trạng thái</td>
                    <td className="py-1 px-2 text-right border">Đang vay</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Tabs */}
          <CreditActionTabs 
            tabs={DEFAULT_CREDIT_TABS} 
            activeTab={activeTab} 
            onChangeTab={(tabId: TabId) => setActiveTab(tabId)} 
            variant="scrollable"
            className="mb-2"
          />
          
          {/* Nội dung theo tab */}
          {activeTab === 'payment' && (
            <PaymentTab
              credit={credit}
              paymentPeriods={paymentPeriods}
              combinedPaymentPeriods={combinedPaymentPeriods}
              loading={loading}
              error={error}
              showPaymentForm={showPaymentForm}
              setShowPaymentForm={setShowPaymentForm}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              calculateDaysBetween={calculateDaysBetween}
              principalChanges={principalChanges}
              onDataChange={() => {
                // Reload payment periods data
                if (credit?.id) {
                  setLoading(true);
                  getCreditPaymentPeriods(credit.id).then(({ data, error }) => {
                    setLoading(false);
                    if (error) {
                      setError('Không thể tải lại dữ liệu thanh toán');
                      return;
                    }
                    
                    setPaymentPeriods(data || []);
                  });
                }
              }}
            />
          )}
          
          {activeTab === 'principal-repayment' && (
            <PrincipalRepaymentTab
              credit={credit}
              refreshRepayments={refreshRepayments}
              setRefreshRepayments={setRefreshRepayments}
              onDataChange={reloadCreditInfo}
            />
          )}
          
          {activeTab === 'additional-loan' && (
            <AdditionalLoanTab 
              credit={credit}
              key={refreshAdditionalLoans}
              onDataChange={() => {
                setRefreshAdditionalLoans(prev => prev + 1);
                reloadCreditInfo();
              }}
            />
          )}
          
          {activeTab === 'extension' && (
            <ExtensionTab 
              credit={credit} 
              onDataChange={reloadCreditInfo}
            />
          )}
          
          {activeTab === 'close' && (
            <CloseTab credit={credit} />
          )}
          
          {activeTab === 'documents' && (
            <DocumentsTab creditId={creditId} />
          )}
          
          {activeTab === 'history' && credit && (
            <div className="p-4">
              {/* Lịch sử thao tác */}
              <div>
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                  <h3 className="text-lg font-medium">Lịch sử thao tác</h3>
                </div>
                
                {historyLoading ? (
                  <div className="flex justify-center items-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
                  </div>
                ) : creditHistory.length === 0 ? (
                  <div className="flex justify-center items-center py-10">
                    <p className="text-gray-500">Chưa có lịch sử giao dịch</p>
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-amber-600 italic mb-2">
                      *Lưu ý: Ghi nợ (debit) là tiền ra, ghi có (credit) là tiền vào
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-16 text-center">STT</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Ngày</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Loại giao dịch</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 text-right">Số tiền ghi nợ</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 text-right">Số tiền ghi có</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nội dung</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {creditHistory.map((history, index) => (
                            <tr key={history.id}>
                              <td className="px-4 py-3 text-sm text-gray-700 text-center">{index + 1}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(history.created_at)}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{getTransactionTypeDisplay(history.transaction_type)}</td>
                              <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                                {history.debit_amount > 0 ? formatCurrency(history.debit_amount) : ""}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 text-right text-green-600">
                                {history.credit_amount > 0 ? formatCurrency(history.credit_amount) : ""}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{history.description || '-'}</td>
                            </tr>
                          ))}
                          
                          {/* Initial loan entry */}
                          <tr>
                            <td className="px-4 py-3 text-sm text-gray-700 text-center">{creditHistory.length + 1}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{formatDate(credit.loan_date)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">Tạo hợp đồng</td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                              {formatCurrency(credit?.loan_amount || 0)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right">0</td>
                            <td className="px-4 py-3 text-sm text-gray-700">Cho vay</td>
                          </tr>
                          
                          {/* Summary rows */}
                          <tr className="bg-amber-50">
                            <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Tổng Tiền</td>
                            <td className="px-4 py-2 text-sm font-medium text-right text-red-600">
                              {formatCurrency(historyTotals.totalDebit + (credit.loan_amount || 0))}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium text-right text-green-600">
                              {formatCurrency(historyTotals.totalCredit)}
                            </td>
                            <td></td>
                          </tr>
                          <tr className="bg-amber-100">
                            <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Chênh lệch</td>
                            <td colSpan={2} className="px-4 py-2 text-sm font-medium text-right">
                              <span className={(historyTotals.totalDebit + (credit.loan_amount || 0)) - historyTotals.totalCredit >= 0 ? "text-red-600" : "text-green-600"}>
                                {formatCurrency((historyTotals.totalDebit + (credit.loan_amount || 0)) - historyTotals.totalCredit)}
                              </span>
                            </td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'bad-credit' && (
            <BadCreditTab credit={credit} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
