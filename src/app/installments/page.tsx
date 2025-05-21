'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout/Layout';
import { Button } from '@/components/ui/button';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

// Import custom components
import { FinancialSummary } from '@/components/common/FinancialSummary';
import { SearchFilters } from '@/components/Installments/SearchFilters';
import { InstallmentsTable } from '@/components/Installments/InstallmentsTable';  
import { InstallmentsPagination } from '@/components/Installments/InstallmentsPagination'; 
import { InstallmentCreateModal } from '@/components/Installments/InstallmentCreateModal';
import { InstallmentEditModal } from '@/components/Installments/InstallmentEditModal';
import { InstallmentPaymentHistoryModal } from '@/components/Installments/InstallmentPaymentHistoryModal';

// Import custom hooks
import { useInstallments } from '@/hooks/useInstallments';

// Import types and API functions
import { InstallmentStatus, InstallmentWithCustomer } from '@/models/installment';

// Map trạng thái thành nhãn và màu sắc
const statusMap: Record<string, { label: string, color: string }> = {
  [InstallmentStatus.ON_TIME]: { label: 'Đúng hẹn', color: 'bg-green-100 text-green-800 border-green-200' },
  [InstallmentStatus.OVERDUE]: { label: 'Quá hạn', color: 'bg-red-100 text-red-800 border-red-200' },
  [InstallmentStatus.LATE_INTEREST]: { label: 'Chậm lãi', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  [InstallmentStatus.BAD_DEBT]: { label: 'Nợ xấu', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  [InstallmentStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  [InstallmentStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  [InstallmentStatus.DUE_TOMORROW]: { label: 'Ngày mai đóng', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  [InstallmentStatus.FINISHED]: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

export default function InstallmentsPage() {
  const router = useRouter();
  
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
  
  // State for dialogs
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentWithCustomer | null>(null);
  
  // State cho modal tạo hợp đồng mới
  const [isInstallmentCreateModalOpen, setIsInstallmentCreateModalOpen] = useState(false);
  
  // State cho modal chỉnh sửa hợp đồng
  const [isInstallmentEditModalOpen, setIsInstallmentEditModalOpen] = useState(false);
  const [editInstallmentId, setEditInstallmentId] = useState<string>('');
  
  // State cho modal thanh toán (đã bỏ modal chi tiết)
  
  // State cho modal thanh toán (InstallmentPaymentHistoryModal)
  const [isPaymentActionsModalOpen, setIsPaymentActionsModalOpen] = useState(false);
  const [selectedInstallmentForPayment, setSelectedInstallmentForPayment] = useState<InstallmentWithCustomer | null>(null);
  
  // Calculate total pages
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  // Handle search filters
  const handleSearchFilters = (filters: any) => {
    handleSearch(filters);
  };
  
  // Handle create new installment
  const handleCreateInstallment = () => {
    // Mở modal tạo hợp đồng mới thay vì chuyển trang
    setIsInstallmentCreateModalOpen(true);
  };
  
  // Handle export to Excel
  const handleExportExcel = () => {
    // In a real app, this would generate and download an Excel file
    alert('Export to Excel functionality would be implemented here');
  };
  
  // Handle edit installment
  const handleEditInstallment = (installmentId: string) => {
    // Mở modal chỉnh sửa thay vì chuyển trang
    setEditInstallmentId(installmentId);
    setIsInstallmentEditModalOpen(true);
  };
  
  // Handle opening status dialog
  const handleOpenStatusDialog = (installment: InstallmentWithCustomer) => {
    setSelectedInstallment(installment);
    setIsStatusDialogOpen(true);
  };
  
  // Handle closing status dialog
  const handleCloseStatusDialog = () => {
    setIsStatusDialogOpen(false);
    setSelectedInstallment(null);
  };
  
  // Handle updating installment status
  const handleUpdateStatusAction = async (status: InstallmentStatus) => {
    if (!selectedInstallment) return;
    
    const { success, error } = await handleUpdateStatus(selectedInstallment.id, status);
    
    if (success) {
      handleCloseStatusDialog();
    } else {
      console.error('Error updating status:', error);
    }
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
  
  // Handle delete action
  const handleDeleteAction = async () => {
    if (!selectedInstallment) return;
    
    const { success, error } = await handleDelete(selectedInstallment);
    
    if (success) {
      handleCloseDeleteDialog();
    } else {
      console.error('Error deleting installment:', error);
    }
  };
  
  // Handle installment creation success
  const handleCreateSuccess = () => {
    setIsInstallmentCreateModalOpen(false);
    refetch();
  };
  
  // Handle installment edit success
  const handleEditSuccess = () => {
    setIsInstallmentEditModalOpen(false);
    refetch();
  };
  
  // Handle showing payment actions modal
  const handleShowPaymentActions = (installment: InstallmentWithCustomer) => {
    setSelectedInstallmentForPayment(installment);
    setIsPaymentActionsModalOpen(true);
  };

  return (
    <Layout>
      <div className="max-w-full">
        {/* Title */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý hợp đồng trả góp</h1>
          </div>
        </div>
        
        {/* Financial Summary */}
        <FinancialSummary
          storeId="1"
          autoFetch={true}
        />
        
        {/* Search and filters */}
        <SearchFilters
          statusMap={statusMap}
          onSearch={handleSearchFilters}
          onReset={handleReset}
          onCreateNew={handleCreateInstallment}
          onExportExcel={handleExportExcel}
        />
        
        {/* Error message */}
        {error && (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        )}
        
        {/* Installments Table */}
        <div className="rounded-md border mt-4 mb-1 border-gray-200 shadow-sm overflow-hidden">
          <InstallmentsTable
            installments={installments}
            statusMap={statusMap}
            isLoading={loading}
            onEdit={handleEditInstallment}
            onUpdateStatus={handleOpenStatusDialog}
            onDelete={handleOpenDeleteDialog}
            onShowPaymentActions={handleShowPaymentActions}
          />
        </div>
        
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
        
        {/* Modal chi tiết hợp đồng đã bị loại bỏ */}
        
        {/* Modal thao tác thanh toán */}
        {selectedInstallmentForPayment && (
          <InstallmentPaymentHistoryModal
            isOpen={isPaymentActionsModalOpen}
            onClose={() => setIsPaymentActionsModalOpen(false)}
            installment={selectedInstallmentForPayment}
            onContractStatusChange={() => {
              refetch();
              setIsPaymentActionsModalOpen(false);
            }}
          />
        )}
        
        {/* Pagination */}
        <div className="mt-4">
          <InstallmentsPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
          />
        </div>
        
        {/* Status Update Dialog */}
        <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Cập nhật trạng thái</DialogTitle>
              <DialogDescription>
                Cập nhật trạng thái cho hợp đồng <strong>{selectedInstallment?.contract_code}</strong>
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-2 gap-3 py-4">
              {Object.entries(statusMap).map(([status, { label, color }]) => (
                <Button
                  key={status}
                  className={cn("justify-start", color)}
                  variant="outline"
                  onClick={() => handleUpdateStatusAction(status as InstallmentStatus)}
                >
                  {label}
                </Button>
              ))}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseStatusDialog}>
                Hủy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc chắn muốn xóa hợp đồng <strong>{selectedInstallment?.contract_code}</strong>?
                <br />
                Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAction}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Xác nhận xóa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
