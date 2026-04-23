'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Layout } from '@/components/Layout/Layout';
import dynamicImport from 'next/dynamic';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { getLatestPaymentPaidDate } from '@/lib/Installments/get_latest_payment_paid_date';
import { calculateDailyAmount, calculateRatio } from '@/lib/installmentCalculations';

import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';

// Import custom components
import { SearchFilters } from '@/components/Installments/SearchFilters';
import { InstallmentsTable } from '@/components/Installments/InstallmentsTable';  
import { InstallmentsPagination } from '@/components/Installments/InstallmentsPagination'; 
import { InstallmentCreateModal } from '@/components/Installments/InstallmentCreateModal';
import { InstallmentEditModal } from '@/components/Installments/InstallmentEditModal';
import { InstallmentPaymentHistoryModal } from '@/components/Installments/InstallmentPaymentHistoryModal';

// Import custom hooks
import { useInstallments } from '@/hooks/useInstallments';
import { useInstallmentsSummary } from '@/hooks/useInstallmentsSummary';
import { useAutoUpdateCashFund } from '@/hooks/useCashFundUpdater';
import { useStore } from '@/contexts/StoreContext';

// Import types and API functions
import { InstallmentStatus, InstallmentWithCustomer } from '@/models/installment';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabase';
import { useInstallmentCalculation } from '@/hooks/useInstallmentCalculation';
import { INSTALLMENT_STATUS_MAP } from '@/lib/installment-status-utils';

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

// Helper to format currency with dot separators
const formatCurrencyExcel = (value: number | undefined | null): string => {
  try {
    return new Intl.NumberFormat('vi-VN').format(value ?? 0);
  } catch (e) {
    return String(value ?? 0);
  }
};

// Type for totals row returned by RPC
interface InstallmentTotals {
  total_amount_given: number;
  total_paid: number;
  total_debt: number;
  total_daily_amount: number;
  total_remaining: number;
}

