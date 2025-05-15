import React from 'react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { FormRow } from '@/components/ui/FormRow';
import { Icon } from '@/components/ui/Icon';
import { CreditWithCustomer } from '@/models/credit';

interface BadCreditTabProps {
  credit: CreditWithCustomer;
}

export function BadCreditTab({ credit }: BadCreditTabProps) {
  // Table columns configuration
  const columns: Column[] = [
    {
      key: 'id',
      label: '#',
      className: 'px-3 py-3 text-left text-sm font-medium text-gray-700 text-center'
    },
    {
      key: 'customerName',
      label: 'Tên khách hàng'
    },
    {
      key: 'phone',
      label: 'Số điện thoại'
    },
    {
      key: 'idNumber',
      label: 'CMND'
    },
    {
      key: 'content',
      label: 'Nội dung'
    },
    {
      key: 'reporter',
      label: 'Người báo xấu'
    },
    {
      key: 'reportDate',
      label: 'Thời gian báo'
    },
    {
      key: 'verified',
      label: 'Xác thực'
    },
    {
      key: 'source',
      label: 'Nguồn'
    }
  ];

  return (
    <div className="p-4">
      {/* Báo xấu khách hàng section */}
      <div className="mb-6">
        <SectionHeader
          icon={<Icon name="warning" />}
          title="Báo xấu khách hàng"
          color="red"
        />
        
        <div className="border rounded-md p-4">
          <FormRow label="Tên khách hàng" required>
            <input
              type="text"
              className="border rounded px-2 py-1 w-full"
              defaultValue={credit?.customer?.name || ''}
              readOnly
            />
          </FormRow>
          
          <FormRow label="CMND" required>
            <input
              type="text"
              className="border rounded px-2 py-1 w-full"
              defaultValue={credit?.customer?.id_number || ''}
            />
          </FormRow>
          
          <FormRow label="Số điện thoại">
            <input
              type="text"
              className="border rounded px-2 py-1 w-full"
              defaultValue={credit?.customer?.phone || ''}
            />
          </FormRow>
          
          <FormRow label="Địa chỉ" alignItems="start">
            <textarea
              className="border rounded px-2 py-1 w-full h-16 resize-none"
              defaultValue={(credit?.customer as any)?.address || ''}
            ></textarea>
          </FormRow>
          
          <FormRow label="Nội dung" required alignItems="start">
            <textarea
              className="border rounded px-2 py-1 w-full h-20 resize-none"
              placeholder="Nhập nội dung báo xấu..."
            ></textarea>
          </FormRow>
          
          <div className="flex justify-end gap-2 mt-6">
            <Button className="bg-gray-200 hover:bg-gray-300 text-gray-800">
              Thoát
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white">
              Báo xấu
            </Button>
          </div>
        </div>
      </div>
      
      {/* Lịch sử báo xấu section */}
      <div>
        <SectionHeader
          icon={<Icon name="history" />}
          title="Lịch sử báo xấu"
          color="amber"
        />
        
        <DataTable
          columns={columns}
          data={[]}
          emptyMessage="Khách hàng này không bị báo xấu"
        />
      </div>
    </div>
  );
}
