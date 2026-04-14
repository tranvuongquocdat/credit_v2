'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';

import { toast } from '@/components/ui/use-toast';

// Import custom components
import { FinancialSummary } from '@/components/common/FinancialSummary';
import { SearchFilters } from '@/components/Pawns/SearchFilters';
import { PawnsTable } from '@/components/Pawns/PawnTable';
import { PawnsPagination } from '@/components/Pawns/PawnsPagination';
import { PawnHistoryModal as PaymentHistoryModal } from '@/components/Pawns/PawnHistoryModal';
import { PawnCreateModal } from '@/components/Pawns/PawnCreateModal';
import { PawnEditModal } from '@/components/Pawns/PawnEditModal';

// Import custom hooks
import { usePawns } from '@/hooks/usePawns';
import { usePawnsSummary } from '@/hooks/usePawnsSummary';
import type { PawnFinancialDetail } from '@/hooks/usePawnCalculation';
import { useAutoUpdateCashFund } from '@/hooks/useCashFundUpdater';
import { usePermissions } from '@/hooks/usePermissions';
// Removed: import { usePawnStatuses } from '@/hooks/usePawnStatuses';
import { PawnStatus, PawnWithCustomer } from '@/models/pawn';
import { reopenContract } from '@/lib/Pawns/reopen_contract';
import { updatePawnStatus } from '@/lib/pawn';
import { getLatestPaymentPaidDate } from '@/lib/Pawns/get_latest_payment_paid_date';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { formatCurrencyExcel } from '@/lib/utils';
import { getPawnInterestDisplayString } from '@/lib/interest-calculator';
import * as XLSX from 'xlsx';
import { isSameDay, addDays } from 'date-fns';
import { usePawnCalculations } from '@/hooks/usePawnCalculation';
import { useStore } from '@/contexts/StoreContext';
import { startScreenLoadTimer } from '@/lib/perf-debug';

// Type for totals row returned by RPC
interface PawnTotals {
  total_loan_amount: number;
  total_paid_interest: number;
  total_old_debt: number;
  total_interest_today: number;
}

