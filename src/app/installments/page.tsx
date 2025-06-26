'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
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
import { calculateRemainingToPay } from '@/lib/installmentCalculations';
import { calculateMultipleInstallmentStatus } from '@/lib/Installments/calculate_installment_status';

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
    handleDelete,
    handleUpdateStatus,
    refetch
  } = useInstallments();
  
  // Sử dụng custom hook để lấy dữ liệu tài chính
  const { data: financialSummary, refresh: refreshFinancial } = useInstallmentsSummary();
  
  // Use auto update cash fund hook
  const { triggerUpdate } = useAutoUpdateCashFund({
    onUpdate: (newCashFund) => {
      console.log('Cash fund updated to:', newCashFund);
      refreshFinancial(); // Refresh financial data after cash fund update
    }
  });
  
  // Refresh financial data when store changes
  useEffect(() => {
    refreshFinancial();
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
  
  // NEW: state for enriched data & calc loading
  const [processedInstallments, setProcessedInstallments] = useState<InstallmentWithCustomer[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);
  // Exporting state for Excel export
  const [isExporting, setIsExporting] = useState(false);
  
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
  const handleExportExcel = async () => {
    if (isExporting) return; // prevent multiple clicks

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
      refreshFinancial();
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
      refetch();
      refreshFinancial();
      // Trigger cash fund update when payment history changes
      triggerUpdate();
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

        // RPC: tính trạng thái
        const calculatedStatuses = await calculateMultipleInstallmentStatus(ids);

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

          // Map status info
          const calcStatus = calculatedStatuses[it.id];
          let statusInfo: { label: string; color: string };
          if (calcStatus) {
            let color: string;
            switch (calcStatus.statusCode) {
              case 'CLOSED':
                color = 'bg-blue-100 text-blue-800 border-blue-200';
                break;
              case 'DELETED':
                color = 'bg-gray-100 text-gray-800 border-gray-200';
                break;
              case 'FINISHED':
                color = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                break;
              case 'BAD_DEBT':
                color = 'bg-purple-100 text-purple-800 border-purple-200';
                break;
              case 'OVERDUE':
                color = 'bg-red-100 text-red-800 border-red-200';
                break;
              case 'LATE_INTEREST':
                color = 'bg-yellow-100 text-yellow-800 border-yellow-200';
                break;
              case 'ON_TIME':
              default:
                color = 'bg-green-100 text-green-800 border-green-200';
                break;
            }
            statusInfo = { label: calcStatus.status, color };
          } else {
            statusInfo = statusMap[it.status] || {
              label: 'Không xác định',
              color: 'bg-gray-100 text-gray-800',
            };
          }

          return {
            ...it,
            totalPaid,
            remainingToPay: remaining,
            nextPaymentDate: nextPaymentDateLabel,
            statusInfo,
          } as InstallmentWithCustomer;
        });
        console.log('enriched', enriched);
        setProcessedInstallments(enriched);
      } catch (err) {
        console.error('Error computing installment aggregates:', err);
      } finally {
        setCalcLoading(false);
      }
    };

    compute();
  }, [installments]);

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
          onRefresh={refreshFinancial}
          autoFetch={false}
          enableCashFundUpdate={true}
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
            installments={processedInstallments}
            statusMap={statusMap}
            isLoading={loading || calcLoading}
            onEdit={handleEditInstallment}
            onUpdateStatus={handleOpenStatusDialog}
            onDelete={handleOpenDeleteDialog}
            onShowPaymentActions={handleShowPaymentActions}
            onRefresh={() => {
              refetch();
              refreshFinancial();
              triggerUpdate();
            }}
          />
        </div> 
        
        {/* Modal tạo hợp đồng mới */}
        <InstallmentCreateModal
          isOpen={isInstallmentCreateModalOpen}
          onClose={() => setIsInstallmentCreateModalOpen(false)}
          onSuccess={() => {
            setIsInstallmentCreateModalOpen(false);
            refetch();
            refreshFinancial();
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
            onPaymentUpdate={refreshFinancial}
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
