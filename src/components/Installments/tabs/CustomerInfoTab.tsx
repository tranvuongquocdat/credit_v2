'use client';

import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';
import { InstallmentWithCustomer } from '@/models/installment';

interface CustomerInfoTabProps {
  installment: InstallmentWithCustomer;
}

export function CustomerInfoTab({ installment }: CustomerInfoTabProps) {
  const formattedStartDate = format(new Date(installment.start_date), 'dd/MM/yyyy', { locale: vi });
  const formattedDueDate = format(new Date(installment.due_date), 'dd/MM/yyyy', { locale: vi });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Thông tin khách hàng</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Tên khách hàng</p>
            <p className="text-sm font-medium">{installment.customer.name}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Địa chỉ</p>
            <p className="text-sm font-medium">{installment.customer.address}</p>
          </div>
          {installment.customer.notes && (
            <div className="space-y-2 col-span-2">
              <p className="text-sm text-gray-500">Ghi chú</p>
              <p className="text-sm font-medium">{installment.customer.notes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium mb-4">Thông tin hợp đồng</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Mã hợp đồng</p>
            <p className="text-sm font-medium">{installment.contract_code}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Số tiền vay</p>
            <p className="text-sm font-medium">{formatCurrency(installment.amount_given)}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Lãi suất</p>
            <p className="text-sm font-medium">{installment.interest_rate}%</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Thời hạn (ngày)</p>
            <p className="text-sm font-medium">{installment.duration}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Ngày bắt đầu</p>
            <p className="text-sm font-medium">{formattedStartDate}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Ngày đáo hạn</p>
            <p className="text-sm font-medium">{formattedDueDate}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Số tiền trả mỗi ngày</p>
            <p className="text-sm font-medium">{formatCurrency(installment.daily_amount)}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Trạng thái</p>
            <p className="text-sm font-medium">{installment.status}</p>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium mb-4">Thông tin thanh toán</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Số tiền đã thanh toán</p>
            <p className="text-sm font-medium">{formatCurrency(installment.amount_paid)}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Dư nợ hiện tại</p>
            <p className="text-sm font-medium text-red-600">{formatCurrency(installment.remaining_amount)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
