'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { FinancialSummary } from '@/components/common/FinancialSummary';
import { SearchFilters } from '@/components/Credits/SearchFilters';
import { CreditsTable } from '@/components/Credits/CreditsTable';
import { CreditsPagination } from '@/components/Credits/CreditsPagination';
import { PaymentHistoryModal } from '@/components/Credits/PaymentHistoryModal';
import { CreditCreateModal } from '@/components/Credits/CreditCreateModal';
import { CreditEditModal } from '@/components/Credits/CreditEditModal';

// Import custom hooks
import { useCredits } from '@/hooks/useCredits';
import { useStore } from '@/contexts/StoreContext';

// Import types and API functions
import { CreditStatus, CreditWithCustomer } from '@/models/credit';
import { supabase } from '@/lib/supabase';
import { StoreFinancialData } from '@/lib/store';

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

// Custom hook để lấy thông tin tài chính tổng hợp
function useCreditsSummary() {
  const [financialData, setFinancialData] = useState<StoreFinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentStore } = useStore();
  
  const fetchFinancialData = async () => {
    try {
      setLoading(true);
      
      // 1. Lấy thông tin cơ bản từ store
      const storeId = currentStore?.id || '1';
      const { data: storeData } = await supabase
        .from('stores')
        .select('investment, cash_fund')
        .eq('id', storeId)
        .single();
      
      // Get credits for interest calculation
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      // 2. Lấy tổng tiền cho vay (tổng loan_amount của các hợp đồng đang vay)
      const { data: activeCreditsData, error: activeCreditsError } = await supabase
        .from('credits')
        .select('loan_amount')
        .in('status', [CreditStatus.ON_TIME, CreditStatus.OVERDUE, CreditStatus.LATE_INTEREST, CreditStatus.BAD_DEBT]);
      
      if (activeCreditsError) {
        console.error('Lỗi khi lấy dữ liệu hợp đồng đang hoạt động:', activeCreditsError);
      }
      
      // Tính tổng tiền cho vay
      const totalLoan = activeCreditsData?.reduce((sum, credit) => sum + (credit.loan_amount || 0), 0) || 0;
      
      // 3. Lấy tổng tiền nợ cũ
      const { data: oldDebtData, error: oldDebtError } = await supabase
        .from('credits')
        .select('debt_amount')
        .in('status', [CreditStatus.ON_TIME, CreditStatus.OVERDUE, CreditStatus.LATE_INTEREST, CreditStatus.BAD_DEBT]);
      
      if (oldDebtError) {
        console.error('Lỗi khi lấy dữ liệu nợ cũ:', oldDebtError);
      }
      
      // Tính tổng tiền nợ cũ sử dụng trường debt_amount
      const oldDebt = oldDebtData?.reduce((sum, credit) => sum + (credit.debt_amount || 0), 0) || 0;
      
      // 4. Lấy tổng lãi phí đã thu (tổng actual_amount của các kỳ thanh toán)
      const { data: collectedInterestData, error: collectedInterestError } = await supabase
        .from('credit_payment_periods')
        .select('actual_amount, credits!inner(status)')
        .neq('credits.status', CreditStatus.CLOSED)
        .neq('credits.status', CreditStatus.DELETED);
      
      if (collectedInterestError) {
        console.error('Lỗi khi lấy dữ liệu lãi phí đã thu:', collectedInterestError);
      }
      
      // Tính tổng lãi phí đã thu
      const collectedInterest = collectedInterestData?.reduce((sum, period) => sum + (period.actual_amount || 0), 0) || 0;
      
      // 5. Lấy dữ liệu credits đang hoạt động để tính lãi dự kiến trong tháng này
      const { data: activeCredits, error: expectedInterestError } = await supabase
        .from('credits')
        .select(`
          id, 
          loan_amount, 
          interest_type, 
          interest_value, 
          loan_period,
          interest_period,
          interest_ui_type,
          interest_notation,
          loan_date,
          status
        `)
        .in('status', [CreditStatus.ON_TIME, CreditStatus.OVERDUE, CreditStatus.LATE_INTEREST, CreditStatus.BAD_DEBT])
        .lte('loan_date', lastDayOfMonth.toISOString());
      
      if (expectedInterestError) {
        console.error('Lỗi khi lấy dữ liệu tín dụng đang hoạt động:', expectedInterestError);
      }
      
      // Tính tổng lãi phí dự kiến trong tháng này
      let monthlyInterestAmount = 0;
      
      if (activeCredits) {
        monthlyInterestAmount = activeCredits.reduce((total, credit) => {
          let interestPerMonth = 0;
          
          // Đã vay được bao nhiêu ngày
          const loanDate = new Date(credit.loan_date);
          const daysSinceLoan = Math.max(0, Math.floor((today.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24)));
          
          // Không tính nếu khoản vay bắt đầu sau tháng này
          if (loanDate > lastDayOfMonth) return total;
          
          // Kiểm tra credit còn trong thời hạn vay không
          const isWithinLoanPeriod = daysSinceLoan <= credit.loan_period;
          if (!isWithinLoanPeriod) return total;
          
          // Tính toán lãi dựa trên loại lãi và cách tính
          switch (credit.interest_ui_type) {
            case 'daily':
              // Số ngày trong tháng này mà khoản vay đang hoạt động
              const daysInMonth = Math.min(
                lastDayOfMonth.getDate(),
                credit.loan_period - (daysSinceLoan - today.getDate())
              );
              
              if (credit.interest_notation === 'k_per_million') {
                // k/triệu/ngày
                interestPerMonth = (credit.loan_amount / 1000000) * credit.interest_value * daysInMonth * 1000;
              } else if (credit.interest_notation === 'k_per_day') {
                // k/ngày
                interestPerMonth = credit.interest_value * daysInMonth * 1000;
              }
              break;
              
            case 'monthly_30':
            case 'monthly_custom':
              if (credit.interest_notation === 'percent_per_month') {
                // %/tháng
                const monthlyRate = credit.interest_value / 100;
                interestPerMonth = credit.loan_amount * monthlyRate;
              }
              break;
              
            case 'weekly_percent':
              if (credit.interest_notation === 'percent_per_week') {
                // %/tuần
                const weeklyRate = credit.interest_value / 100;
                // Số tuần trong tháng này (xấp xỉ 4.35 tuần/tháng)
                const weeksInMonth = 4.35;
                interestPerMonth = credit.loan_amount * weeklyRate * weeksInMonth;
              }
              break;
              
            case 'weekly_k':
              if (credit.interest_notation === 'k_per_week') {
                // k/tuần
                // Số tuần trong tháng này (xấp xỉ 4.35 tuần/tháng)
                const weeksInMonth = 4.35;
                interestPerMonth = credit.interest_value * weeksInMonth * 1000;
              }
              break;
          }
          
          return total + interestPerMonth;
        }, 0);
      }
      
      // Sử dụng monthlyInterestAmount làm profit
      const profit = Math.round(monthlyInterestAmount);
      
      // 6. Tổng hợp dữ liệu
      const financialSummary: StoreFinancialData = {
        totalFund: storeData?.investment || 0,
        availableFund: storeData?.cash_fund || 0,
        totalLoan: totalLoan,
        oldDebt: oldDebt,
        profit: profit,
        collectedInterest: collectedInterest
      };
      
      setFinancialData(financialSummary);
    } catch (error) {
      console.error('Lỗi khi lấy dữ liệu tài chính:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchFinancialData();
  }, [currentStore?.id]);
  
  return { data: financialData, loading, refresh: fetchFinancialData };
}

export default function CreditsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Lấy thông tin store từ context
  const { currentStore } = useStore();
  
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
  
  // Lấy dữ liệu tài chính tổng hợp
  const { data: financialSummary, refresh: refreshFinancial } = useCreditsSummary();
  
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
  
  // Calculate total pages
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  // Xử lý query parameter từ URL
  useEffect(() => {
    const contractParam = searchParams.get('contract');
    if (contractParam) {
      // Nếu có tham số contract, thực hiện tìm kiếm với mã hợp đồng
      handleSearch({
        contractCode: contractParam,
        customerName: '',
        startDate: '',
        endDate: '',
        status: 'on_time' // Sử dụng 'all' để hiển thị tất cả trạng thái
      });
    }
  }, [searchParams]);
  
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
          fundStatus={financialSummary || undefined}
          onRefresh={refreshFinancial}
          autoFetch={false}
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
            onClose={() => setIsCreditEditModalOpen(false)}
            creditId={editCreditId}
            onSuccess={(creditId) => {
              setIsCreditEditModalOpen(false);
              refetch(); // Refresh danh sách hợp đồng sau khi cập nhật
            }}
          />
        )}
      </div>
    </Layout>
  );
}
