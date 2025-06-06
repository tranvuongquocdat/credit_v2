import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from '@/components/ui/use-toast';
import { getPawnById } from '@/lib/pawn';
import { getLatestPaymentPaidDate } from '@/lib/Pawns/get_latest_payment_paid_date';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';

interface PrincipalRepaymentFormProps {
  onSubmit: (data: {
    repaymentDate: string;
    amount: number;
    notes?: string;
  }) => void;
  pawnId: string;
  disabled?: boolean;
  onSuccess?: () => void;
}

export function PrincipalRepaymentForm({ onSubmit, pawnId, disabled = false, onSuccess }: PrincipalRepaymentFormProps) {
  const [repaymentDate, setRepaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState<number>(0);
  const [formattedAmount, setFormattedAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [minDateStr, setMinDateStr] = useState<string | null>(null);
  const [maxDateStr, setMaxDateStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [actualLoanAmount, setActualLoanAmount] = useState<number>(0);
  const [loadingActualAmount, setLoadingActualAmount] = useState<boolean>(false);
  const [pawnData, setPawnData] = useState<PawnWithCustomerAndCollateral | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    const numericValue = value.toString().replace(/[^0-9]/g, '');
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

  // Load actual loan amount (current loan amount after principal changes)
  useEffect(() => {
    async function loadActualLoanAmount() {
      if (!pawnId) return;
      
      setLoadingActualAmount(true);
      try {
        const { data: pawnData, error } = await getPawnById(pawnId);
        if (error || !pawnData) {
          throw new Error('Không thể lấy thông tin hợp đồng');
        }
        
        // For pawns, the actual loan amount is simply the current loan_amount
        setActualLoanAmount(pawnData.loan_amount);
        setPawnData(pawnData);
        
        // Calculate contract end date
        const endDate = addDays(new Date(pawnData.loan_date), (pawnData.loan_period || 30) - 1);
        setMaxDateStr(format(endDate, 'yyyy-MM-dd'));
      } catch (error) {
        console.error('Error loading actual loan amount:', error);
        setActualLoanAmount(0);
      } finally {
        setLoadingActualAmount(false);
      }
    }

    loadActualLoanAmount();
  }, [pawnId, refreshTrigger]);

  // Load latest payment paid date for validation
  useEffect(() => {
    async function fetchLatestPaymentPaidDate() {
      if (!pawnId) return;
      
      setIsLoading(true);
      try {
        const latestPaymentPaidDate = await getLatestPaymentPaidDate(pawnId);
        console.log('Latest payment paid date:', latestPaymentPaidDate);
        if (latestPaymentPaidDate) {
          setMinDateStr(latestPaymentPaidDate);
        }
      } catch (err) {
        console.error('Error fetching latest payment date:', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchLatestPaymentPaidDate();
  }, [pawnId, refreshTrigger]);

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
        description: "Vui lòng nhập số tiền trả bớt gốc"
      });
      return;
    }
    
    // Validate date is not before loan start date
    if (!minDateStr) {
      if (pawnData?.loan_date && new Date(repaymentDate) < new Date(pawnData.loan_date)) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Ngày trả bớt gốc không thể trước ngày bắt đầu cầm"
        });
        return;
      }
    }
    
    // Validate date is not before latest payment date
    if (minDateStr && new Date(repaymentDate) <= new Date(minDateStr)) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: `Ngày trả bớt gốc không thể trước ngày bắt đầu cầm hoặc trước kỳ đóng lãi gần nhất ${minDateStr}`
      });
      return;
    }

    // Validate date is not after contract end date
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
        description: `Số tiền trả bớt gốc không thể vượt quá số tiền cầm hiện tại (${formatCurrency(actualLoanAmount)})`
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
      <h3 className="text-lg font-medium mb-4">Trả bớt gốc</h3>
      
      {/* Hiển thị số tiền cầm hiện tại */}
      {loadingActualAmount ? (
        <div className="mb-4 p-2 bg-blue-50 rounded border text-sm text-blue-700">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin"></div>
            Đang tải thông tin số tiền cầm...
          </div>
        </div>
      ) : (
        <div className="mb-4 p-2 bg-blue-50 rounded border text-sm text-blue-700">
          <strong>Số tiền cầm hiện tại: {formatCurrency(actualLoanAmount)}</strong>
        </div>
      )}
      
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
              disabled={isLoading || disabled}
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
                Vượt quá số tiền cầm hiện tại
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