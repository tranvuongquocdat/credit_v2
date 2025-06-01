import React from 'react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { CreditStatus } from '@/models/credit';

interface DocumentsTabProps {
  creditId: string;
  creditStatus?: string;
}

export function DocumentsTab({ creditId, creditStatus }: DocumentsTabProps) {
  // Check if credit is closed or deleted
  const isDisabled = creditStatus === CreditStatus.CLOSED || creditStatus === CreditStatus.DELETED;

  return (
    <div className="p-4">
      <SectionHeader
        icon={<Icon name="document" />}
        title="Chứng từ"
        color="blue"
      />
      
      <div className="flex flex-wrap gap-4 mb-6">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2" disabled={isDisabled}>
          <Icon name="upload" size={16} />
          Upload Ảnh
        </Button>
        
        <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2" disabled={isDisabled}>
          <Icon name="document" size={16} />
          In Chứng Từ
        </Button>
      </div>
      
      {/* Document upload area */}
      <div className="mb-6">
        <div className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center">
          <Icon name="upload" size={40} className="mx-auto text-gray-400 mb-2" />
          <p className="text-gray-600 mb-2">Kéo thả hình ảnh vào đây hoặc</p>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={isDisabled}>
            Chọn từ máy tính
          </Button>
          <p className="text-gray-500 text-sm mt-2">
            Hỗ trợ các định dạng: JPG, PNG, PDF (tối đa 5MB)
          </p>
        </div>
      </div>
      
      {/* Document gallery */}
      <div>
        <SectionHeader
          icon={<Icon name="image" />}
          title="Thư viện hình ảnh"
          color="amber"
        />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Empty state */}
          <EmptyState 
            message="Chưa có hình ảnh nào được tải lên" 
            className="col-span-full py-8"
          />
          
          {/* Example document items (commented out for now) */}
          {/*
          <div className="border rounded-md overflow-hidden group relative">
            <img src="/placeholder-image.jpg" alt="Document" className="w-full h-40 object-cover" />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
              <button className="p-1 bg-white rounded-full mx-1">
                <Icon name="search" size={16} />
              </button>
              <button className="p-1 bg-white rounded-full mx-1">
                <Icon name="download" size={16} />
              </button>
              <button className="p-1 bg-white rounded-full mx-1">
                <Icon name="trash" size={16} />
              </button>
            </div>
            <div className="p-2 text-sm truncate">document-name.jpg</div>
          </div>
          */}
        </div>
      </div>
    </div>
  );
}
