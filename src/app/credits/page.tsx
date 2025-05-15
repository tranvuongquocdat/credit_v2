'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';

// Import custom components
import { FinancialSummary } from '@/components/Credits/FinancialSummary';
import { SearchFilters } from '@/components/credits/SearchFilters';
import { CreditsTable } from '@/components/Credits/CreditsTable';
import { CreditsPagination } from '@/components/Credits/CreditsPagination';
import { PaymentHistoryModal } from '@/components/Credits/PaymentHistoryModal';
import { CreditCreateModal } from '@/components/Credits/CreditCreateModal';
import { CreditEditModal } from '@/components/Credits/CreditEditModal';

// Import custom hooks
import { useCredits } from '@/hooks/useCredits';

// Import types and API functions
import { CreditStatus, CreditWithCustomer } from '@/models/credit';

// Map trạng thái thành nhãn và màu sắc
const statusMap: Record<string, { label: string, color: string }> = {
  [CreditStatus.ON_TIME]: { label: 'Đúng hẹn', color: 'bg-green-100 text-green-800' },
  [CreditStatus.OVERDUE]: { label: 'Quá hạn', color: 'bg-red-100 text-red-800' },
  [CreditStatus.LATE_INTEREST]: { label: 'Chậm lãi', color: 'bg-yellow-100 text-yellow-800' },
  [CreditStatus.BAD_DEBT]: { label: 'Nợ xấu', color: 'bg-purple-100 text-purple-800' },
  [CreditStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-blue-100 text-blue-800' },
  [CreditStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800' },
};

// Interface cho quỹ tiền mặt
interface FundStatus {
  totalFund: number; // Tổng quỹ
  totalLoan: number; // Tổng cho vay
  profit: number;    // Lợi nhuận
  availableFund: number; // Quỹ khả dụng
  oldDebt: number; // Tiền nợ
  collectedInterest?: number; // Lãi phí đã thu
}

export default function CreditsPage() {
  const router = useRouter();
  
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
  } = useCredits();
  
  // State for dialogs
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
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
  
  // Quỹ tiền mặt state
  const [fundStatus, setFundStatus] = useState<FundStatus>({
    totalFund: 122350000,
    totalLoan: 100000000,
    profit: 22350000,
    availableFund: 22350000,
    oldDebt: 0,
    collectedInterest: 8940000
  });
  
  // Calculate total pages
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  // Handle fund refresh
  const handleRefreshFund = () => {
    // In a real app, this would fetch the latest fund data
    setFundStatus({
      ...fundStatus,
      totalFund: 122350000
    });
  };
  
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
    setSelectedCredit(credit);
    setIsStatusDialogOpen(true);
  };
  
  // Handle closing status dialog
  const handleCloseStatusDialog = () => {
    setIsStatusDialogOpen(false);
    setSelectedCredit(null);
  };
  
  // Handle updating credit status
  const handleUpdateStatus = (status: CreditStatus) => {
    if (!selectedCredit) return;
    
    updateCreditStatus(selectedCredit.id, status);
    handleCloseStatusDialog();
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
  const handleDeleteCredit = (creditId: string) => {
    handleDelete(creditId);
    handleCloseDeleteDialog();
  };
  
  // Handle opening payment history modal
  const handleOpenPaymentHistory = (credit: CreditWithCustomer) => {
    setPaymentHistoryCredit(credit);
    setIsPaymentHistoryModalOpen(true);
  };
  
  // Handle closing payment history modal
  const handleClosePaymentHistory = () => {
    setIsPaymentHistoryModalOpen(false);
    setPaymentHistoryCredit(null);
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
        <FinancialSummary 
          fundStatus={fundStatus} 
          onRefresh={handleRefreshFund} 
        />
        
        {/* Bộ lọc và tìm kiếm */}
        <SearchFilters
          statusMap={statusMap}
          onSearch={handleSearchFilters}
          onReset={handleReset}
          onCreateNew={handleCreateCredit}
          onExportExcel={handleExportExcel}
        />

        {/* Bảng dữ liệu hợp đồng */}
        <CreditsTable
          credits={credits}
          statusMap={statusMap}
          onView={handleViewCreditDetail}
          onEdit={handleEditCredit}
          onDelete={handleOpenDeleteDialog}
          onUpdateStatus={handleOpenStatusDialog}
          onShowPaymentHistory={handleOpenPaymentHistory}
        />
        
        {/* Phân trang */}
        <CreditsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
        />
        
        {/* Status Dialog */}
        <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cập nhật trạng thái hợp đồng</DialogTitle>
              <DialogDescription>
                Chọn trạng thái mới cho hợp đồng {selectedCredit?.contract_code}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 py-4">
              {Object.entries(statusMap).map(([status, { label, color }]) => (
                <Button 
                  key={status} 
                  className={cn("justify-start", color)}
                  onClick={() => handleUpdateStatus(status as CreditStatus)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        
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
          onSuccess={(creditId) => {
            setIsCreditCreateModalOpen(false);
            refetch(); // Refresh danh sách hợp đồng sau khi tạo mới
          }}
        />
        
        {/* Modal chỉnh sửa hợp đồng */}
        {editCreditId && (
          <CreditEditModal
            isOpen={isCreditEditModalOpen}
            onClose={() => {
              setIsCreditEditModalOpen(false);
              setEditCreditId('');
            }}
            creditId={editCreditId}
            onSuccess={(creditId) => {
              setIsCreditEditModalOpen(false);
              setEditCreditId('');
              refetch(); // Refresh danh sách hợp đồng sau khi cập nhật
            }}
          />
        )}
      </div>
    </Layout>
  );
}
