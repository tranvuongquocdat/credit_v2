import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from '@/components/ui/use-toast';
import { getCreditById } from '@/lib/credit';
import { calculateActualLoanAmount } from '@/lib/Credits/calculate_actual_loan_amount';
import { getLatestPaymentPaidDate } from '@/lib/Credits/get_latest_payment_paid_date';
import { CreditWithCustomer } from '@/models/credit';
import { MoneyInput } from '@/components/ui/money-input';

interface PrincipalRepaymentFormProps {
  onSubmit: (data: {
    repaymentDate: string;
    amount: number;
    notes?: string;
  }) => void;
  creditId: string;
  disabled?: boolean;
  onSuccess?: () => void;
}

export function PrincipalRepaymentForm({ onSubmit, creditId, disabled = false, onSuccess }: PrincipalRepaymentFormProps) {
  const [repaymentDate, setRepaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState<number>(0);
  const [formattedAmount, setFormattedAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [minDateStr, setMinDateStr] = useState<string | null>(null);
  const [maxDateStr, setMaxDateStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [actualLoanAmount, setActualLoanAmount] = useState<number>(0);
  const [loadingActualAmount, setLoadingActualAmount] = useState<boolean>(false);
  const [creditData, setCreditData] = useState<CreditWithCustomer | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    // Convert to number and back to string to remove non-numeric characters
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    // Format with thousand separators
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // Format currency for display
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setAmount(Number(rawValue));
    setFormattedAmount(formatNumber(rawValue));
  };

  // Load actual loan amount
  useEffect(() => {
    async function loadActualLoanAmount() {
      if (!creditId) return;
      
      setLoadingActualAmount(true);
      try {
        const actualAmount = await calculateActualLoanAmount(creditId);
        setActualLoanAmount(actualAmount);
        const { data: creditData } = await getCreditById(creditId);
        setCreditData(creditData);
        const endDate = creditData ? addDays(new Date(creditData.loan_date), creditData.loan_period - 1) : new Date();
        setMaxDateStr(format(endDate, 'yyyy-MM-dd'));
      } catch (error) {
        console.error('Error loading actual loan amount:', error);
        setActualLoanAmount(0);
      } finally {
        setLoadingActualAmount(false);
      }
    }

    loadActualLoanAmount();
  }, [creditId, refreshTrigger]);

  useEffect(() => {
    async function fetchLatestPaymentPaidDate() {
      if (!creditId) return;
      
      setIsLoading(true);
      try {
        const latestPaymentPaidDate = await getLatestPaymentPaidDate(creditId);
        console.log('Latest payment paid date:', latestPaymentPaidDate);
        
        // Set initial repayment date based on latest payment or credit start date
        if (latestPaymentPaidDate) {
          setMinDateStr(latestPaymentPaidDate);
          // Set repayment date to the day after the latest payment date
          const nextDay = addDays(new Date(latestPaymentPaidDate), 1);
          setRepaymentDate(format(nextDay, 'yyyy-MM-dd'));
        } else if (creditData?.loan_date) {
          // If no payment exists, set to credit start date
          setRepaymentDate(creditData.loan_date);
        }
      } catch (err) {
        console.error('Error in fetchData:', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchLatestPaymentPaidDate();
  }, [creditId, refreshTrigger]);

  const handleDateChange = (date: string) => {
    setRepaymentDate(date);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (amount <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập số tiền gốc trả trước"
      });
      return;
    }
    
    if (!minDateStr) {
      // Kiểm tra xem ngày trả gôc có trước ngầy bắt đầu vay không
      if (creditData?.loan_date && new Date(repaymentDate) < new Date(creditData.loan_date)) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Ngày trả gốc không thể trước ngày bắt đầu vay"
        });
        return;
      }
    }
    // Validate date is not before min date
    if (minDateStr && new Date(repaymentDate) <= new Date(minDateStr)) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: `Ngày trả bớt gốc không thể trước ngày bắt đầu vay hoặc trước kỳ đóng lãi gần nhất ${minDateStr}`
      });
      return;
    }

    // If repayment date is after contract's end date, show a warning
    if (new Date(repaymentDate) > new Date(maxDateStr)) {
      toast({
        variant: "destructive",
        title: "Cảnh báo",
        description: "Ngày trả bớt gốc không thể sau ngày kết thúc hợp đồng"
      });
      return;
    }
    // Validate amount does not exceed actual loan amount
    if (amount > actualLoanAmount) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: `Số tiền trả gốc không thể vượt quá số tiền vay hiện tại (${formatCurrency(actualLoanAmount)})`
      });
      return;
    }

    onSubmit({
      repaymentDate,
      amount,
      notes
    });
    
    // Reset form after successful submission
    setAmount(0);
    setFormattedAmount('');
    setNotes('');
    setRepaymentDate(format(new Date(), 'yyyy-MM-dd'));
    
    onSuccess?.();
    setRefreshTrigger(prevTrigger => prevTrigger + 1);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded-md mb-4">
      <h3 className="text-lg font-medium mb-4">Trả gốc</h3>
      
      {/* Hiển thị số tiền vay hiện tại */}
      {loadingActualAmount ? (
        <div className="mb-4 p-2 bg-blue-50 rounded border text-sm text-blue-700">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin"></div>
            Đang tải thông tin số tiền vay...
          </div>
        </div>
      ) : (
        <div className="mb-4 p-2 bg-blue-50 rounded border text-sm text-blue-700">
          <strong>Số tiền vay hiện tại: {formatCurrency(actualLoanAmount)}</strong>
        </div>
      )}
      
      <div className="grid grid-cols-1 gap-4">
        {/* Ngày trả trước gốc */}
        <div className="flex items-center">
          <label htmlFor="repaymentDate" className="w-48 text-right mr-4">Ngày trả trước gốc</label>
          <div className="relative w-64">
            <DatePicker
              id="repaymentDate"
              value={repaymentDate}
              onChange={handleDateChange}
              className="w-full"
              disabled={isLoading || disabled}
            />
          </div>
        </div>
        
        {/* Số tiền gốc trả trước */}
        <div className="flex items-center">
          <label htmlFor="amount" className="w-48 text-right mr-4">
            Số tiền gốc trả trước
            <span className="text-red-500 ml-1">*</span>
          </label>
          <div className="w-64">
            <MoneyInput
              id="amount"
              value={amount.toString()}
              onChange={handleAmountChange}
              placeholder="0"
              className={amount > actualLoanAmount && actualLoanAmount > 0 ? 'border-red-500 bg-red-50' : ''}
              disabled={disabled || loadingActualAmount}
            />
            {amount > actualLoanAmount && actualLoanAmount > 0 && (
              <div className="text-xs text-red-600 mt-1">
                Vượt quá số tiền vay hiện tại
              </div>
            )}
          </div>
        </div>
        
        {/* Ghi chú */}
        <div className="flex items-start">
          <label htmlFor="notes" className="w-48 text-right mr-4 pt-1">Ghi chú</label>
          <textarea
            id="notes"
            className="border rounded px-2 py-1 w-64 h-20"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>
      
      {/* Nút đồng ý */}
      <div className="flex justify-end mt-4">
        <Button 
          type="submit" 
          className="bg-blue-600 hover:bg-blue-700 text-white"
          disabled={isLoading || disabled || loadingActualAmount || (amount > actualLoanAmount && actualLoanAmount > 0)}
        >
          Đồng ý
        </Button>
      </div>
    </form>
  );
}
