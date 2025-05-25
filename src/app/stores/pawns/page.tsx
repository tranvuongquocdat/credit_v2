'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { PawnCreateModal } from '@/components/Pawns/PawnCreateModal';
import { useRouter } from 'next/navigation';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export default function PawnsPage() {
  const router = useRouter();
  const { currentStore, loading: storeLoading } = useStore();
  
  // State for modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Handle open create modal
  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };
  
  // Handle close create modal
  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };
  
  // Handle pawn creation success
  const handleCreateSuccess = (pawnId: string) => {
    toast({
      title: 'Thành công',
      description: 'Hợp đồng cầm đồ đã được tạo thành công',
      variant: 'default',
    });
    // Refresh data or navigate to detail page
  };
  
  if (storeLoading) {
    return (
      <Layout>
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quản lý cầm đồ</h1>
            </div>
          </div>
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
          </div>
        </div>
      </Layout>
    );
  }
  
  if (!currentStore) {
    return (
      <Layout>
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quản lý cầm đồ</h1>
            </div>
          </div>
          <div className="text-center py-10">
            <p>Vui lòng chọn cửa hàng để tiếp tục.</p>
          </div>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="max-w-full">
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý cầm đồ</h1>
          </div>
          <Button onClick={handleOpenCreateModal} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-1" /> Hợp đồng mới
          </Button>
        </div>
        
        <div className="mt-4">
          {/* Phần này sẽ thay bằng bảng PawnsTable sau khi tạo */}
          <div className="text-center py-4">
            <p>Đang phát triển...</p>
          </div>
        </div>
      </div>
      
      {/* Modals */}
      <PawnCreateModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onSuccess={handleCreateSuccess}
      />
    </Layout>
  );
} 