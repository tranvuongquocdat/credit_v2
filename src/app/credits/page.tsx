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
import { useCreditsSummary } from '@/hooks/useCreditsSummary';
import { useCreditCalculations } from '@/hooks/useCreditCalculation';
import { useAutoUpdateCashFund } from '@/hooks/useCashFundUpdater';
import { CreditStatus, CreditWithCustomer } from '@/models/credit';

import { usePermissions } from '@/hooks/usePermissions';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { getLatestPaymentPaidDate } from '@/lib/Credits/get_latest_payment_paid_date';
import { supabase } from '@/lib/supabase';
import { getInterestDisplayString } from '@/lib/interest-calculator';
import { formatCurrencyExcel } from '@/lib/utils';
import { useStore } from '@/contexts/StoreContext';

// Import shared status utility
import { getCreditStatusInfo } from '@/lib/credit-status-utils';

// Type for totals
interface CreditTotals {
  total_loan_amount: number;
  total_paid_interest: number;
  total_old_debt: number;
  total_interest_today: number;
}

export default function CreditsPage() {
  const router = useRouter();
  const { currentStore } = useStore();
  
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
    filters,
    handleSearch,
    handleReset,
    handlePageChange,
    handlePageSizeChange,
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
  
  // Lấy dữ liệu tài chính tổng hợp (summary only)
  const { summary: financialSummary, refresh: refreshSummary, loading: summaryLoading } = useCreditsSummary();
  
  // Lấy chi tiết tài chính & summary qua hook chung
  const { details: creditDetails, loading: creditCalcLoading, refresh: refreshCreditDetails } = useCreditCalculations();
  
  // Status codes are now available directly in credits data from credits_by_store view
  // Use auto update cash fund hook
  const { triggerUpdate } = useAutoUpdateCashFund({
    onUpdate: (newCashFund) => {
      console.log('Cash fund updated to:', newCashFund);
      refreshSummary(); // Refresh summary data after cash fund update
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
  
  // Exporting state
  const [isExporting, setIsExporting] = useState(false);
  
  // Totals state & fetch
  const [totals, setTotals] = useState<CreditTotals | null>(null);

  const fetchTotals = async (f = filters) => {
    if (!currentStore?.id) return;
    try {
      // Use lowercase status codes directly - RPC now handles credits_by_store view
      let rpcFilters = f;
      
      const { data, error } = await (supabase as any).rpc('credit_get_totals', {
        p_store_id: currentStore.id,
        p_filters : rpcFilters ?? null,
      });
      if (!error) {
        setTotals((data as any)?.[0] ?? null);
      }
    } catch (err) {
      console.error('fetchTotals error', err);
    }
  };
  
  useEffect(() => {
    fetchTotals(filters);
  }, [JSON.stringify(filters), currentStore?.id]);
  
  // All filtering is now handled server-side via enhanced credits_by_store view
  const displayCredits = credits;
  const effectiveTotalItems = totalItems;
  const totalPages = Math.ceil(effectiveTotalItems / itemsPerPage);
  
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
  const handleExportExcel = async () => {
    if (isExporting) return;

    if (!credits || credits.length === 0) {
      alert('Không có dữ liệu để xuất Excel');
      return;
    }

    setIsExporting(true);

    try {
      const rows = await Promise.all(
        credits.map(async (c, index) => {
          // Lấy ngày thanh toán lãi phí mới nhất
          let latestPaidDateStr = '';
          try {
            const latestPaid = await getLatestPaymentPaidDate(c.id);
            if (latestPaid) latestPaidDateStr = format(new Date(latestPaid), 'dd/MM/yyyy');
          } catch (err) {
            console.error('getLatestPaymentPaidDate error', err);
          }

          // Lấy ngày đóng hợp đồng gần nhất
          let latestCloseStr = '';
          try {
            const { data: closeRows, error: closeErr } = await supabase
              .from('credit_history')
              .select('effective_date')
              .eq('credit_id', c.id)
              .eq('transaction_type', 'contract_close')
              .order('effective_date', { ascending: false })
              .limit(1);
            if (!closeErr && closeRows && closeRows.length > 0 && closeRows[0].effective_date) {
              latestCloseStr = format(new Date(closeRows[0].effective_date), 'dd/MM/yyyy');
            }
          } catch (err) {
            console.error('get latest close error', err);
          }

          // Ngày vay & kết thúc
          const startDateStr = c.loan_date ? format(new Date(c.loan_date), 'dd/MM/yyyy') : '';
          let endDateStr = '';
          try {
            if (c.loan_date && c.loan_period) {
              const startDate = new Date(c.loan_date);
              const endDate = new Date(startDate);
              endDate.setDate(startDate.getDate() + (c.loan_period ?? 0) - 1);
              endDateStr = format(endDate, 'dd/MM/yyyy');
            }
          } catch {}

          // Lãi phí đã đóng và ngày phải đóng tiếp
          const detail = creditDetails[c.id];
          const paidInterest = detail?.paidInterest ?? 0;
          const nextPaymentDateStr = detail?.isCompleted ? 'Hoàn thành' : detail?.nextPayment ? format(new Date(detail.nextPayment), 'dd/MM/yyyy') : '';

          return {
            'STT': index + 1,
            'Mã hợp đồng': c.contract_code || '',
            'Tên khách hàng': c.customer?.name || '',
            'SĐT': c.customer?.phone || '',
            'CMND': c.customer?.id_number || '',
            'Địa chỉ': (c as any).address || '',
            'Tiền vay': formatCurrencyExcel(c.loan_amount),
            'Lãi phí': getInterestDisplayString(c),
            'Ngày vay': startDateStr,
            'Ngày kết thúc': endDateStr,
            'Ghi chú': c.notes || '',
            'Đã đóng đến ngày': latestPaidDateStr,
            'Lãi phí đã đóng': formatCurrencyExcel(paidInterest),
            'Ngày phải đóng': nextPaymentDateStr,
            'Ngày đóng hợp đồng': latestCloseStr,
          } as Record<string, any>;
        })
      );

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      ws['!cols'] = [
        { width: 6 },
        { width: 15 },
        { width: 15 },
        { width: 15 },
        { width: 12 },
        { width: 12 },
        { width: 25 },
        { width: 14 },
        { width: 15 },
        { width: 18 },
        { width: 18 },
        { width: 30 },
        { width: 18 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Danh sách tín chấp');

      // Style header
      const headerKeys = Object.keys(rows[0] || {});
      headerKeys.forEach((_, idx) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: idx });
        const cell = ws[cellRef];
        if (cell) {
          cell.s = {
            fill: { fgColor: { rgb: '4472C4' } },
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
          } as any;
        }
      });

      const fileName = `DanhSachTinChap_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Export Excel error', err);
      alert('Có lỗi khi xuất Excel');
    } finally {
      setIsExporting(false);
    }
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
      refreshSummary();
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
      refreshSummary();
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
    if (hasDataChanged) {
      handleRefresh();
      fetchTotals(filters);
      triggerUpdate();
    }
  };

  // Handle refresh after contract operations
  const handleRefresh = () => {
    refetch(); // Refresh credits list
    refreshSummary(); // Refresh financial summary
    refreshCreditDetails(); // Refresh nextPayment / paidInterest cho cột "Ngày phải đóng lãi phí"
    window.dispatchEvent(new Event('warnings-refresh')); // Badge cảnh báo trên TopNavbar cập nhật ngay
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
            onRefresh={refreshSummary}
            externalLoading={summaryLoading}
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
          exporting={isExporting}
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
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totals={totals ?? undefined}
          onView={handleViewCreditDetail}
          onEdit={handleEditCredit}
          onDelete={handleOpenDeleteDialog}
          onUpdateStatus={handleOpenStatusDialog}
          onShowPaymentHistory={handleOpenPaymentHistory}
          onRefresh={() => {
            handleRefresh();
            fetchTotals(filters);
          }}
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
            handleRefresh(); // Refresh full: list + summary + creditDetails (nextPayment) + warnings badge
            fetchTotals(filters);
            triggerUpdate();
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
              handleRefresh();
              fetchTotals(filters);
              triggerUpdate();
            }}
          />
        )}
      </div>
    </Layout>
  );
}
