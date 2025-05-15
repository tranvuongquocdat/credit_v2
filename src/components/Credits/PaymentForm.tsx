'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, addDays } from 'date-fns';
import { vi } from 'date-fns/locale';

interface PaymentFormProps {
  onClose: () => void;
  defaultStartDate?: Date;
  defaultEndDate?: Date;
  defaultAmount?: number;
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
  onSubmit
}: PaymentFormProps) {
  const [startDate, setStartDate] = useState(format(defaultStartDate, 'dd-MM-yyyy'));
  const [endDate, setEndDate] = useState(format(defaultEndDate, 'dd-MM-yyyy'));
  const [days, setDays] = useState('8');
  const [interestAmount, setInterestAmount] = useState(defaultAmount.toString());
  const [otherAmount, setOtherAmount] = useState('0');
  
  // Tính tổng tiền
  const totalAmount = Number(interestAmount) + Number(otherAmount);
  
  // Tính ngày đóng tiếp theo
  const nextPaymentDate = format(
    addDays(defaultEndDate, 8),
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
            <Input 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="w-64"
            />
          </div>
          
          <div className="text-right pr-2">Đến ngày :</div>
          <div className="flex items-center gap-3">
            <Input 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
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
            />
            <span className="text-blue-600">Ngày</span>
          </div>
          
          <div className="text-right pr-2">Tiền lãi phí :</div>
          <div>
            <Input 
              value={interestAmount} 
              onChange={(e) => setInterestAmount(e.target.value)}
              className="w-64"
              type="number"
            />
            <span className="text-gray-500 text-sm ml-2">VNĐ</span>
          </div>
          
          <div className="text-right pr-2">Tiền khác :</div>
          <div>
            <Input 
              value={otherAmount} 
              onChange={(e) => setOtherAmount(e.target.value)}
              className="w-64"
              type="number"
            />
            <span className="text-gray-500 text-sm ml-2">VNĐ</span>
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
