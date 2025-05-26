import { useState, useEffect } from 'react';
import { format, addDays, max } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from '@/components/ui/use-toast';
import { getPawnPaymentPeriods } from '@/lib/pawn-payment';
import { getPawnById } from '@/lib/pawn';

interface PrincipalRepaymentFormProps {
  onSubmit: (data: {
    repaymentDate: string;
    amount: number;
    notes?: string;
  }) => void;
  pawnId: string;
}

export function PrincipalRepaymentForm({ onSubmit, pawnId }: PrincipalRepaymentFormProps) {
  const [repaymentDate, setRepaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState<number>(0);
  const [formattedAmount, setFormattedAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [minDate, setMinDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [maxAmount, setMaxAmount] = useState<number>(0);

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
    const numericValue = Number(rawValue);
    
    // Don't allow amount greater than max amount
    if (numericValue <= maxAmount) {
      setAmount(numericValue);
      setFormattedAmount(formatNumber(rawValue));
    }
  };

  useEffect(() => {
    async function fetchData() {
      if (!pawnId) return;
      
      setIsLoading(true);
      try {
        // Fetch pawn info to get the loan_date and current loan_amount
        const { data: pawnData, error: pawnError } = await getPawnById(pawnId);
        
        if (pawnError) {
          console.error('Error fetching pawn info:', pawnError);
          return;
        }
        
        // Set maximum amount as current loan amount
        setMaxAmount(pawnData?.loan_amount || 0);
        
        // Set minimum date as loan start date
        const loanStartDate = pawnData?.loan_date ? new Date(pawnData.loan_date) : new Date();
        
        // Fetch payment periods to get the most recent period
        const { data, error } = await getPawnPaymentPeriods(pawnId);
        
        if (error) {
          console.error('Error fetching payment periods:', error);
          return;
        }
        
        if (data && data.length > 0) {
          // Sort by end_date to find the most recent period
          const sortedPeriods = [...data].sort((a, b) => 
            new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
          );
          
          // Get the most recent period
          const lastPeriod = sortedPeriods[0];
          
          // Set the repayment date to the day after the end_date of the most recent period
          if (lastPeriod.end_date) {
            const nextDay = addDays(new Date(lastPeriod.end_date), 1);
            
            // The date should be the maximum of loan start date and the day after the last period
            const finalDate = max([loanStartDate, nextDay]);
            
            setRepaymentDate(format(finalDate, 'yyyy-MM-dd'));
            setMinDate(format(finalDate, 'yyyy-MM-dd'));
          } else {
            setMinDate(format(loanStartDate, 'yyyy-MM-dd'));
          }
        } else {
          // If no payment periods, use loan start date
          setMinDate(format(loanStartDate, 'yyyy-MM-dd'));
        }
      } catch (err) {
        console.error('Error in fetchData:', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchData();
  }, [pawnId]);

  const handleDateChange = (date: string) => {
    // Only set the date if it's not before the minimum date
    const selectedDate = new Date(date);
    const minimum = new Date(minDate);
    
    if (selectedDate >= minimum) {
      setRepaymentDate(date);
    } else {
      // If the date is before the minimum, show a warning and set to minimum
      toast({
        variant: "destructive",
        title: "Cảnh báo",
        description: "Đã chọn ngày tối thiểu được phép"
      });
      setRepaymentDate(minDate);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (amount <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập số tiền trả bớt gốc"
      });
      return;
    }

    if (amount > maxAmount) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Số tiền trả không thể lớn hơn số tiền gốc hiện tại"
      });
      return;
    }

    // Validate date is not before min date
    if (new Date(repaymentDate) < new Date(minDate)) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Ngày trả bớt gốc không thể trước ngày bắt đầu cầm hoặc trước kỳ đóng lãi gần nhất"
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
      <h3 className="text-lg font-medium mb-4">Trả bớt gốc</h3>
      
      <div className="grid grid-cols-1 gap-4">
        {/* Ngày trả bớt gốc */}
        <div className="flex items-center">
          <label htmlFor="repaymentDate" className="w-48 text-right mr-4">Ngày trả bớt gốc</label>
          <div className="relative w-64">
            <DatePicker
              id="repaymentDate"
              value={repaymentDate}
              onChange={handleDateChange}
              className="w-full"
              disabled={isLoading}
            />
          </div>
        </div>
        
        {/* Số tiền trả bớt gốc */}
        <div className="flex items-center">
          <label htmlFor="amount" className="w-48 text-right mr-4">
            Số tiền trả bớt gốc
            <span className="text-red-500 ml-1">*</span>
          </label>
          <div className="w-64">
            <input
              id="amount"
              type="text"
              className="border rounded px-2 py-1 w-full"
              value={formattedAmount}
              onChange={handleAmountChange}
              placeholder="0"
              inputMode="numeric"
            />
            <div className="text-xs text-gray-500 mt-1">
              Tối đa: {formatNumber(maxAmount)}
            </div>
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
          />
        </div>
      </div>
      
      {/* Nút đồng ý */}
      <div className="flex justify-end mt-4">
        <Button 
          type="submit" 
          className="bg-blue-600 hover:bg-blue-700 text-white"
          disabled={isLoading}
        >
          Đồng ý
        </Button>
      </div>
    </form>
  );
} 