export default function InstallmentsPage() {
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Kiểm tra quyền xem danh sách hợp đồng trả góp
  const canViewInstallmentsList = hasPermission('xem_danh_sach_hop_dong_tra_gop');
  // Get current store from context
  const { currentStore } = useStore();
  
  // State để lưu initial filters từ URL
  const [initialFilters, setInitialFilters] = useState<Partial<any> | undefined>(undefined);
  
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
    handlePageSizeChange,
    handleDelete,
    handleUpdateStatus,
    refetch,
    filters,
  } = useInstallments();
  
  // Sử dụng custom hook để lấy dữ liệu tài chính
  const { data: financialSummary, refresh: refreshFinancial } = useInstallmentsSummary();
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);

  // Trigger loading cục bộ cho FinancialSummary khi refetch dữ liệu
  const triggerFinancialRefresh = async () => {
    setSummaryRefreshing(true);
    try {
      await Promise.resolve(refreshFinancial());
    } finally {
      setSummaryRefreshing(false);
    }
  };
  
  // Use auto update cash fund hook
  const { triggerUpdate } = useAutoUpdateCashFund({
    onUpdate: (newCashFund) => {
      console.log('Cash fund updated to:', newCashFund);
      void newCashFund;
      void triggerFinancialRefresh(); // Refresh financial data after cash fund update
    }
  });
  
  // Refresh financial data when store changes
  useEffect(() => {
    void triggerFinancialRefresh();
  }, [currentStore?.id]);
  
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
  
  // Tính toán dữ liệu đã xử lý qua custom hook
  const { processedInstallments, loading: calcLoading } = useInstallmentCalculation(installments);

  // State cho quá trình xuất Excel
  const [isExporting, setIsExporting] = useState(false);

  // Use server-side filtering and pagination - no client-side filtering needed
  const displayInstallments = processedInstallments;
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
  const handleExportExcel = async () => {
    if (isExporting) return; // prevent multiple clicks or concurrent export

    if (!processedInstallments || processedInstallments.length === 0) {
      alert('Không có dữ liệu để xuất Excel');
      return;
    }

    setIsExporting(true);

    try {
      // Prepare data rows
      const rows = await Promise.all(
        processedInstallments.map(async (item, index) => {
          // Lấy ngày đã đóng mới nhất
          let latestPaidDateStr = '';
          try {
            const latestPaidDate = await getLatestPaymentPaidDate(item.id);
            if (latestPaidDate) {
              latestPaidDateStr = format(new Date(latestPaidDate), 'dd/MM/yyyy');
            }
          } catch (err) {
            console.error('Error getting latest paid date:', err);
          }

          // Ngày bắt đầu & kết thúc
          const startDateStr = item.start_date ? format(new Date(item.start_date), 'dd/MM/yyyy') : '';
          let endDateStr = '';
          try {
            if (item.start_date && item.duration) {
              const startDate = new Date(item.start_date);
              const endDate = new Date(startDate);
              endDate.setDate(startDate.getDate() + (item.duration ?? 0) - 1);
              endDateStr = format(endDate, 'dd/MM/yyyy');
            }
          } catch (err) {
            console.error('Error calculating end date:', err);
          }

          // Ngày phải đóng tiếp theo
          const nextDueDateStr = item.payment_due_date ? format(new Date(item.payment_due_date), 'dd/MM/yyyy') : '';

          // Tính tiền thu theo kỳ
          const dailyAmount = calculateDailyAmount(item);
          const amountPerPeriod = dailyAmount * (item.payment_period ?? 1);

          return {
            'STT': index + 1,
            'Mã hợp đồng': item.contract_code,
            'Tên khách hàng': item.customer?.name || '',
            'Số điện thoại khách hàng': (item.customer as any)?.phone || '',
            'CMND': (item.customer as any)?.id_number || '',
            'Địa chỉ': (item.customer as any)?.address || '',
            'Tiền trả góp': formatCurrencyExcel(item.installment_amount),
            'Tiền giao khách': formatCurrencyExcel(item.amount_given),
            'Tỷ lệ': calculateRatio(item),
            'Ngày bắt đầu': startDateStr,
            'Ngày kết thúc': endDateStr,
            'Đã đóng đến ngày': latestPaidDateStr,
            'Đã đóng được': formatCurrencyExcel((item as any).totalPaid),
            'Còn phải đóng': formatCurrencyExcel((item as any).remainingToPay),
            'Ngày phải đóng tiếp theo': nextDueDateStr,
            'Tiền thu theo kỳ': formatCurrencyExcel(amountPerPeriod),
            'Tiền nợ': formatCurrencyExcel(item.old_debt ?? item.debt_amount),
          } as Record<string, any>;
        })
      );

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      // Optional: set column widths for better readability
      ws['!cols'] = [
        { width: 6 },   // STT
        { width: 15 },  // Mã hợp đồng
        { width: 22 },  // Tên khách hàng
        { width: 15 },  // SĐT
        { width: 18 },  // CMND
        { width: 25 },  // Địa chỉ
        { width: 15 },  // Tiền trả góp
        { width: 15 },  // Tiền giao khách
        { width: 12 },  // Tỷ lệ
        { width: 12 },  // Ngày bắt đầu
        { width: 12 },  // Ngày kết thúc
        { width: 14 },  // Đã đóng đến ngày
        { width: 15 },  // Đã đóng được
        { width: 15 },  // Còn phải đóng
        { width: 18 },  // Ngày phải đóng tiếp theo
        { width: 16 },  // Tiền thu theo kỳ
        { width: 12 },  // Tiền nợ
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Danh sách trả góp');

      // Apply styling to header row (row 1)
      const headerKeys = Object.keys(rows[0] || {});
      headerKeys.forEach((_, idx) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: idx });
        const cell = ws[cellRef];
        if (cell) {
          cell.s = {
            fill: { fgColor: { rgb: '4472C4' } }, // blue background
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
          } as any;
        }
      });

      const fileName = `DanhSachTraGop_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('Error exporting installments to Excel:', error);
      alert('Có lỗi xảy ra khi xuất Excel. Vui lòng thử lại.');
    } finally {
      setIsExporting(false);
    }
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
  };
  
  // Handle closing status dialog
  const handleCloseStatusDialog = () => {
    setSelectedInstallment(null);
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
      // Trigger cash fund update
      triggerUpdate();
      refetch();
      void triggerFinancialRefresh();
    } else {
      console.error('Error deleting installment:', error);
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
      // Thêm độ trễ để đảm bảo database đã xử lý xong
      setTimeout(() => {
        refetch();
        void triggerFinancialRefresh();
        triggerUpdate();
      }, 500); // 500ms delay
    }
  };

  // -------------------- Grand totals ----------------------
  const [totals, setTotals] = useState<InstallmentTotals | null>(null);
  const [totalsLoading, setTotalsLoading] = useState(false);

  const fetchTotals = async (f = filters) => {
    if (!currentStore?.id) return;
    setTotalsLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('installment_get_totals', {
        p_store_id: currentStore.id,
        p_filters : f ?? null,
      });
      if (error) {
        console.error('installment_get_totals error:', error);
        return;
      }
      setTotals((data as any)?.[0] ?? null);
    } catch (err) {
      console.error('Error fetching totals:', err);
    } finally {
      setTotalsLoading(false);
    }
  };

  // Fetch totals whenever filters or store change
  useEffect(() => {
    fetchTotals(filters);
  }, [JSON.stringify(filters), currentStore?.id]);

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
        {permissionsLoading ? (
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Đang tải...</p>
          </div>
        ) : hasPermission('xem_thong_tin_tra_gop') ? (
        <FinancialSummary
          fundStatus={financialSummary || undefined}
          onRefresh={triggerFinancialRefresh}
          autoFetch={false}
          enableCashFundUpdate={true}
          externalLoading={summaryRefreshing}
        />
        ) : null}
        {/* Search and filters */}
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
          exporting={isExporting}
          initialFilters={initialFilters}
          itemsPerPage={itemsPerPage}
          onPageSizeChange={handlePageSizeChange}
        />
        
        {/* Error message */}
        {error && (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        )}
        
        {/* Installments Table */}
        <InstallmentsTable
          installments={displayInstallments}
          statusMap={INSTALLMENT_STATUS_MAP}
          isLoading={loading || calcLoading}
          onEdit={handleEditInstallment}
          onUpdateStatus={handleOpenStatusDialog}
          onDelete={handleOpenDeleteDialog}
          onShowPaymentActions={handleShowPaymentActions}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totals={totals ?? undefined}
          onRefresh={() => {
            refetch();
            void triggerFinancialRefresh();
            triggerUpdate();
            fetchTotals(filters);
          }}
        />
        
        
        {/* Modal tạo hợp đồng mới */}
        <InstallmentCreateModal
          isOpen={isInstallmentCreateModalOpen}
          onClose={() => setIsInstallmentCreateModalOpen(false)}
          onSuccess={() => {
            setIsInstallmentCreateModalOpen(false);
            refetch();
            void triggerFinancialRefresh();
            triggerUpdate(); // Trigger cash fund update
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
              triggerUpdate(); // Trigger cash fund update
            }}
          />
        )}
        
        {/* Modal chi tiết hợp đồng đã bị loại bỏ */}
        
        {/* Modal thao tác thanh toán */}
        {selectedInstallmentForPayment && (
          <InstallmentPaymentHistoryModal
            isOpen={isPaymentActionsModalOpen}
            onClose={handleClosePaymentHistory}
            installment={selectedInstallmentForPayment}
            onContractStatusChange={() => {
              refetch();
              handleClosePaymentHistory(true);
            }}
            onPaymentUpdate={triggerFinancialRefresh}
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
                onClick={handleDeleteAction}
                className="bg-red-600 hover:bg-red-700"
              >
                Xóa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
