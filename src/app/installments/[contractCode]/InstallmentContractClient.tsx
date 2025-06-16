'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useRouter } from 'next/navigation';

// Import custom components
import { FinancialSummary } from '@/components/common/FinancialSummary';
import { SearchFilters } from '@/components/Installments/SearchFilters';
import { InstallmentsTable } from '@/components/Installments/InstallmentsTable';
import { InstallmentsPagination } from '@/components/Installments/InstallmentsPagination';
import { InstallmentPaymentHistoryModal } from '@/components/Installments/InstallmentPaymentHistoryModal';
import { InstallmentCreateModal } from '@/components/Installments/InstallmentCreateModal';
import { InstallmentEditModal } from '@/components/Installments/InstallmentEditModal';

// Import custom hooks
import { useInstallments } from '@/hooks/useInstallments';
import { useInstallmentsSummary } from '@/hooks/useInstallmentsSummary';

// Import types and API functions
import { InstallmentStatus, InstallmentWithCustomer, InstallmentFilters } from '@/models/installment';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
// Map trạng thái thành nhãn và màu sắc
const statusMap: Record<string, { label: string, color: string }> = {
  [InstallmentStatus.ON_TIME]: { label: 'Đang vay', color: 'bg-green-100 text-green-800 border-green-200' },
  [InstallmentStatus.OVERDUE]: { label: 'Quá hạn', color: 'bg-red-100 text-red-800 border-red-200' },
  [InstallmentStatus.LATE_INTEREST]: { label: 'Chậm trả', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  [InstallmentStatus.BAD_DEBT]: { label: 'Nợ xấu', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  [InstallmentStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  [InstallmentStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  [InstallmentStatus.DUE_TOMORROW]: { label: 'Ngày mai đóng', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  [InstallmentStatus.FINISHED]: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

interface InstallmentContractClientProps {
  contractCode: string;
}

export function InstallmentContractClient({ contractCode }: InstallmentContractClientProps) {
  const router = useRouter();
  
  // Memoize initialFilters to prevent re-creation on every render
  const initialFilters = useMemo((): Partial<InstallmentFilters> => ({
    contract_code: contractCode || '',
    customer_name: '',
    status: undefined // Use undefined instead of empty string to show all statuses
  }), [contractCode]);
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Kiểm tra quyền xem danh sách hợp đồng tín chấp
  const canViewInstallmentsList = hasPermission('xem_danh_sach_hop_dong_tra_gop');
  // Use our custom hook for installments data and operations
  const { 
    installments, 
    loading, 
    error, 
    totalItems, 
    currentPage, 
    itemsPerPage,
    handleSearch,
    handleReset,
    handlePageChange,
    handleDelete,
    handleUpdateStatus,
    refetch
  } = useInstallments();
  
  // Set initial filters when component mounts or contractCode changes
  useEffect(() => {
    if (contractCode) {
      handleSearch(initialFilters);
    }
  }, [contractCode, initialFilters]);
  
  // Sử dụng custom hook để lấy dữ liệu tài chính
  const { data: financialSummary, refresh: refreshFinancial } = useInstallmentsSummary();
  
  // State for dialogs
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentWithCustomer | null>(null);
  
  // State cho modal tạo hợp đồng mới
  const [isInstallmentCreateModalOpen, setIsInstallmentCreateModalOpen] = useState(false);
  
  // State cho modal chỉnh sửa hợp đồng
  const [isInstallmentEditModalOpen, setIsInstallmentEditModalOpen] = useState(false);
  const [editInstallmentId, setEditInstallmentId] = useState<string>('');
  
  // State cho modal thanh toán (InstallmentPaymentHistoryModal)
  const [isPaymentActionsModalOpen, setIsPaymentActionsModalOpen] = useState(false);
  const [selectedInstallmentForPayment, setSelectedInstallmentForPayment] = useState<InstallmentWithCustomer | null>(null);
  
  // Calculate total pages
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  // Memoize search handler to prevent re-creation on every render
  const handleSearchFilters = useCallback((filters: any) => {
    handleSearch(filters);
  }, [handleSearch]);
  
  // Handle create new installment
  const handleCreateInstallment = () => {
    setIsInstallmentCreateModalOpen(true);
  };
  
  // Handle export to Excel
  const handleExportExcel = () => {
    alert('Export to Excel functionality would be implemented here');
  };
  
  // Handle edit installment
  const handleEditInstallment = (installmentId: string) => {
    setEditInstallmentId(installmentId);
    setIsInstallmentEditModalOpen(true);
  };
  
  // Handle opening delete dialog
  const handleOpenDeleteDialog = (installment: InstallmentWithCustomer) => {
    setSelectedInstallment(installment);
    setIsDeleteDialogOpen(true);
  };
  
  // Handle closing delete dialog
  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setSelectedInstallment(null);
  };
  
  // Handle deleting installment
  const handleDeleteInstallment = async (installmentId: string) => {
    try {
      const installment = installments.find(i => i.id === installmentId);
      if (!installment) return;
      
      const result = await handleDelete(installment);
      
      if (result && result.error) {
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
      
      refreshFinancial();
    } catch (error) {
      console.error('Error in handleDeleteInstallment:', error);
      toast({
        title: 'Lỗi',
        description: 'Có lỗi xảy ra khi xóa hợp đồng',
        variant: 'destructive',
      });
    } finally {
      handleCloseDeleteDialog();
    }
  };
  
  // Handle showing payment actions modal
  const handleShowPaymentActions = (installment: InstallmentWithCustomer) => {
    setSelectedInstallmentForPayment(installment);
    setIsPaymentActionsModalOpen(true);
  };

  // Handle closing payment history modal
  const handleClosePaymentHistory = (hasDataChanged?: boolean) => {
    setIsPaymentActionsModalOpen(false);
    setSelectedInstallmentForPayment(null);
    // Only refresh data if there were actual changes
    if (hasDataChanged) {
      refetch();
      refreshFinancial();
    }
  };
  
  // Handle refresh after contract operations
  const handleRefresh = () => {
    refetch();
    refreshFinancial();
  };
  
  return (
    <Layout>
      <div className="max-w-full">
        {/* Title và nút trở về */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Hợp đồng trả góp: {contractCode}</h1>
          </div>
          <button 
            onClick={() => router.push('/installments')}
            className="text-sm text-blue-600 hover:underline"
          >
            Quay lại danh sách hợp đồng
          </button>
        </div>
        
        {/* Thông tin tài chính */}
        {permissionsLoading ? (
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Đang tải...</p>
          </div>
        ) : hasPermission('xem_thong_tin_tra_gop') ? (
        <FinancialSummary 
          fundStatus={financialSummary || undefined}
          onRefresh={refreshFinancial}
          autoFetch={false}
        />
        ) : null}

        {/* Bộ lọc và tìm kiếm */}
        {permissionsLoading ? (
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Đang tải...</p>
          </div>
        ) : canViewInstallmentsList ? (
        <>
        <SearchFilters
          statusMap={statusMap}
          onSearch={handleSearchFilters}
          onReset={handleReset}
          onCreateNew={handleCreateInstallment}
          onExportExcel={handleExportExcel}
          initialFilters={initialFilters}
        />

        {/* Bảng dữ liệu hợp đồng */}
        <InstallmentsTable
          installments={installments}
          isLoading={loading}
          statusMap={statusMap}
          onEdit={handleEditInstallment}
          onShowPaymentActions={handleShowPaymentActions}
          onDelete={handleOpenDeleteDialog}
          onUpdateStatus={(installment: InstallmentWithCustomer) => {
            // Handle status update - you may want to implement a status selection dialog
            console.log('Update status for installment:', installment.id);
          }}
        />
        
        {/* Phân trang */}
        <InstallmentsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
        />
        </>
        ) : (
          <div className="p-8 border rounded-md mb-4 bg-gray-50 text-center">
            <p className="text-gray-500">Bạn không có quyền xem danh sách hợp đồng trả góp.</p>
          </div>
        )}
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa hợp đồng</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc chắn muốn xóa hợp đồng {selectedInstallment?.contract_code}?
                Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => selectedInstallment && handleDeleteInstallment(selectedInstallment.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Xóa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Modal thanh toán (InstallmentPaymentHistoryModal) */}
        {selectedInstallmentForPayment && (
          <InstallmentPaymentHistoryModal
            isOpen={isPaymentActionsModalOpen}
            onClose={handleClosePaymentHistory}
            installment={selectedInstallmentForPayment}
          />
        )}

        {/* Modal tạo hợp đồng mới */}
        <InstallmentCreateModal
          isOpen={isInstallmentCreateModalOpen}
          onClose={() => setIsInstallmentCreateModalOpen(false)}
          onSuccess={() => {
            setIsInstallmentCreateModalOpen(false);
            refetch();
          }}
        />
        
        {/* Modal chỉnh sửa hợp đồng */}
        {editInstallmentId && (
          <InstallmentEditModal
            isOpen={isInstallmentEditModalOpen}
            onClose={() => setIsInstallmentEditModalOpen(false)}
            installmentId={editInstallmentId}
            onSuccess={() => {
              setIsInstallmentEditModalOpen(false);
              refetch();
            }}
          />
        )}
      </div>
    </Layout>
  );
} 