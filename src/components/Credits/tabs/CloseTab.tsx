'use client';

import { CreditWithCustomer } from '@/models/credit';
import { Button } from '@/components/ui/button';
import { calculateInterestAmount } from '@/lib/interest-calculator';

interface CloseTabProps {
  credit: CreditWithCustomer;
}

export function CloseTab({ credit }: CloseTabProps) {
  return (
    <div className="p-4">
      <div className="bg-red-50 border border-red-200 rounded-md p-4 text-center">
        <div className="text-lg mb-2">Tổng số tiền phải thanh toán để đóng hợp đồng:</div>
        <div className="text-red-600 font-medium">
          {((credit?.loan_amount || 0) + (calculateInterestAmount(credit, 30) || 0)).toLocaleString('vi-VN')} vnd
        </div>
      </div>
      
      <div className="mt-6 flex justify-center">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8">
          Đóng HĐ
        </Button>
      </div>
    </div>
  );
}
