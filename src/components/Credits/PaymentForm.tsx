'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { format, addDays, differenceInDays } from 'date-fns';
import { toast } from '@/components/ui/use-toast';

interface PaymentFormProps {
  onClose: () => void;
  defaultStartDate?: Date;
  defaultEndDate?: Date;
  defaultAmount?: number;
  creditId?: string;
  interestCalculator?: (startDate: string, endDate: string) => Promise<number>;
  onSubmit: (data: {
    startDate: string;
    endDate: string;
    days: number;
    interestAmount: number;
    totalAmount: number;
  }) => void;
  // Thêm các thông tin về kỳ hạn từ credit
  loanDate?: string;
  loanPeriod?: number;
  interestPeriod?: number;
  // Thêm thông tin về kỳ thanh toán cuối cùng
  lastPaymentEndDate?: string | null;
  // Thêm prop disabled
  disabled?: boolean;
}

export function PaymentForm({
  defaultStartDate = new Date(),
  interestCalculator,
  onSubmit,
  loanDate,
  loanPeriod = 30,
  interestPeriod = 10,
  lastPaymentEndDate,
  disabled = false
}: PaymentFormProps) {
  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // Tính ngày bắt đầu dựa trên kỳ thanh toán cuối cùng
  const [startDate, setStartDate] = useState<string>(() => {
    if (lastPaymentEndDate) {
      const nextDay = addDays(new Date(lastPaymentEndDate), 1);
      return format(nextDay, 'yyyy-MM-dd');
    } else if (loanDate) {
      return format(new Date(loanDate), 'yyyy-MM-dd');
    }
    return format(defaultStartDate, 'yyyy-MM-dd');
  });

  // Mặc định số ngày = interestPeriod nếu có
  const [days, setDays] = useState<string>(interestPeriod ? interestPeriod.toString() : '2');
  
  // Tính ngày kết thúc dựa trên ngày bắt đầu và số ngày
  const [endDate, setEndDate] = useState<string>(() => {
    const start = new Date(startDate);
    const end = addDays(start, parseInt(days) - 1);
    return format(end, 'yyyy-MM-dd');
  });
  
  // State for monetary amounts - interestAmount sẽ được tính tự động
  const [interestAmount, setInterestAmount] = useState(0);
  const [formattedInterestAmount, setFormattedInterestAmount] = useState('0');
  
  // State để track việc đang tính toán
  const [isCalculating, setIsCalculating] = useState(false);

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
        setInterestAmount(0);
        setFormattedInterestAmount('0');
        return;
      }

      setIsCalculating(true);
      try {
        console.log(`Calculating interest for ${startDate} → ${endDate}`);
        const calculatedInterest = await interestCalculator(startDate, endDate);
        console.log('Calculated interest result:', calculatedInterest);
        
        setInterestAmount(calculatedInterest);
        setFormattedInterestAmount(formatNumber(calculatedInterest));
      } catch (err) {
        console.error('Error calculating interest:', err);
        setInterestAmount(0);
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

  
  // Tính tổng tiền
  const totalAmount = interestAmount;
  
  // Tính ngày đóng tiếp theo dựa trên kỳ hạn
  const nextPaymentDate = (() => {
    const end = new Date(endDate);
    
    if (interestPeriod) {
      // Nếu có interestPeriod, sử dụng nó để tính ngày đóng tiếp theo
      const nextStartDate = new Date(end);
      nextStartDate.setDate(end.getDate() + 1);
      
      const nextEndDate = new Date(nextStartDate);
      nextEndDate.setDate(nextStartDate.getDate() + interestPeriod - 1);
      
      // Nếu có loanPeriod, kiểm tra không vượt quá thời hạn vay
      if (loanDate && loanPeriod) {
        const loanStartDate = new Date(loanDate);
        const contractEndDate = new Date(loanStartDate);
        contractEndDate.setDate(loanStartDate.getDate() + loanPeriod - 1);
        
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
  
  // Add validation function
  const isEndDateValid = (end: Date): boolean => {
    if (!loanDate || !loanPeriod) return true;
    
    const loanStartDate = new Date(loanDate);
    const contractEndDate = new Date(loanStartDate);
    contractEndDate.setDate(loanStartDate.getDate() + loanPeriod - 1);
    
    return end <= contractEndDate;
  };

  // Update handleSubmit to include validation
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const end = new Date(endDate);
    if (!isEndDateValid(end)) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Ngày kết thúc không được vượt quá ngày kết thúc hợp đồng"
      });
      return;
    }

    onSubmit({
      startDate,
      endDate,
      days: Number(days),
      interestAmount: interestAmount,
      totalAmount
    });
  };
  
  // Format ngày để hiển thị
  const formattedStartDate = format(new Date(startDate), 'dd/MM/yyyy');
  const formattedEndDate = format(new Date(endDate), 'dd/MM/yyyy');
  
  // Simple handler for manual editing
  const handleInterestAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    const numericValue = parseInt(value) || 0;
    
    setInterestAmount(numericValue);
    setFormattedInterestAmount(formatNumber(value));
  };

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
                onChange={handleInterestAmountChange}
                className="w-48"
                type="text"
                disabled={disabled}
              />
              {isCalculating && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin"></div>
                </div>
              )}
            </div>
            <span className="text-gray-500 text-sm">VNĐ (Tự động tính khi thay đổi số ngày)</span>
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
              disabled={disabled || isCalculating}
            >
              {isCalculating ? 'Đang tính...' : 'Đóng lãi'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
