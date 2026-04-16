'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { format, addDays, differenceInDays } from 'date-fns';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { usePermissions } from '@/hooks/usePermissions';

interface PawnPaymentFormProps {
  isOpen: boolean;
  onClose: () => void;
  pawn: PawnWithCustomerAndCollateral;
  selectedPeriods: any[];
  onSuccess: (data: {
    startDate: string;
    endDate: string;
    days: number;
    interestAmount: number;
    otherAmount: number;
    totalAmount: number;
  }) => void;
  interestCalculator?: (startDate: string, endDate: string) => Promise<number>;
  loanDate?: string;
  loanPeriod?: number;
  interestPeriod?: number;
  lastPaymentEndDate?: string;
  disabled?: boolean;
}

export function PawnPaymentForm({
  isOpen,
  onClose,
  pawn,
  selectedPeriods,
  onSuccess,
  interestCalculator,
  loanDate,
  loanPeriod = 30,
  interestPeriod = 10,
  lastPaymentEndDate,
  disabled
}: PawnPaymentFormProps) {
  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // Tính ngày bắt đầu dựa trên kỳ thanh toán cuối cùng
  const [startDate, setStartDate] = useState<string>(() => {
    if (lastPaymentEndDate) {
      // Ngày bắt đầu = ngày kết thúc kỳ thanh toán cuối + 1
      const nextDay = addDays(new Date(lastPaymentEndDate), 1);
      return format(nextDay, 'yyyy-MM-dd');
    } else if (loanDate || pawn.loan_date) {
      // Nếu không có kỳ thanh toán nào, sử dụng ngày vay
      return format(new Date(loanDate || pawn.loan_date), 'yyyy-MM-dd');
    }
    return format(new Date(), 'yyyy-MM-dd');
  });

  // Mặc định số ngày = interestPeriod nếu có
  const [days, setDays] = useState<string>((interestPeriod || pawn.interest_period || 10).toString());
  
  // Tính ngày kết thúc dựa trên ngày bắt đầu và số ngày
  const [endDate, setEndDate] = useState<string>(() => {
    const start = new Date(startDate);
    const end = addDays(start, parseInt(days) - 1); // trừ 1 vì đã bao gồm ngày bắt đầu
    return format(end, 'yyyy-MM-dd');
  });

  // State for monetary amounts with formatting
  const [interestAmount, setInterestAmount] = useState('0');
  const [formattedInterestAmount, setFormattedInterestAmount] = useState('0');
  
  const [otherAmount, setOtherAmount] = useState('0');
  const [formattedOtherAmount, setFormattedOtherAmount] = useState('0');

  // State để track việc đang tính toán
  const [isCalculating, setIsCalculating] = useState(false);
  const { hasPermission } = usePermissions();
  // Recalculate end date when days change
  useEffect(() => {
    const start = new Date(startDate);
    const end = addDays(start, parseInt(days) - 1);
    setEndDate(format(end, 'yyyy-MM-dd'));
  }, [days, startDate]);
  
  // Recalculate interest when dates change - XỬ LÝ ASYNC ĐÚNG CÁCH
  useEffect(() => {
    async function calculateInterest() {
      if (!interestCalculator || !startDate || !endDate) {
        setInterestAmount('0');
        setFormattedInterestAmount('0');
        return;
      }

      setIsCalculating(true);
      try {
        console.log(`Calculating pawn interest for ${startDate} → ${endDate}`);
        const calculatedInterest = await interestCalculator(startDate, endDate);
        console.log('Calculated pawn interest result:', calculatedInterest);
        
        setInterestAmount(calculatedInterest.toString());
        setFormattedInterestAmount(formatNumber(calculatedInterest));
      } catch (err) {
        console.error('Error calculating pawn interest:', err);
        setInterestAmount('0');
        setFormattedInterestAmount('0');
      } finally {
        setIsCalculating(false);
      }
    }
    
    calculateInterest();
  }, [startDate, endDate, interestCalculator]);
  
  // Handle days change
  const handleDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDays = e.target.value;
    if (parseInt(newDays) > 0) {
      setDays(newDays);
    }
  };
  
  // Handle other amount change - hỗ trợ số âm
  const handleOtherAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const isNegative = input.startsWith('-');
    const digits = input.replace(/[^0-9]/g, '');
    // rawValue: "-50000", "50000", hoặc "-" (trạng thái trung gian)
    const rawValue = isNegative ? (digits ? `-${digits}` : '-') : digits;
    setOtherAmount(rawValue);
    // Format hiển thị với dấu chấm ngăn cách hàng nghìn
    const formattedDigits = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setFormattedOtherAmount(isNegative ? (digits ? `-${formattedDigits}` : '-') : formattedDigits);
  };
  
  // Tính tổng tiền
  const totalAmount = Number(interestAmount) + (Number(otherAmount) || 0);
  
  // Tính ngày đóng tiếp theo dựa trên kỳ hạn
  const nextPaymentDate = (() => {
    const end = new Date(endDate);
    
    const currentInterestPeriod = interestPeriod || pawn.interest_period || 10;
    const currentLoanPeriod = loanPeriod || pawn.loan_period || 30;
    const currentLoanDate = loanDate || pawn.loan_date;
    
    if (currentInterestPeriod) {
      // Nếu có interestPeriod, sử dụng nó để tính ngày đóng tiếp theo
      const nextStartDate = new Date(end);
      nextStartDate.setDate(end.getDate() + 1);
      
      const nextEndDate = new Date(nextStartDate);
      nextEndDate.setDate(nextStartDate.getDate() + currentInterestPeriod - 1);
      
      // Nếu có loanPeriod, kiểm tra không vượt quá thời hạn vay
      if (currentLoanDate && currentLoanPeriod) {
        const loanStartDate = new Date(currentLoanDate);
        const contractEndDate = new Date(loanStartDate);
        contractEndDate.setDate(loanStartDate.getDate() + currentLoanPeriod - 1);
        
        if (nextEndDate > contractEndDate) {
          // Nếu vượt quá ngày kết thúc hợp đồng, trả về "Hoàn thành"
          return "Hoàn thành";
        }
      }
      
      return format(nextEndDate, 'dd-MM-yyyy');
    } else {
      // Nếu không có interestPeriod, dùng số ngày của kỳ hiện tại
      return format(addDays(end, Number(days)), 'dd-MM-yyyy');
    }
  })();
  
  // Xử lý nộp form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSuccess({
      startDate,
      endDate,
      days: Number(days),
      interestAmount: Number(interestAmount),
      otherAmount: Number(otherAmount) || 0,
      totalAmount
    });
  };
  
  // Format ngày để hiển thị
  const formattedEndDate = format(new Date(endDate), 'dd/MM/yyyy');

  return (
    <div className="border rounded-md p-4 bg-white">
      <h3 className="font-medium mb-4">Đóng lãi phí tùy biến theo ngày</h3>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-[150px_1fr] gap-y-4 items-center">
          <div className="text-right pr-2">Từ ngày :</div>
          <div className="flex items-center gap-2">
            <DatePicker 
              value={startDate} 
              onChange={() => {}} // không cho phép thay đổi
              className="w-64"
              disabled={true}
            />
            <span className="text-gray-500">(Tự động tính từ kỳ trước)</span>
          </div>

          <div className="text-right pr-2">Số ngày :</div>
          <div className="flex items-center gap-2">
            <Input 
              value={days} 
              onChange={handleDaysChange}
              className="w-64"
              type="number"
              min="1"
              disabled={disabled}
            />
            <span className="text-blue-600">Ngày</span>
          </div>

          <div className="text-right pr-2">Đến ngày :</div>
          <div className="text-blue-600">
            {formattedEndDate}
            <span className="ml-3 text-gray-500">
              {nextPaymentDate === "Hoàn thành" 
                ? "( Đây là kỳ cuối cùng )" 
                : `( Ngày đóng lãi phí tiếp: ${nextPaymentDate} )`}
            </span>
            </div>

          <div className="text-right pr-2">Tiền lãi phí :</div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Input
                value={formattedInterestAmount}
                className="w-48 bg-gray-50 cursor-not-allowed"
                inputMode="numeric"
                type="text"
                disabled={true}
              />
              {isCalculating && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin"></div>
                </div>
              )}
            </div>
            <span className="text-gray-500 text-sm">VNĐ (Tự động tính, không thể thay đổi)</span>
          </div>

          <div className="text-right pr-2">Tổng tiền lãi phí :</div>
          <div className="text-red-600 font-bold">
            {new Intl.NumberFormat('vi-VN').format(totalAmount)} VNĐ
          </div>

          <div></div>
          <div className="mt-3">
            <Button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700" 
              disabled={disabled || isCalculating || !hasPermission('dong_lai_cam_do')}
            >
              {isCalculating ? 'Đang tính...' : 'Đóng lãi'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
} 