'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';

import { toast } from '@/components/ui/use-toast';

// Import custom components
import { FinancialSummary } from '@/components/common/FinancialSummary';
import { SearchFilters } from '@/components/Pawns/SearchFilters';
import { PawnTable } from '@/components/Pawns/PawnTable';
import { PawnsPagination } from '@/components/Pawns/PawnsPagination';
import { PawnHistoryModal as PaymentHistoryModal } from '@/components/Pawns/PawnHistoryModal';
import { PawnCreateModal } from '@/components/Pawns/PawnCreateModal';
import { PawnEditModal } from '@/components/Pawns/PawnEditModal';

// Import custom hooks
import { usePawns } from '@/hooks/usePawns';

// Import types and API functions
import { PawnStatus, PawnWithCustomer } from '@/models/pawn';
import { usePawnCalculations } from '@/hooks/usePawnCalculation';
import { useAutoUpdateCashFund } from '@/hooks/useCashFundUpdater';
import { usePermissions } from '@/hooks/usePermissions';


// Map trạng thái thành nhãn và màu sắc
const statusMap: Record<string, { label: string, color: string }> = {
  [PawnStatus.ON_TIME]: { label: 'Đúng hẹn', color: 'bg-green-100 text-green-800' },
  [PawnStatus.OVERDUE]: { label: 'Quá hạn', color: 'bg-red-100 text-red-800' },
  [PawnStatus.LATE_INTEREST]: { label: 'Chậm lãi', color: 'bg-yellow-100 text-yellow-800' },
  [PawnStatus.BAD_DEBT]: { label: 'Nợ xấu', color: 'bg-purple-100 text-purple-800' },
  [PawnStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-blue-100 text-blue-800' },
  [PawnStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800' },
};



export default function PawnsPage() {
  
  // State để lưu initial filters từ URL
  const [initialFilters, setInitialFilters] = useState<Partial<any> | undefined>(undefined);
  
  // Use our custom hook for pawns data and operations
  const { 
    pawns, 
    loading, 
    totalItems, 
    currentPage, 
    itemsPerPage,
    handleSearch,
    handleReset,
    handlePageChange,
    handleDelete,
    refetch
  } = usePawns();
  
  // Sử dụng hook kiểm tra quyền
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  
  // Kiểm tra quyền xem danh sách hợp đồng cầm đồ
  const canViewPawnsList = hasPermission('xem_danh_sach_hop_dong_cam_do');
  
  // Lấy dữ liệu tài chính tổng hợp
  const { summary: financialSummary, refresh: refreshFinancial } = usePawnCalculations();
  
  // Use auto update cash fund hook
  const { triggerUpdate } = useAutoUpdateCashFund({
    onUpdate: (newCashFund) => {
      console.log('Cash fund updated to:', newCashFund);
      refreshFinancial(); // Refresh financial data after cash fund update
    }
  });
  // State for dialogs
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPawn, setSelectedPawn] = useState<PawnWithCustomer | null>(null);
  
  // State cho modal lịch sử thanh toán
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] = useState(false);
  const [paymentHistoryPawn, setPaymentHistoryPawn] = useState<PawnWithCustomer | null>(null);
  
  // State cho modal tạo hợp đồng mới
  const [isPawnCreateModalOpen, setIsPawnCreateModalOpen] = useState(false);
  
  // State cho modal chỉnh sửa hợp đồng
  const [isPawnEditModalOpen, setIsPawnEditModalOpen] = useState(false);
  const [editPawnId, setEditPawnId] = useState<string>('');
  
  // Calculate total pages
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  // Handle search filters
  const handleSearchFilters = (filters: any) => {
    handleSearch(filters);
  };
  
  // Handle create new pawn
  const handleCreatePawn = () => {
    // Mở modal tạo hợp đồng mới thay vì chuyển trang
    setIsPawnCreateModalOpen(true);
  };
  
  // Handle export to Excel
  const handleExportExcel = () => {
    // In a real app, this would generate and download an Excel file
    alert('Export to Excel functionality would be implemented here');
  };
  
  // Handle edit pawn
  const handleEditPawn = (pawnId: string) => {
    // Mở modal chỉnh sửa thay vì chuyển trang
    setEditPawnId(pawnId);
    setIsPawnEditModalOpen(true);
  };
  
  // Handle opening delete dialog
  const handleOpenDeleteDialog = (pawn: PawnWithCustomer) => {
    setSelectedPawn(pawn);
    setIsDeleteDialogOpen(true);
  };
  
  // Handle closing delete dialog
  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setSelectedPawn(null);
  };
  
  // Handle deleting pawn
  const handleDeletePawn = async (pawnId: string) => {
    try {
      const result = await handleDelete(pawnId);
      
      // Kiểm tra nếu có lỗi từ việc xóa
      if (result && result.error) {
        // Hiển thị thông báo lỗi
        toast({
          title: 'Lỗi',
          description: result.error ? String(result.error) : 'Không thể xóa hợp đồng',
          variant: 'destructive',
        });
        return;
      }
      
      toast({
        title: 'Thành công',
        description: 'Hợp đồng đã được xóa thành công',
        variant: 'default',
      });
      
      // Refresh dữ liệu tài chính sau khi xóa thành công
      refreshFinancial();
      // Trigger cash fund update
      triggerUpdate();
    } catch (error) {
      console.error('Error in handleDeletePawn:', error);
      toast({
        title: 'Lỗi',
        description: 'Có lỗi xảy ra khi xóa hợp đồng',
        variant: 'destructive',
      });
    } finally {
      handleCloseDeleteDialog();
    }
  };
  
  // Handle opening payment history modal
  const handleOpenPaymentHistory = async (pawn: PawnWithCustomer) => {
    setPaymentHistoryPawn(pawn);
    setIsPaymentHistoryModalOpen(true);
  };
  
  // Handle closing payment history modal
  const handleClosePaymentHistory = (hasDataChanged?: boolean) => {
    setIsPaymentHistoryModalOpen(false);
    setPaymentHistoryPawn(null);
    // Only refresh data if there were actual changes
    if (hasDataChanged) {
      handleRefresh();
      // Trigger cash fund update when payment history changes
      triggerUpdate();
    }
  };
  
  // Handle refresh after contract operations
  const handleRefresh = () => {
    refetch(); // Refresh pawns list
    refreshFinancial(); // Refresh financial data
  };
  
  return (
    <Layout>
      <div className="max-w-full">
        {/* Title và nút trở về */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý hợp đồng cầm đồ</h1>
          </div>
        </div>
        
        {/* Thông tin tài chính - Chỉ hiển thị nếu có quyền */}
        {permissionsLoading ? (
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Đang tải...</p>
          </div>
        ) : hasPermission('xem_thong_tin_cam_do') ? (
          <FinancialSummary 
            fundStatus={financialSummary || undefined}
            onRefresh={refreshFinancial}
            autoFetch={false}
            enableCashFundUpdate={true}
        />
        ) : null}
        
        {/* Kiểm tra quyền xem danh sách hợp đồng */}
        {permissionsLoading ? (
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Đang tải...</p>
          </div>
        ) : canViewPawnsList ? (
          <>
            {/* Bộ lọc và tìm kiếm */}
            <SearchFilters
              onSearch={handleSearchFilters}
              onReset={handleReset}
              onCreateNew={handleCreatePawn}
              onExportExcel={handleExportExcel}
              initialFilters={initialFilters}
            />

            {/* Bảng dữ liệu hợp đồng */}
            <PawnTable
              pawns={pawns}
              loading={loading}
              statusMap={statusMap}
              onEdit={handleEditPawn}
              onViewDetail={handleOpenPaymentHistory}
              onDelete={(pawnId: string) => {
                const pawn = pawns.find(p => p.id === pawnId);
                if (pawn) handleOpenDeleteDialog(pawn);
              }}
              onExtend={(pawnId: string) => {
                console.log('Extend pawn:', pawnId);
              }}
              onRedeem={(pawnId: string) => {
                console.log('Redeem pawn:', pawnId);
              }}
            />
            
            {/* Phân trang */}
            <PawnsPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
            />
          </>
        ) : (
          <div className="p-8 border rounded-md mb-4 bg-gray-50 text-center">
            <p className="text-gray-500">Bạn không có quyền xem danh sách hợp đồng cầm đồ.</p>
          </div>
        )}
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa hợp đồng</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc chắn muốn xóa hợp đồng {selectedPawn?.contract_code}?
                Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => selectedPawn && handleDeletePawn(selectedPawn.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Xóa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Modal lịch sử thanh toán */}
        {paymentHistoryPawn && (
          <PaymentHistoryModal
            isOpen={isPaymentHistoryModalOpen}
            onClose={handleClosePaymentHistory}
            pawn={paymentHistoryPawn}
          />
        )}

        {/* Modal tạo hợp đồng mới */}
        <PawnCreateModal
          isOpen={isPawnCreateModalOpen}
          onClose={() => setIsPawnCreateModalOpen(false)}
          onSuccess={() => {
            setIsPawnCreateModalOpen(false);
            refetch(); // Refresh danh sách hợp đồng sau khi tạo mới
            triggerUpdate(); // Trigger cash fund update
          }}
        />
        
        {/* Modal chỉnh sửa hợp đồng */}
        {editPawnId && (
          <PawnEditModal
            isOpen={isPawnEditModalOpen}
            onClose={() => setIsPawnEditModalOpen(false)}
            pawnId={editPawnId}
            onSuccess={() => {
              setIsPawnEditModalOpen(false);
              refetch(); // Refresh danh sách hợp đồng sau khi cập nhật
              triggerUpdate(); // Trigger cash fund update
            }}
          />
        )}
      </div>
    </Layout>
  );
}
