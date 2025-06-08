import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from '@/components/ui/use-toast';
import { getPawnById } from '@/lib/pawn';
import { getLatestPaymentPaidDate } from '@/lib/Pawns/get_latest_payment_paid_date';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';

interface AdditionalLoanFormProps {
  onSubmit: (data: {
    loanDate: string;
    amount: number;
    notes?: string;
  }) => void;
  pawnId: string;
  disabled?: boolean;
  onSuccess?: () => void;
}

export function AdditionalLoanForm({ onSubmit, pawnId, disabled = false, onSuccess }: AdditionalLoanFormProps) {
  const [loanDate, setLoanDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState<number>(0);
  const [formattedAmount, setFormattedAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [minDate, setMinDate] = useState<string | null>(null);
  const [maxDate, setMaxDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [pawnData, setPawnData] = useState<PawnWithCustomerAndCollateral | null>(null);

  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    const numericValue = value.toString().replace(/[^0-9]/g, '');
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
      if (!pawnId) return;
      
      setIsLoading(true);
      try {
        const latestPaymentPaidDate = await getLatestPaymentPaidDate(pawnId);
        const { data: pawnData } = await getPawnById(pawnId);
        setPawnData(pawnData);
        const endDate = pawnData ? addDays(new Date(pawnData.loan_date), (pawnData.loan_period || 30) - 1) : new Date();
        setMaxDate(format(endDate, 'yyyy-MM-dd'));
        
        // Set initial loan date based on latest payment or pawn start date
        if (latestPaymentPaidDate) {
          setMinDate(latestPaymentPaidDate);
          // Set loan date to the day after the latest payment date
          const nextDay = addDays(new Date(latestPaymentPaidDate), 1);
          setLoanDate(format(nextDay, 'yyyy-MM-dd'));
        } else if (pawnData?.loan_date) {
          // If no payment exists, set to pawn start date
          setLoanDate(pawnData.loan_date);
        }
      } catch (err) {
        console.error('Error in fetchData:', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchLatestPaymentPaidDate();
  }, [pawnId]);

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
      // Kiểm tra xem ngày vay thêm có trước ngày bắt đầu cầm không
      if (pawnData?.loan_date && new Date(loanDate) < new Date(pawnData.loan_date)) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Ngày vay thêm không thể trước ngày bắt đầu cầm"
        });
        return;
      }
    }

    // Validate date is not before min date
    if (minDate && new Date(loanDate) <= new Date(minDate)) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: `Ngày vay thêm không thể trước ngày bắt đầu cầm hoặc trước kỳ đóng lãi gần nhất ${minDate}`
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
    
    // Reset form after successful submission
    setAmount(0);
    setFormattedAmount('');
    setNotes('');
    setLoanDate(format(new Date(), 'yyyy-MM-dd'));
    
    onSuccess?.();
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