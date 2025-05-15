import React from 'react';
import { format } from 'date-fns';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { CreditWithCustomer, InterestType } from '@/models/credit';

interface LatePaymentHistoryTabProps {
  credit: CreditWithCustomer;
}

export function LatePaymentHistoryTab({ credit }: LatePaymentHistoryTabProps) {
  // Helper function to calculate interest amount based on credit details
  const calculateInterestAmount = (credit: CreditWithCustomer | null) => {
    if (!credit) return 0;
    
    if (credit.interest_type === InterestType.PERCENTAGE) {
      // For percentage interest: loan_amount * (interest_value/100/30) * days * 30
      return Math.round(credit.loan_amount * (credit.interest_value / 100 / 30) * credit.interest_period * 30);
    } else {
      // For fixed interest: (interest_value/interest_period) * days * interest_period
      return Math.round((credit.interest_value / credit.interest_period) * credit.interest_period * credit.interest_period);
    }
  }
  
  // Format currency helper
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="p-4">
      <SectionHeader
        icon={<Icon name="calendar" />}
        title="Thông tin khách hàng trả chậm"
        color="amber"
      />
      
      <div className="border rounded-md overflow-hidden mb-4">
        <div className="bg-gray-50 p-2 border-b">
          <div className="grid grid-cols-4 gap-4">
            <div className="font-medium text-center">Hợp đồng</div>
            <div className="font-medium text-center">Từ ngày</div>
            <div className="font-medium text-center">Đến ngày</div>
            <div className="font-medium text-center">Số ngày</div>
          </div>
        </div>
        <EmptyState message="Chưa có lịch sử trả chậm" />
      </div>
    </div>
  );
}
