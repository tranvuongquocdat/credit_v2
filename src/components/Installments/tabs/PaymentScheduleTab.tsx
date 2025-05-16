import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { DataTable, Column } from '@/components/ui/DataTable';

interface PaymentScheduleTabProps {
  installmentId: string;
}

// Define mock payment schedule type
interface SchedulePayment {
  id: string;
  date: string;
  amount: number;
  status: 'pending' | 'paid' | 'late';
}

export function PaymentScheduleTab({ installmentId }: PaymentScheduleTabProps) {
  const [schedule, setSchedule] = useState<SchedulePayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Simulate API call to get payment schedule
    const fetchPaymentSchedule = async () => {
      try {
        setIsLoading(true);
        // Wait for mock loading
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Generate mock data for the next 30 days
        const today = new Date();
        const mockSchedule: SchedulePayment[] = Array.from({ length: 30 }, (_, i) => {
          const date = new Date(today);
          date.setDate(today.getDate() + i);
          
          // Determine status based on date
          let status: 'pending' | 'paid' | 'late' = 'pending';
          if (i < 3) {
            status = 'paid'; // First 3 days are paid
          } else if (i === 3) {
            status = 'late'; // The 4th day is late for demo
          }
          
          return {
            id: `payment-${i+1}`,
            date: date.toISOString(),
            amount: 350000, // Daily payment amount
            status
          };
        });
        
        setSchedule(mockSchedule);
      } catch (error) {
        console.error('Error fetching payment schedule:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPaymentSchedule();
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
      render: (value) => format(new Date(value), 'dd-MM-yyyy')
    },
    {
      key: 'amount',
      label: 'Số tiền',
      render: (value) => formatCurrency(value as number)
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (value) => {
        switch (value) {
          case 'paid':
            return <span className="text-green-600 font-medium">Đã thanh toán</span>;
          case 'late':
            return <span className="text-red-600 font-medium">Quá hạn</span>;
          default:
            return <span className="text-gray-600">Chưa đến hạn</span>;
        }
      }
    }
  ];
  
  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
        <p>Đang tải lịch trả góp...</p>
      </div>
    );
  }
  
  return (
    <div className="p-4">
      <SectionHeader
        icon={<Icon name="calendar" />}
        title="Lịch trả góp"
        color="blue"
      />
      
      {schedule.length === 0 ? (
        <EmptyState message="Không tìm thấy lịch trả góp" />
      ) : (
        <DataTable
          columns={columns}
          data={schedule}
          emptyMessage="Không tìm thấy lịch trả góp"
        />
      )}
    </div>
  );
}
