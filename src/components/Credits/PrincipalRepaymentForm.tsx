import { useState, useEffect } from 'react';
import { format, addDays, max, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from '@/components/ui/use-toast';
import { getCreditPaymentPeriods } from '@/lib/credit-payment';
import { getCreditById } from '@/lib/credit';
import { calculateActualLoanAmount } from '@/lib/Credits/calculate_actual_loan_amount';
import { getLatestPaymentPaidDate } from '@/lib/Credits/get_latest_payment_paid_date';

interface PrincipalRepaymentFormProps {
  onSubmit: (data: {
    repaymentDate: string;
    amount: number;
    notes?: string;
  }) => void;
  creditId: string;
  disabled?: boolean;
}

export function PrincipalRepaymentForm({ onSubmit, creditId, disabled = false }: PrincipalRepaymentFormProps) {
  const [repaymentDate, setRepaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState<number>(0);
  const [formattedAmount, setFormattedAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [minDateStr, setMinDateStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [actualLoanAmount, setActualLoanAmount] = useState<number>(0);
  const [loadingActualAmount, setLoadingActualAmount] = useState<boolean>(false);

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
    const rawValue = e.target.value.replace(/\./g, '');
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
        console.log('Actual loan amount for repayment validation:', actualAmount);
      } catch (error) {
        console.error('Error loading actual loan amount:', error);
        // Fallback to original loan amount if available
        try {
          const { data: creditData } = await getCreditById(creditId);
          setActualLoanAmount(creditData?.loan_amount || 0);
        } catch (fallbackError) {
          console.error('Error loading fallback loan amount:', fallbackError);
          setActualLoanAmount(0);
        }
      } finally {
        setLoadingActualAmount(false);
      }
    }

    loadActualLoanAmount();
  }, [creditId]);

  useEffect(() => {
    async function fetchLatestPaymentPaidDate() {
      if (!creditId) return;
      
      setIsLoading(true);
      try {
        const latestPaymentPaidDate = await getLatestPaymentPaidDate(creditId);
        console.log('Latest payment paid date:', latestPaymentPaidDate);
        if (latestPaymentPaidDate) {
          setMinDateStr(latestPaymentPaidDate);
        } else {
          setMinDateStr(format(new Date(), 'yyyy-MM-dd'));
        }
      } catch (err) {
        console.error('Error in fetchData:', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchLatestPaymentPaidDate();
  }, [creditId]);

  const handleDateChange = (date: string) => {
    // Only set the date if it's not before the minimum date
    const selectedDate = new Date(date);
    const minimum = new Date(minDateStr);
    
    if (selectedDate >= minimum) {
      setRepaymentDate(date);
    } else {
      // If the date is before the minimum, show a warning and set to minimum
      toast({
        variant: "destructive",
        title: "Cảnh báo",
        description: "Đã chọn ngày tối thiểu được phép"
      });
      setRepaymentDate(minDateStr);
    }
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

    // Validate date is not before min date
    if (new Date(repaymentDate) <= new Date(minDateStr)) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Ngày trả bớt gốc không thể trước ngày bắt đầu vay hoặc trước kỳ đóng lãi gần nhất"
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
            <input
              id="amount"
              type="text"
              className={`border rounded px-2 py-1 w-full ${
                amount > actualLoanAmount && actualLoanAmount > 0 ? 'border-red-500 bg-red-50' : ''
              }`}
              value={formattedAmount}
              onChange={handleAmountChange}
              placeholder="0"
              inputMode="numeric"
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
