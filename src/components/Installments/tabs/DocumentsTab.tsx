import React from 'react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';

interface DocumentsTabProps {
  installmentId: string;
}

export function DocumentsTab({ installmentId }: DocumentsTabProps) {
  return (
    <div className="p-4">
      <SectionHeader
        icon={<Icon name="document" />}
        title="Chứng từ"
        color="blue"
      />
      
      <div className="flex flex-wrap gap-4 mb-6">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
          <Icon name="upload" size={16} />
          Upload Ảnh
        </Button>
        
        <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
          <Icon name="document" size={16} />
          In Chứng Từ
        </Button>
      </div>
      
      {/* Document upload area */}
      <div className="mb-6">
        <div className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center">
          <Icon name="upload" size={40} className="mx-auto text-gray-400 mb-2" />
          <p className="text-gray-600 mb-2">Kéo thả hình ảnh vào đây hoặc</p>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
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
        </div>
      </div>
    </div>
  );
}
