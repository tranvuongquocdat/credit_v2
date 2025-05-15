import React, { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Icon } from '@/components/ui/Icon';

interface ScheduleTabProps {
  creditId: string;
}

export function ScheduleTab({ creditId }: ScheduleTabProps) {
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
      render: (value) => (value ? format(new Date(value), 'dd-MM-yyyy') : '')
    },
    {
      key: 'content',
      label: 'Nội dung hẹn giờ'
    },
    {
      key: 'createdAt',
      label: 'Ngày tạo',
      render: (value) => (value ? format(new Date(value), 'dd-MM-yyyy') : '')
    }
  ];

  return (
    <div className="p-4">
      <SectionHeader
        icon={<Icon name="clock" />}
        title="Hẹn giờ"
        color="blue"
      />
      
      <div className="border rounded-md p-4 mb-6">
        <div className="grid grid-cols-[120px_1fr] gap-4 items-center mb-4">
          <div className="text-right font-medium">Ngày hẹn</div>
          <div>
            <input
              type="date"
              className="border rounded px-2 py-1 w-full max-w-[300px]"
              defaultValue={format(new Date(), 'yyyy-MM-dd')}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-[120px_1fr] gap-4 items-start mb-4">
          <div className="text-right font-medium">Ghi chú</div>
          <div>
            <textarea
              className="border rounded px-2 py-1 w-full h-20 resize-none"
              placeholder="Nhập ghi chú..."
            ></textarea>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            Tạo hẹn giờ
          </Button>
          <Button className="bg-red-600 hover:bg-red-700 text-white">
            Dừng hẹn giờ
          </Button>
        </div>
      </div>
      
      <DataTable
        columns={columns}
        data={schedules}
        emptyMessage="Chưa có lịch hẹn nào"
      />
    </div>
  );
}
