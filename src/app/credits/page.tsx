'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';

import { toast } from '@/components/ui/use-toast';

// Import custom components
import { FinancialSummary } from '@/components/common/FinancialSummary';
import { SearchFilters } from '@/components/Credits/SearchFilters';
import { CreditsTable } from '@/components/Credits/CreditsTable';
import { CreditsPagination } from '@/components/Credits/CreditsPagination';
import { PaymentHistoryModal } from '@/components/Credits/PaymentHistoryModal';
import { CreditCreateModal } from '@/components/Credits/CreditCreateModal';
import { CreditEditModal } from '@/components/Credits/CreditEditModal';

// Import custom hooks
import { useCredits } from '@/hooks/useCredits';

// Import types and API functions
import { CreditStatus, CreditWithCustomer } from '@/models/credit';
import { useCreditCalculations } from '@/hooks/useCreditCalculation';
import { useAutoUpdateCashFund } from '@/hooks/useCashFundUpdater';
import { useCreditStatuses } from '@/hooks/useCreditStatuses';

import { usePermissions } from '@/hooks/usePermissions';

// Map trạng thái thành nhãn và màu sắc
const statusMap: Record<string, { label: string, color: string }> = {
  [CreditStatus.ON_TIME]: { label: 'Đang vay', color: 'bg-green-100 text-green-800' },
  [CreditStatus.OVERDUE]: { label: 'Quá hạn', color: 'bg-red-100 text-red-800' },
  [CreditStatus.LATE_INTEREST]: { label: 'Chậm lãi', color: 'bg-yellow-100 text-yellow-800' },
  [CreditStatus.BAD_DEBT]: { label: 'Nợ xấu', color: 'bg-purple-100 text-purple-800' },
  [CreditStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-blue-100 text-blue-800' },
  [CreditStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800' },
  [CreditStatus.FINISHED]: { label: 'Hoàn thành', color: 'bg-green-100 text-green-800' },
};


export default function CreditsPage() {
  const router = useRouter();
  
  // Parse URL parameters for initial filters
  const initialFilters = useMemo(() => {
    const contract = '';
    const customer = '';
    const status = '';
    
    if (contract || customer || status) {
      return {
        contract_code: contract || '',
        customer_name: customer || '',
        status: status || '' // Empty status to show all when navigating from warnings
      };
    }
    
    return undefined;
  }, []);
  
  // Use our custom hook for credits data and operations
  const { 
    credits, 
    loading, 
    error, 
    totalItems, 
    currentPage, 
    itemsPerPage,
    handleSearch,
    handleReset,
    handlePageChange,
    handleDelete,
    handleUpdateStatus: updateCreditStatus,
    refetch
  } = useCredits(initialFilters);
  // Sử dụng hook kiểm tra quyền
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Kiểm tra quyền xem danh sách hợp đồng tín chấp
  const canViewCreditsList = hasPermission('xem_danh_sach_hop_dong_tin_chap');
  // Track if initial filters have been processed
  const [hasProcessedInitialFilters, setHasProcessedInitialFilters] = useState(false);
  
  // Lấy dữ liệu tài chính tổng hợp
  const { summary: financialSummary, details: creditDetails, refresh: refreshFinancial } = useCreditCalculations();
  
  // Lấy trạng thái cho các hợp đồng trong trang hiện tại
  const { statuses: creditStatuses } = useCreditStatuses(credits.map((c) => c.id));
  // Use auto update cash fund hook
  const { triggerUpdate } = useAutoUpdateCashFund({
    onUpdate: (newCashFund) => {
      console.log('Cash fund updated to:', newCashFund);
      refreshFinancial(); // Refresh financial data after cash fund update
    }
  });
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
  
  // Calculate total pages
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  // Process initial filters only once
  useEffect(() => {
    if (initialFilters && !hasProcessedInitialFilters) {
      setHasProcessedInitialFilters(true);
      // The useCredits hook will handle the initial filters
    }
  }, [initialFilters, hasProcessedInitialFilters]);
  
  // Handle search filters
  const handleSearchFilters = (filters: any) => {
    handleSearch(filters);
  };
  
  // Handle create new credit
  const handleCreateCredit = () => {
    // Mở modal tạo hợp đồng mới thay vì chuyển trang
    setIsCreditCreateModalOpen(true);
  };
  
  // Handle export to Excel
  const handleExportExcel = () => {
    // In a real app, this would generate and download an Excel file
    alert('Export to Excel functionality would be implemented here');
  };
  
  // Handle edit credit
  const handleEditCredit = (creditId: string) => {
    // Mở modal chỉnh sửa thay vì chuyển trang
    setEditCreditId(creditId);
    setIsCreditEditModalOpen(true);
  };
  
  // Handle view credit details
  const handleViewCreditDetail = (creditId: string) => {
    router.push(`/credits/${creditId}`);
  };
  
  // Handle opening status dialog
  const handleOpenStatusDialog = (credit: CreditWithCustomer) => {
    // Nếu hợp đồng đang ở trạng thái đóng (closed), xử lý mở lại hợp đồng
    if (credit.status === CreditStatus.CLOSED) {
      // Hiển thị dialog xác nhận
      if (confirm('Bạn có muốn mở lại hợp đồng này không? Trạng thái sẽ chuyển về "Đúng hẹn"')) {
        reopenContract(credit);
      }
    } else {
      // Trường hợp bình thường: mở dialog chọn trạng thái
      setSelectedCredit(credit);
    }
  };
  
  // Hàm mở lại hợp đồng
  const reopenContract = async (credit: CreditWithCustomer) => {
    try {
      // Ghi lại lịch sử mở lại hợp đồng với số tiền đóng hợp đồng gần nhất
      const { recordContractReopening } = await import('@/lib/Credits/credit-amount-history');
      const result = await recordContractReopening(
        credit.id,
        new Date().toISOString(),
        'Mở lại hợp đồng từ trạng thái đóng'
      );
      
      console.log('Reopened contract with amount:', result.lastClosureAmount);
      
      // Cập nhật trạng thái hợp đồng về đúng hẹn
      updateCreditStatus(credit.id, CreditStatus.ON_TIME);
      
      // Refresh dữ liệu tài chính
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
    // Only refresh data if there were actual changes
    if (hasDataChanged) {
      handleRefresh();
      // Trigger cash fund update when payment history changes
      triggerUpdate();
    }
  };
  
  // Handle refresh after contract operations
  const handleRefresh = () => {
    refetch(); // Refresh credits list
    refreshFinancial(); // Refresh financial data
  };
  
  return (
    <Layout>
      <div className="max-w-full">
        {/* Title và nút trở về */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý hợp đồng tín chấp</h1>
          </div>
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
            enableCashFundUpdate={true}
        />
        ) : null}
        
        {/* Bộ lọc và tìm kiếm */}
        {permissionsLoading ? (
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Đang tải...</p>
          </div>
        ) : canViewCreditsList ? (
        <>
        <SearchFilters
          onSearch={handleSearchFilters}
          onReset={handleReset}
          onCreateNew={handleCreateCredit}
          onExportExcel={handleExportExcel}
          initialFilters={initialFilters}
        />

        {/* Bảng dữ liệu hợp đồng */}
        <CreditsTable
          credits={credits}
          statusMap={statusMap}
          calculatedDetails={creditDetails}
          calculatedStatuses={creditStatuses}
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
          totalItems={totalItems}
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
            refetch(); // Refresh danh sách hợp đồng sau khi tạo mới
            triggerUpdate(); // Trigger cash fund update
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
              refetch(); // Refresh danh sách hợp đồng sau khi cập nhật
              triggerUpdate(); // Trigger cash fund update
            }}
          />
        )}
      </div>
    </Layout>
  );
}
