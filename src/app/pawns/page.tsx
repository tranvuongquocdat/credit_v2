'use client';

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
  const searchParams = useSearchParams();
  
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
  
  // Lấy dữ liệu tài chính tổng hợp
  const { summary: financialSummary, refresh: refreshFinancial } = usePawnCalculations();
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
  
  // Xử lý query parameter từ URL - pre-fill form thay vì auto-search
  useEffect(() => {
    const contractParam = searchParams.get('contract');
    if (contractParam) {
      console.log('Pre-filling pawns page with contract:', contractParam);
      
      // Set initial filters để pre-fill form
      setInitialFilters({
        contractCode: contractParam
        // Không set status ở đây, để SearchFilters component tự quyết định
      });
      
      // Scroll to top and highlight the search section
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Clear initial filters khi không có contract param
      setInitialFilters(undefined);
    }
  }, [searchParams]);
  
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
  const handleOpenPaymentHistory = (pawn: PawnWithCustomer) => {
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
        
        {/* Thông tin tài chính */}
        <FinancialSummary 
          fundStatus={financialSummary || undefined}
          onRefresh={refreshFinancial}
          autoFetch={false}
        />
        
        {/* Bộ lọc và tìm kiếm */}
        <SearchFilters
          statusMap={statusMap}
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
            }}
          />
        )}
      </div>
    </Layout>
  );
}
