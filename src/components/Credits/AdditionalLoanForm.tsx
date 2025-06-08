import { useState, useEffect } from 'react';
import { format, addDays, max, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from '@/components/ui/use-toast';
import { getCreditById } from '@/lib/credit';
import { getLatestPaymentPaidDate } from '@/lib/Credits/get_latest_payment_paid_date';
import { CreditWithCustomer } from '@/models/credit';

interface AdditionalLoanFormProps {
  onSubmit: (data: {
    loanDate: string;
    amount: number;
    notes?: string;
  }) => void;
  creditId: string;
  disabled?: boolean;
  onSuccess?: () => void;
}

export function AdditionalLoanForm({ onSubmit, creditId, disabled = false, onSuccess }: AdditionalLoanFormProps) {
  const [loanDate, setLoanDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState<number>(0);
  const [formattedAmount, setFormattedAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [minDate, setMinDate] = useState<string | null>(null);
  const [maxDate, setMaxDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [creditData, setCreditData] = useState<CreditWithCustomer | null>(null);

  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    // Convert to number and back to string to remove non-numeric characters
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    // Format with thousand separators
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, '');
    setAmount(Number(rawValue));
    setFormattedAmount(formatNumber(rawValue));
  };

  useEffect(() => {
    async function fetchLatestPaymentPaidDate() {
      if (!creditId) return;
      
      setIsLoading(true);
      try {
        const latestPaymentPaidDate = await getLatestPaymentPaidDate(creditId);
        const { data: creditData } = await getCreditById(creditId);
        setCreditData(creditData);
        const endDate = creditData ? addDays(new Date(creditData.loan_date), creditData.loan_period - 1) : new Date();
        setMaxDate(format(endDate, 'yyyy-MM-dd'));
        
        // Set initial loan date based on latest payment or credit start date
        if (latestPaymentPaidDate) {
          setMinDate(latestPaymentPaidDate);
          // Set loan date to the day after the latest payment date
          const nextDay = addDays(new Date(latestPaymentPaidDate), 1);
          setLoanDate(format(nextDay, 'yyyy-MM-dd'));
        } else if (creditData?.loan_date) {
          // If no payment exists, set to credit start date
          setLoanDate(creditData.loan_date);
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
    setLoanDate(date);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (amount <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập số tiền vay thêm"
      });
      return;
    }

    if (!minDate) {
      // Kiểm tra xem ngày vay thêm có trước ngày bắt đầu vay không
      if (creditData?.loan_date && new Date(loanDate) < new Date(creditData.loan_date)) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Ngày vay thêm không thể trước ngày bắt đầu vay"
        });
        return;
      }
    }

    // Validate date is not before min date
    if (minDate && new Date(loanDate) <= new Date(minDate)) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: `Ngày vay thêm không thể trước ngày bắt đầu vay hoặc trước kỳ đóng lãi gần nhất ${minDate}`
      });
      return;
    }

    // Validate date is not after max date
    if (new Date(loanDate) > new Date(maxDate)) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: `Ngày vay thêm không thể sau ngày kết thúc hợp đồng`
      });
      return;
    }
    
    onSubmit({
      loanDate,
      amount,
      notes
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded-md mb-4">
      <h3 className="text-lg font-medium mb-4">Vay thêm tiền</h3>
      
      <div className="grid grid-cols-1 gap-4">
        {/* Ngày vay thêm gốc */}
        <div className="flex items-center">
          <label htmlFor="loanDate" className="w-48 text-right mr-4">Ngày vay thêm gốc</label>
          <div className="relative w-64">
            <DatePicker
              id="loanDate"
              value={loanDate}
              onChange={handleDateChange}
              className="w-full"
              disabled={isLoading || disabled}
            />
          </div>
        </div>
        
        {/* Số tiền vay thêm */}
        <div className="flex items-center">
          <label htmlFor="amount" className="w-48 text-right mr-4">
            Số tiền vay thêm
            <span className="text-red-500 ml-1">*</span>
          </label>
          <input
            id="amount"
            type="text"
            className="border rounded px-2 py-1 w-64"
            value={formattedAmount}
            onChange={handleAmountChange}
            placeholder="0"
            inputMode="numeric"
            disabled={disabled}
          />
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
          disabled={isLoading || disabled}
        >
          Đồng ý
        </Button>
      </div>
    </form>
  );
}
