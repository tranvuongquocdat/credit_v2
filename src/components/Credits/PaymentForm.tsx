'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { format, addDays, differenceInDays } from 'date-fns';
import { vi } from 'date-fns/locale';

interface PaymentFormProps {
  onClose: () => void;
  defaultStartDate?: Date;
  defaultEndDate?: Date;
  defaultAmount?: number;
  creditId?: string;
  interestCalculator?: (startDate: string, endDate: string) => number;
  onSubmit: (data: {
    startDate: string;
    endDate: string;
    days: number;
    interestAmount: number;
    otherAmount: number;
    totalAmount: number;
  }) => void;
}

export function PaymentForm({
  onClose,
  defaultStartDate = new Date(),
  defaultEndDate = addDays(new Date(), 8),
  defaultAmount = 128000,
  creditId,
  interestCalculator,
  onSubmit
}: PaymentFormProps) {
  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const [startDate, setStartDate] = useState(format(defaultStartDate, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(defaultEndDate, 'yyyy-MM-dd'));
  const [days, setDays] = useState(differenceInDays(defaultEndDate, defaultStartDate).toString());
  
  // State for monetary amounts with formatting
  const [interestAmount, setInterestAmount] = useState(defaultAmount.toString());
  const [formattedInterestAmount, setFormattedInterestAmount] = useState(formatNumber(defaultAmount.toString()));
  
  const [otherAmount, setOtherAmount] = useState('0');
  const [formattedOtherAmount, setFormattedOtherAmount] = useState('0');

  // Recalculate interest when dates change
  useEffect(() => {
    try {
      if (interestCalculator && startDate && endDate) {
        // Calculate days between dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        const daysDiff = differenceInDays(end, start) + 1;
        setDays(daysDiff.toString());
        
        // Calculate interest using the provided calculator
        const calculatedInterest = interestCalculator(startDate, endDate);
        setInterestAmount(calculatedInterest.toString());
        setFormattedInterestAmount(formatNumber(calculatedInterest));
      } else {
        // Calculate days between dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        const daysDiff = differenceInDays(end, start) + 1;
        setDays(daysDiff.toString());
      }
    } catch (err) {
      console.error('Error calculating interest:', err);
    }
  }, [startDate, endDate, interestCalculator]);
  
  // Handle start date change
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };
  
  // Handle end date change
  const handleEndDateChange = (value: string) => {
    setEndDate(value);
  };
  
  // Handle interest amount change
  const handleInterestAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, '');
    setInterestAmount(rawValue);
    setFormattedInterestAmount(formatNumber(rawValue));
  };
  
  // Handle other amount change
  const handleOtherAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, '');
    setOtherAmount(rawValue);
    setFormattedOtherAmount(formatNumber(rawValue));
  };
  
  // Tính tổng tiền
  const totalAmount = Number(interestAmount) + Number(otherAmount);
  
  // Tính ngày đóng tiếp theo
  const nextPaymentDate = format(
    addDays(new Date(endDate), Number(days)),
    'dd-MM-yyyy'
  );
  
  // Xử lý nộp form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      startDate,
      endDate,
      days: Number(days),
      interestAmount: Number(interestAmount),
      otherAmount: Number(otherAmount),
      totalAmount
    });
  };
  
  return (
    <div className="border rounded-md p-4 bg-white">
      <h3 className="font-medium mb-4">Đóng lãi phí tùy biến theo ngày</h3>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-[150px_1fr] gap-y-4 items-center">
          <div className="text-right pr-2">Từ ngày :</div>
          <div>
            <DatePicker 
              value={startDate} 
              onChange={handleStartDateChange}
              className="w-64"
            />
          </div>
          
          <div className="text-right pr-2">Đến ngày :</div>
          <div className="flex items-center gap-3">
            <DatePicker 
              value={endDate} 
              onChange={handleEndDateChange}
              className="w-64"
            />
            <span>( Ngày đóng lãi phí tiếp : <span className="text-blue-600">{nextPaymentDate}</span> )</span>
          </div>
          
          <div className="text-right pr-2">Số ngày :</div>
          <div className="flex items-center gap-2">
            <Input 
              value={days} 
              onChange={(e) => setDays(e.target.value)}
              className="w-64"
              type="number"
              readOnly={!!interestCalculator}
            />
            <span className="text-blue-600">Ngày</span>
          </div>
          
          <div className="text-right pr-2">Tiền lãi phí :</div>
          <div className="flex items-center gap-3">
            <Input 
              value={formattedInterestAmount} 
              onChange={handleInterestAmountChange}
              className="w-48"
              inputMode="numeric"
              type="text"
              readOnly={!!interestCalculator}
            />
            <span className="text-gray-500 text-sm">VNĐ (Tiền lãi suất phải trả)</span>
          </div>
          
          <div className="text-right pr-2">Tiền khác :</div>
          <div className="flex items-center gap-3">
            <Input 
              value={formattedOtherAmount} 
              onChange={handleOtherAmountChange}
              className="w-48"
              inputMode="numeric"
              type="text"
            />
            <span className="text-gray-500 text-sm">VNĐ (Chi phí khác nếu có)</span>
          </div>
          
          <div className="text-right pr-2">Tổng tiền lãi phí :</div>
          <div className="text-red-600 font-bold">
            {new Intl.NumberFormat('vi-VN').format(totalAmount)} VNĐ
          </div>
          
          <div></div>
          <div className="mt-3">
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              Đóng lãi
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
