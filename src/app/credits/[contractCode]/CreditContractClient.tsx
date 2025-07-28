'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { useRouter } from 'next/navigation';

// Import custom components
import { FinancialSummary } from '@/components/common/FinancialSummary';
import { SearchFilters } from '@/components/Credits/SearchFilters';
import { CreditsTable } from '@/components/Credits/CreditsTable';
import { CreditsPagination } from '@/components/Credits/CreditsPagination';
import { PaymentHistoryModal } from '@/components/Credits/PaymentHistoryModal';
import { CreditCreateModal } from '@/components/Credits/CreditCreateModal';
import { CreditEditModal } from '@/components/Credits/CreditEditModal';
import { isSameDay, addDays } from 'date-fns';

// Import custom hooks
import { useCredits } from '@/hooks/useCredits';

// Import types and API functions
import { CreditStatus, CreditWithCustomer } from '@/models/credit';
import { useCreditCalculations } from '@/hooks/useCreditCalculation';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

// No longer need statusMap - using shared utility in CreditsTable

interface CreditContractClientProps {
  contractCode: string;
}

export function CreditContractClient({ contractCode }: CreditContractClientProps) {
  const router = useRouter();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Kiểm tra quyền xem danh sách hợp đồng tín chấp
  const canViewCreditsList = hasPermission('xem_danh_sach_hop_dong_tin_chap');
  // Initialize with filter by contract code
  const initialFilters = useMemo(() => ({
    contract_code: contractCode || '',
    customer_name: '', 
    status: 'all',
    start_date: '',
    end_date: '',
    page: 1,
    limit: 10,
    sort: 'created_at',
    order: 'desc'
  }), [contractCode]);
  
  // Use our custom hook for credits data and operations
  const { 
    credits, 
    totalItems, 
    currentPage, 
    itemsPerPage,
    filters,
    handleSearch,
    handleReset,
    handlePageChange,
    handlePageSizeChange,
    handleDelete,
    handleUpdateStatus: updateCreditStatus,
    refetch
  } = useCredits(initialFilters);
  
  useEffect(() => {
    if (contractCode) {
      handleSearch(initialFilters);
    }
  }, [contractCode, handleSearch, initialFilters]);
  
  // Lấy dữ liệu tài chính tổng hợp
  const { summary: financialSummary, details: creditDetails, refresh: refreshFinancial } = useCreditCalculations();
  // Status codes are now available directly in credits data from credits_by_store view
  // State for dialogs
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<CreditWithCustomer | null>(null);
  
  // State cho modal lịch sử thanh toán
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] = useState(false);
  const [paymentHistoryCredit, setPaymentHistoryCredit] = useState<CreditWithCustomer | null>(null);
  
  // State cho modal tạo hợp đồng mới
  const [isCreditCreateModalOpen, setIsCreditCreateModalOpen] = useState(false);
  
  // State cho modal chỉnh sửa hợp đồng
  const [isCreditEditModalOpen, setIsCreditEditModalOpen] = useState(false);
  const [editCreditId, setEditCreditId] = useState<string>('');
  
  // Client-side filter: Ngày mai đóng lãi
  const displayCredits = useMemo(() => {
    if (filters?.status !== 'due_tomorrow') return credits;
    const tomorrow = addDays(new Date().setHours(0,0,0,0) as any, 1);
    return credits.filter(c => {
      const next = creditDetails[c.id]?.nextPayment;
      if (!next) return false;
      return isSameDay(new Date(next), tomorrow);
    });
  }, [credits, filters?.status, creditDetails]);

  const effectiveTotalItems = filters?.status === 'due_tomorrow' ? displayCredits.length : totalItems;
  const totalPages = Math.ceil(effectiveTotalItems / itemsPerPage);
  
  // Handle search filters
  const handleSearchFilters = (filters: any) => {
    handleSearch(filters);
  };
  
  // Handle create new credit
  const handleCreateCredit = () => {
    setIsCreditCreateModalOpen(true);
  };
  
  // Handle export to Excel
  const handleExportExcel = () => {
    alert('Export to Excel functionality would be implemented here');
  };
  
  // Handle edit credit
  const handleEditCredit = (creditId: string) => {
    setEditCreditId(creditId);
    setIsCreditEditModalOpen(true);
  };
  
  // Handle view credit details
  const handleViewCreditDetail = (creditId: string) => {
    router.push(`/credits/${creditId}`);
  };
  
  // Handle opening status dialog
  const handleOpenStatusDialog = (credit: CreditWithCustomer) => {
    if (credit.status === CreditStatus.CLOSED) {
      if (confirm('Bạn có muốn mở lại hợp đồng này không? Trạng thái sẽ chuyển về "Đúng hẹn"')) {
        reopenContract(credit);
      }
    } else {
      setSelectedCredit(credit);
    }
  };
  
  // Hàm mở lại hợp đồng
  const reopenContract = async (credit: CreditWithCustomer) => {
    try {
      const { recordContractReopening } = await import('@/lib/Credits/credit-amount-history');
      const result = await recordContractReopening(
        credit.id,
        new Date().toISOString(),
        'Mở lại hợp đồng từ trạng thái đóng'
      );
      
      console.log('Reopened contract with amount:', result.lastClosureAmount);
      
      updateCreditStatus(credit.id, CreditStatus.ON_TIME);
      
      refreshFinancial();
    } catch (error) {
      console.error('Error reopening contract:', error);
      toast({
        title: 'Lỗi',
        description: 'Có lỗi xảy ra khi mở lại hợp đồng',
        variant: 'destructive',
      });
    }
  };
  
  // Handle opening delete dialog
  const handleOpenDeleteDialog = (credit: CreditWithCustomer) => {
    setSelectedCredit(credit);
    setIsDeleteDialogOpen(true);
  };
  
  // Handle closing delete dialog
  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setSelectedCredit(null);
  };
  
  // Handle deleting credit
  const handleDeleteCredit = async (creditId: string) => {
    try {
      const result = await handleDelete(creditId);
      
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
      console.error('Error in handleDeleteCredit:', error);
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
  const handleOpenPaymentHistory = (credit: CreditWithCustomer) => {
    setPaymentHistoryCredit(credit);
    setIsPaymentHistoryModalOpen(true);
  };
  
  // Handle closing payment history modal
  const handleClosePaymentHistory = (hasDataChanged?: boolean) => {
    setIsPaymentHistoryModalOpen(false);
    setPaymentHistoryCredit(null);
    if (hasDataChanged) {
      handleRefresh();
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
            <h1 className="text-lg font-bold">Hợp đồng: {contractCode}</h1>
          </div>
          <button 
            onClick={() => router.push('/credits')}
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
        ) : hasPermission('xem_thong_tin_tin_chap') ? (
        <FinancialSummary 
          fundStatus={financialSummary || undefined}
          onRefresh={refreshFinancial}
          autoFetch={false}
        />
        ) : null}

        {permissionsLoading ? (
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Đang tải...</p>
          </div>
        ) : canViewCreditsList ? (
        <>
        {/* Bộ lọc và tìm kiếm */}
        <SearchFilters
          onSearch={handleSearchFilters}
          onReset={handleReset}
          onCreateNew={handleCreateCredit}
          onExportExcel={handleExportExcel}
          initialFilters={initialFilters}
          itemsPerPage={itemsPerPage}
          onPageSizeChange={handlePageSizeChange}
        />

        {/* Bảng dữ liệu hợp đồng */}
        <CreditsTable
          credits={displayCredits}
          statusMap={undefined}
          calculatedDetails={creditDetails}
          calculatedStatuses={undefined}
          onView={handleViewCreditDetail}
          onEdit={handleEditCredit}
          onDelete={handleOpenDeleteDialog}
          onUpdateStatus={handleOpenStatusDialog}
          onShowPaymentHistory={handleOpenPaymentHistory}
          onRefresh={handleRefresh}
        />
        
        {/* Phân trang */}
        <CreditsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={effectiveTotalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
        />
        </>
        ) : (
          <div className="p-8 border rounded-md mb-4 bg-gray-50 text-center">
            <p className="text-gray-500">Bạn không có quyền xem danh sách hợp đồng tín chấp.</p>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa hợp đồng</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc chắn muốn xóa hợp đồng {selectedCredit?.contract_code}?
                Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => selectedCredit && handleDeleteCredit(selectedCredit.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Xóa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Modal lịch sử thanh toán */}
        {paymentHistoryCredit && (
          <PaymentHistoryModal
            isOpen={isPaymentHistoryModalOpen}
            onClose={handleClosePaymentHistory}
            credit={paymentHistoryCredit}
          />
        )}

        {/* Modal tạo hợp đồng mới */}
        <CreditCreateModal
          isOpen={isCreditCreateModalOpen}
          onClose={() => setIsCreditCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreditCreateModalOpen(false);
            refetch();
          }}
        />
        
        {/* Modal chỉnh sửa hợp đồng */}
        {editCreditId && (
          <CreditEditModal
            isOpen={isCreditEditModalOpen}
            onClose={() => setIsCreditEditModalOpen(false)}
            creditId={editCreditId}
            onSuccess={() => {
              setIsCreditEditModalOpen(false);
              refetch();
            }}
          />
        )}
      </div>
    </Layout>
  );
} 