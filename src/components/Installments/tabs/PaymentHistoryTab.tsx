import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { DataTable, Column } from '@/components/ui/DataTable';

// Define props interface
interface PaymentHistoryTabProps {
  installmentId: string;
}

// Mock payment type
interface Payment {
  id: string;
  amount: number;
  date: string;
  notes?: string;
}

export function PaymentHistoryTab({ installmentId }: PaymentHistoryTabProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Simulate API call to get payment history
    const fetchPaymentHistory = async () => {
      try {
        setIsLoading(true);
        // Wait for mock loading
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Mock data
        const mockPayments: Payment[] = [
          {
            id: '1',
            amount: 350000,
            date: new Date(new Date().setDate(new Date().getDate() - 20)).toISOString(),
            notes: 'Thanh toán đúng hẹn'
          },
          {
            id: '2',
            amount: 350000,
            date: new Date(new Date().setDate(new Date().getDate() - 10)).toISOString(),
            notes: 'Thanh toán đúng hẹn'
          },
          {
            id: '3',
            amount: 350000,
            date: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
            notes: 'Thanh toán sớm 1 ngày'
          }
        ];
        
        setPayments(mockPayments);
      } catch (error) {
        console.error('Error fetching payment history:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPaymentHistory();
  }, [installmentId]);
  
  // Format currency helper
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(amount);
  };
  
  // Table columns configuration
  const columns: Column[] = [
    {
      key: 'date',
      label: 'Ngày thanh toán',
      render: (value) => (value ? format(new Date(value), 'dd-MM-yyyy') : '')
    },
    {
      key: 'amount',
      label: 'Số tiền',
      render: (value) => formatCurrency(value as number)
    },
    {
      key: 'notes',
      label: 'Ghi chú',
      render: (value) => value || '-'
    }
  ];
  
  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
        <p>Đang tải lịch sử thanh toán...</p>
      </div>
    );
  }
  
  return (
    <div className="p-4">
      <SectionHeader
        icon={<Icon name="calendar" />}
        title="Lịch sử thanh toán"
        color="green"
      />
      
      {payments.length === 0 ? (
        <EmptyState message="Chưa có lịch sử thanh toán nào" />
      ) : (
        <DataTable
          columns={columns}
          data={payments}
          emptyMessage="Chưa có lịch sử thanh toán nào"
        />
      )}
    </div>
  );
}
