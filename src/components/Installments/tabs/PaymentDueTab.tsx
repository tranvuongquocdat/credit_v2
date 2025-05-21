import React, { useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, X } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';

interface PaymentDueTabProps {
  installmentId: string;
}

export function PaymentDueTab({ installmentId }: PaymentDueTabProps) {
  // Sample data for demonstration - in real app, this would come from an API
  const [schedules] = useState([
    {
      id: 1,
      status: 'active',
      scheduleDate: '2025-05-15',
      content: '',
      createdAt: '2025-05-15'
    },
    {
      id: 2,
      status: 'inactive',
      scheduleDate: '',
      content: '',
      createdAt: '2025-05-15'
    },
    {
      id: 3,
      status: 'active',
      scheduleDate: '2025-05-16',
      content: '',
      createdAt: '2025-05-15'
    },
    {
      id: 4,
      status: 'inactive',
      scheduleDate: '',
      content: '',
      createdAt: '2025-05-15'
    }
  ]);
  
  // Table columns configuration
  const columns: Column[] = [
    {
      key: 'id',
      label: 'STT',
      className: 'px-4 py-3 text-sm text-gray-700 text-center w-16',
      render: (value) => value
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (value) => (
        <span className={`font-medium ${value === 'inactive' ? 'text-red-600' : ''}`}>
          {value === 'active' ? 'Hẹn giờ' : 'Dừng hẹn giờ'}
        </span>
      )
    },
    {
      key: 'scheduleDate',
      label: 'Hẹn đến ngày',
      render: (value) => (value ? format(new Date(value), 'dd/MM/yyyy') : '')
    },
    {
      key: 'content',
      label: 'Nội dung hẹn giờ'
    },
    {
      key: 'createdAt',
      label: 'Ngày tạo',
      render: (value) => (value ? format(new Date(value), 'dd/MM/yyyy') : '')
    }
  ];

  // Format date helper
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: vi });
    } catch (error) {
      return '-';
    }
  };
  
  // Format currency helper
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(amount);
  };
  
  
  
  // Mock payment periods for demonstration
  const paymentPeriods = Array.from({ length: 5 }).map((_, index) => ({
    id: index + 1,
    startDate: new Date(2025, 4, 15 + index).toISOString(),
    endDate: new Date(2025, 4, 15 + index).toISOString(),
    days: 1,
    interestAmount: 50000,
    otherAmount: 0,
    totalAmount: 50000,
    amountPaid: 50000
  }));
  
  return (
    <div className="p-4">
      {/* Bảng lịch đóng tiền */}
      <div className="overflow-auto" style={{ maxHeight: '400px' }}>
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-2 py-2 text-left text-sm font-medium text-gray-500 border">STT</th>
              <th className="px-2 py-2 text-left text-sm font-medium text-gray-500 border">Ngày</th>
              <th className="px-2 py-2 text-center text-sm font-medium text-gray-500 border">Số ngày</th>
              <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền gốc</th>
              <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền khác</th>
              <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tổng tiền</th>
              <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền khách trả</th>
              <th className="px-2 py-2 text-center text-sm font-medium text-gray-500 border w-10"></th>
            </tr>
          </thead>
          <tbody>
            {paymentPeriods.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-4 text-center text-gray-500">
                  Chưa có lịch hẹn nào
                </td>
              </tr>
            ) : (
              // Hiển thị dữ liệu lịch hẹn
              paymentPeriods.map((period, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-2 py-2 text-center border">{period.id}</td>
                  <td className="px-2 py-2 text-center border">
                    {formatDate(period.startDate)}
                  </td>
                  <td className="px-2 py-2 text-center border">{period.days}</td>
                  <td className="px-2 py-2 text-right border">{formatCurrency(period.interestAmount)}</td>
                  <td className="px-2 py-2 text-right border">{formatCurrency(period.otherAmount)}</td>
                  <td className="px-2 py-2 text-right border">{formatCurrency(period.totalAmount)}</td>
                  <td className="px-2 py-2 text-right border">
                    <span className="text-blue-500 cursor-pointer">
                      {formatCurrency(period.amountPaid).replace('₫', '')}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center border">
                    <Checkbox />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