export default function PawnsPage() {
  const screenLoadTimerRef = useRef<(() => void) | null>(null);
  
  // State để lưu initial filters từ URL
  const [initialFilters, setInitialFilters] = useState<Partial<any> | undefined>(undefined);
  
  // Use our custom hook for pawns data and operations
  const { 
    pawns, 
    loading, 
    totalItems, 
    currentPage, 
    itemsPerPage,
    filters,
    handleSearch,
    handleReset,
    handlePageChange,
    handlePageSizeChange,
    handleDelete,
    refetch
  } = usePawns();
  // Sử dụng hook kiểm tra quyền
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  
  // Kiểm tra quyền xem danh sách hợp đồng cầm đồ
  const canViewPawnsList = hasPermission('xem_danh_sach_hop_dong_cam_do');
  
  // Lấy dữ liệu tài chính tổng hợp (summary only)
  const { summary: financialSummary, refresh: refreshSummary } = usePawnsSummary({ autoFetch: false });
  
  // Tính toán chi tiết tài chính bằng hook
  const { details: pawnDetails, loading: calcLoading, refresh: refreshPawnDetails } = usePawnCalculations({ autoFetch: false });

  // Use auto update cash fund hook
  const { triggerUpdate } = useAutoUpdateCashFund({
    onUpdate: () => {}
  });
  // State for dialogs
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPawn, setSelectedPawn] = useState<PawnWithCustomer | null>(null);
  
  // State cho modal lịch sử thanh toán
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] = useState(false);
  const [paymentHistoryPawn, setPaymentHistoryPawn] = useState<PawnWithCustomer | null>(null);
  
  // State cho modal tạo hợp đồng mới
  const [isPawnCreateModalOpen, setIsPawnCreateModalOpen] = useState(false);
  
  // State cho modal chỉnh sửa hợp đồng
  const [isPawnEditModalOpen, setIsPawnEditModalOpen] = useState(false);
  const [editPawnId, setEditPawnId] = useState<string>('');
  
  // Exporting state
  const [isExporting, setIsExporting] = useState(false);

  // Totals state
  const [totals, setTotals] = useState<PawnTotals | null>(null);

  // Current store context
  const { currentStore } = useStore();

  useEffect(() => {
    if (!currentStore?.id) return;

    const isPageLoading = loading || permissionsLoading || calcLoading;

    if (isPageLoading && !screenLoadTimerRef.current) {
      screenLoadTimerRef.current = startScreenLoadTimer('PawnsPage', {
        context: { storeId: currentStore.id },
      });
      return;
    }

    if (!isPageLoading && screenLoadTimerRef.current) {
      screenLoadTimerRef.current();
      screenLoadTimerRef.current = null;
    }
  }, [currentStore?.id, loading, permissionsLoading, calcLoading]);

  const fetchTotals = useCallback(async (f: typeof filters) => {
    if (!currentStore?.id) return;
    try {
      const { data, error } = await (supabase as any).rpc('pawn_get_totals', {
        p_store_id: currentStore.id,
        p_filters : f ?? null,
      });
      if (!error) {
        setTotals((data as any)?.[0] ?? null);
      }
    } catch (err) {
      console.error('pawn_get_totals error', err);
    }
  }, [currentStore?.id]);

  const refreshPawnsScreenData = useCallback(async (f: typeof filters) => {
    await Promise.allSettled([
      refetch(),
      refreshSummary(),
      refreshPawnDetails(),
      fetchTotals(f),
    ]);
  }, [fetchTotals, refetch, refreshSummary, refreshPawnDetails]);

  // Fetch totals when filters or store change
  useEffect(() => {
    refreshPawnsScreenData(filters);
  }, [filters, currentStore?.id, refreshPawnsScreenData]);
  // Removed: Status calculation now handled by pawns_by_store view directly

  // No client-side filtering needed - all filtering now handled server-side by pawns_by_store view
  const displayPawns = pawns;
  
  // All filtering now server-side - no need for client-side pagination adjustments
  const effectiveTotalItems = totalItems;
  const totalPages = Math.ceil(effectiveTotalItems / itemsPerPage);
  
  // Handle search filters
  const handleSearchFilters = (filters: any) => {
    handleSearch(filters);
  };
  
  // Handle create new pawn
  const handleCreatePawn = () => {
    // Mở modal tạo hợp đồng mới thay vì chuyển trang
    setIsPawnCreateModalOpen(true);
  };
  
  // Handle export to Excel
  const handleExportExcel = async () => {
    if (isExporting) return;

    if (!pawns || pawns.length === 0) {
      alert('Không có dữ liệu để xuất Excel');
      return;
    }

    setIsExporting(true);

    try {
      const rows = await Promise.all(
        pawns.map(async (p, index) => {
          // Lấy ngày thanh toán lãi phí mới nhất
          let latestPaidDateStr = '';
          try {
            const latestPaid = await getLatestPaymentPaidDate(p.id);
            if (latestPaid) latestPaidDateStr = format(new Date(latestPaid), 'dd/MM/yyyy');
          } catch (err) {
            console.error('getLatestPaymentPaidDate error', err);
          }

          // Lấy ngày đóng hợp đồng gần nhất
          let latestCloseStr = '';
          try {
            const { data: closeRows, error: closeErr } = await supabase
              .from('pawn_history')
              .select('effective_date')
              .eq('pawn_id', p.id)
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
          const startDateStr = p.loan_date ? format(new Date(p.loan_date), 'dd/MM/yyyy') : '';
          let endDateStr = '';
          try {
            if (p.loan_date && p.loan_period) {
              const startDate = new Date(p.loan_date);
              const endDate = new Date(startDate);
              endDate.setDate(startDate.getDate() + (p.loan_period ?? 0) - 1);
              endDateStr = format(endDate, 'dd/MM/yyyy');
            }
          } catch {}

          // Lãi phí đã đóng và ngày phải đóng tiếp
          const detail = pawnDetails[p.id];
          const paidInterest = detail?.paidInterest ?? 0;
          const nextPaymentDateStr = detail?.isCompleted ? 'Hoàn thành' : detail?.nextPayment ? format(new Date(detail.nextPayment), 'dd/MM/yyyy') : '';

          return {
            'STT': index + 1,
            'Mã hợp đồng': p.contract_code || '',
            'Tên khách hàng': p.customer?.name || '',
            'SĐT': p.customer?.phone || '',
            'CMND': p.customer?.id_number || '',
            'Địa chỉ': (p as any).address || '',
            'Đồ cầm': p.collateral_detail.name || '',
            'Tiền vay': formatCurrencyExcel(p.loan_amount),
            'Lãi phí': getPawnInterestDisplayString(p),
            'Ngày vay': startDateStr,
            'Ngày kết thúc': endDateStr,
            'Ghi chú': p.notes || '',
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

      XLSX.utils.book_append_sheet(wb, ws, 'Danh sách cầm đồ');

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

      const fileName = `DanhSachCamDo_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Export Excel error', err);
      alert('Có lỗi khi xuất Excel');
    } finally {
      setIsExporting(false);
    }
  };
  
  // Handle edit pawn
  const handleEditPawn = (pawnId: string) => {
    // Mở modal chỉnh sửa thay vì chuyển trang
    setEditPawnId(pawnId);
    setIsPawnEditModalOpen(true);
  };
  
  // Handle opening status dialog
  const handleOpenStatusDialog = (pawn: PawnWithCustomer) => {
    // Nếu hợp đồng đang ở trạng thái đóng (closed), xử lý mở lại hợp đồng
    if (pawn.status === PawnStatus.CLOSED) {
      // Hiển thị dialog xác nhận
      if (confirm('Bạn có muốn mở lại hợp đồng này không? Trạng thái sẽ chuyển về "Đúng hẹn"')) {
        reopenPawn(pawn);
      }
    } else {
      // Trường hợp bình thường: mở dialog chọn trạng thái
      setSelectedPawn(pawn);
    }
  };

  // Hàm mở lại hợp đồng
  const reopenPawn = async (pawn: PawnWithCustomer) => {
    try {
      // Ghi lại lịch sử mở lại hợp đồng với số tiền đóng hợp đồng gần nhất
      const { recordContractReopening } = await import('@/lib/Credits/credit-amount-history');
      const result = await recordContractReopening(
        pawn.id,
        new Date().toISOString(),
        'Mở lại hợp đồng từ trạng thái đóng'
      );
      
      console.log('Reopened contract with amount:', result.lastClosureAmount);
      
      // Cập nhật trạng thái hợp đồng về đúng hẹn
      updatePawnStatus(pawn.id, PawnStatus.ON_TIME);
      
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
  const handleOpenDeleteDialog = (pawn: PawnWithCustomer) => {
    setSelectedPawn(pawn);
    setIsDeleteDialogOpen(true);
  };
  
  // Handle closing delete dialog
  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setSelectedPawn(null);
  };
  
  // Handle deleting pawn
  const handleDeletePawn = async (pawnId: string) => {
    try {
      const result = await handleDelete(pawnId);
      
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
      console.error('Error in handleDeletePawn:', error);
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
  const handleOpenPaymentHistory = async (pawn: PawnWithCustomer) => {
    setPaymentHistoryPawn(pawn);
    setIsPaymentHistoryModalOpen(true);
  };
  
  // Handle closing payment history modal
  const handleClosePaymentHistory = (hasDataChanged?: boolean) => {
    setIsPaymentHistoryModalOpen(false);
    setPaymentHistoryPawn(null);
    // Only refresh data if there were actual changes
    if (hasDataChanged) {
      // Thêm độ trễ để đảm bảo database đã xử lý xong
      setTimeout(() => {
        handleRefresh();
        // Trigger cash fund update when payment history changes
        triggerUpdate();
      }, 500); // 500ms delay
    }
  };
  
  // Handle refresh after contract operations
  const handleRefresh = () => {
    refreshPawnsScreenData(filters);
  };
  

  return (
    <Layout>
      <div className="max-w-full">
        {/* Title và nút trở về */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý hợp đồng cầm đồ</h1>
          </div>
        </div>
        
        {/* Thông tin tài chính - Chỉ hiển thị nếu có quyền */}
        {permissionsLoading ? (
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Đang tải...</p>
          </div>
        ) : hasPermission('xem_thong_tin_cam_do') ? (
          <FinancialSummary 
            fundStatus={financialSummary || undefined}
            onRefresh={() => {
              handleRefresh();
              triggerUpdate();
            }}
            autoFetch={false}
            enableCashFundUpdate={true}
        />
        ) : null}
        
        {/* Kiểm tra quyền xem danh sách hợp đồng */}
        {permissionsLoading ? (
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Đang tải...</p>
          </div>
        ) : canViewPawnsList ? (
          <>
            {/* Bộ lọc và tìm kiếm */}
            <SearchFilters
              onSearch={handleSearchFilters}
              onReset={handleReset}
              onCreateNew={handleCreatePawn}
              onExportExcel={handleExportExcel}
              exporting={isExporting}
              initialFilters={initialFilters}
              itemsPerPage={itemsPerPage}
              onPageSizeChange={handlePageSizeChange}
            />

            {/* Bảng dữ liệu hợp đồng */}
            <PawnsTable
              pawns={displayPawns}
              statusMap={undefined} // Now optional since we use shared utility
              onEdit={handleEditPawn}
              onDelete={handleOpenDeleteDialog}
              onUpdateStatus={handleOpenStatusDialog}
              onShowPaymentHistory={handleOpenPaymentHistory}
              calculatedDetails={pawnDetails}
              calculatedStatuses={undefined} // Status now in pawn.status_code from view
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              totals={totals ?? undefined}
            />
            
            {/* Phân trang */}
            <PawnsPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={effectiveTotalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
            />
          </>
        ) : (
          <div className="p-8 border rounded-md mb-4 bg-gray-50 text-center">
            <p className="text-gray-500">Bạn không có quyền xem danh sách hợp đồng cầm đồ.</p>
          </div>
        )}
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa hợp đồng</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc chắn muốn xóa hợp đồng {selectedPawn?.contract_code}?
                Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => selectedPawn && handleDeletePawn(selectedPawn.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Xóa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Modal lịch sử thanh toán */}
        {paymentHistoryPawn && (
          <PaymentHistoryModal
            isOpen={isPaymentHistoryModalOpen}
            onClose={handleClosePaymentHistory}
            pawn={paymentHistoryPawn}
          />
        )}

        {/* Modal tạo hợp đồng mới */}
        <PawnCreateModal
          isOpen={isPawnCreateModalOpen}
          onClose={() => setIsPawnCreateModalOpen(false)}
          onSuccess={() => {
            setIsPawnCreateModalOpen(false);
            handleRefresh(); // Refresh đồng bộ dữ liệu màn pawns
            triggerUpdate(); // Trigger cash fund update
          }}
        />
        
        {/* Modal chỉnh sửa hợp đồng */}
        {editPawnId && (
          <PawnEditModal
            isOpen={isPawnEditModalOpen}
            onClose={() => setIsPawnEditModalOpen(false)}
            pawnId={editPawnId}
            onSuccess={() => {
              setIsPawnEditModalOpen(false);
              handleRefresh(); // Refresh đồng bộ dữ liệu màn pawns
              triggerUpdate(); // Trigger cash fund update
            }}
          />
        )}
      </div>
    </Layout>
  );
}
