'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useRouter } from 'next/navigation';

// Import custom components
import dynamicImport from 'next/dynamic';
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
import { supabase } from '@/lib/supabase';
import { calculateRemainingToPay } from '@/lib/installmentCalculations';
import { getInstallmentStatusInfo, getInstallmentStatusCode, INSTALLMENT_STATUS_MAP } from '@/lib/installment-status-utils';

// Use the shared status map for backward compatibility
const statusMap = INSTALLMENT_STATUS_MAP;

// Skeleton displayed while loading FinancialSummary lazily
function SkeletonFinancialSummary() {
  return (
    <div className="mb-4 flex py-1 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex-1 text-center px-2">
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-6 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>
  );
}

// 'as any' to bypass prop-type incompatibility during dynamic import
// You can replace by proper generic typing later if desired.
const FinancialSummary = dynamicImport(
  () => import('@/components/common/FinancialSummary').then((mod) => ({ default: mod.FinancialSummary })),
  { ssr: false, loading: () => <SkeletonFinancialSummary /> }
) as typeof import('@/components/common/FinancialSummary').FinancialSummary;


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
  
    // NEW: state for enriched data & calc loading
    const [processedInstallments, setProcessedInstallments] = useState<InstallmentWithCustomer[]>([]);
    const [calcLoading, setCalcLoading] = useState(false);
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
    // ------------------------------------------------------------
  // Calculate paid amount + remaining + status once installments list changes
  // ------------------------------------------------------------
  useEffect(() => {
    const compute = async () => {
      if (installments.length === 0) {
        setProcessedInstallments([]);
        return;
      }
      setCalcLoading(true);
      try {
        const ids = installments.map((i) => i.id);
        // RPC: tổng tiền đã đóng
        const { data: paidRows, error: paidError } = await supabase.rpc('installment_get_paid_amount', {
          p_installment_ids: ids,
        });
        if (paidError) {
          console.error('installment_get_paid_amount error:', paidError);
        }
        const paidMap = new Map<string, number>(
          (paidRows ?? []).map((r: any) => [r.installment_id, Number(r.total_paid ?? r.paid_amount ?? 0)])
        );

        // No need for complex status calculation - use status_code directly from view

        const enriched = installments.map((it) => {
          const totalPaid = paidMap.get(it.id) ?? 0;
          const remaining = calculateRemainingToPay(it, totalPaid);

          // Tính nhãn ngày phải đóng tiếp theo
          let nextPaymentDateLabel: string;
          if (!it.payment_due_date) {
            nextPaymentDateLabel = 'Hoàn thành';
          } else {
            const due = new Date(it.payment_due_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
            if (diff === 0) nextPaymentDateLabel = 'Hôm nay';
            else if (diff === 1) nextPaymentDateLabel = 'Ngày mai';
            else {
              const day = due.getDate().toString().padStart(2, '0');
              const month = (due.getMonth() + 1).toString().padStart(2, '0');
              nextPaymentDateLabel = `${day}/${month}`;
            }
          }

          // Get status info using simplified utility
          const statusCode = getInstallmentStatusCode(it);
          const statusInfo = getInstallmentStatusInfo(statusCode);

          return {
            ...it,
            totalPaid,
            remainingToPay: remaining,
            nextPaymentDate: nextPaymentDateLabel,
            statusInfo,
          } as InstallmentWithCustomer;
        });

        setProcessedInstallments(enriched);
      } catch (err) {
        console.error('Error computing installment aggregates:', err);
      } finally {
        setCalcLoading(false);
      }
    };

    compute();
  }, [installments]);
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
            enableCashFundUpdate={true}
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
          onSearch={handleSearchFilters}
          onReset={handleReset}
          onCreateNew={handleCreateInstallment}
          onExportExcel={handleExportExcel}
          initialFilters={initialFilters}
        />

        {/* Bảng dữ liệu hợp đồng */}
        <InstallmentsTable
          installments={processedInstallments}
          isLoading={loading || calcLoading}
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