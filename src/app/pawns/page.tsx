'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
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
import { usePawnStatuses } from '@/hooks/usePawnStatuses';
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
import { calculatePawnMetrics } from '@/lib/Pawns/calculate_pawn_metrics';

// Map trạng thái thành nhãn và màu sắc
const statusMap: Record<string, { label: string, color: string }> = {
  [PawnStatus.ON_TIME]: { label: 'Đang vay', color: 'bg-green-100 text-green-800' },
  [PawnStatus.OVERDUE]: { label: 'Quá hạn', color: 'bg-red-100 text-red-800' },
  [PawnStatus.LATE_INTEREST]: { label: 'Chậm lãi', color: 'bg-yellow-100 text-yellow-800' },
  [PawnStatus.BAD_DEBT]: { label: 'Nợ xấu', color: 'bg-purple-100 text-purple-800' },
  [PawnStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-blue-100 text-blue-800' },
  [PawnStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800' },
};



export default function PawnsPage() {
  
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
    handleDelete,
    refetch
  } = usePawns();
  console.log(pawns);
  // Sử dụng hook kiểm tra quyền
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  
  // Kiểm tra quyền xem danh sách hợp đồng cầm đồ
  const canViewPawnsList = hasPermission('xem_danh_sach_hop_dong_cam_do');
  
  // Lấy dữ liệu tài chính tổng hợp (summary only)
  const { summary: financialSummary, refresh: refreshSummary } = usePawnsSummary();
  
  // Chi tiết tài chính cho các hợp đồng trên trang hiện tại
  const [pawnDetails, setPawnDetails] = useState<Record<string, PawnFinancialDetail>>({});
  
  const computeDetails = async (list = pawns) => {
    const ids = list.map(p => p.id);
    if (!ids.length) {
      setPawnDetails({});
      return;
    }

    // Bulk maps similar to previous hook
    const { data: principalRows } = await supabase.rpc('get_pawn_current_principal', { p_pawn_ids: ids });
    const principalMap = new Map<string, number>();
    principalRows?.forEach((r: any) => principalMap.set(r.pawn_id, Number(r.current_principal || 0)));

    const { data: debtRows } = await supabase.rpc('get_pawn_old_debt', { p_pawn_ids: ids });
    const debtMap = new Map<string, number>();
    debtRows?.forEach((r: any) => debtMap.set(r.pawn_id, Number(r.old_debt || 0)));

    const { data: expRows } = await (supabase.rpc as any)('get_pawn_expected_interest', { p_pawn_ids: ids });
    const expectedMap = new Map<string, number>();
    const todayMap = new Map<string, number>();
    expRows?.forEach((r: any) => {
      expectedMap.set(r.pawn_id, Number(r.expected_profit || 0));
      todayMap.set(r.pawn_id, Number(r.interest_today || 0));
    });

    const { data: paidRows } = await supabase.rpc('get_pawn_paid_interest', { p_pawn_ids: ids });
    const interestMap = new Map<string, number>();
    paidRows?.forEach((r: any) => interestMap.set(r.pawn_id, Number(r.paid_interest || 0)));

    // next payment info
    const { data: npRows } = await (supabase.rpc as any)('get_pawn_next_payment_info', { p_pawn_ids: ids });
    const nextMap = new Map<string, { next_date: string | null; is_completed: boolean; has_paid: boolean }>();
    npRows?.forEach((r: any) => nextMap.set(r.pawn_id, { next_date: r.next_date, is_completed: r.is_completed, has_paid: r.has_paid }));

    const results = await Promise.all(
      list.map(async (p) => {
        return calculatePawnMetrics({
          id: p.id,
          loan_amount: p.loan_amount,
          loan_date: p.loan_date as any,
          loan_period: p.loan_period ?? 0,
        }, {
          interestMap,
          principalMap,
          debtMap,
          expectedMap,
          todayMap,
        });
      })
    );

    const map: Record<string, PawnFinancialDetail> = {};
    results.forEach((r) => {
      if (!r) return;
      const n = nextMap.get(r.pawnId);
      map[r.pawnId] = {
        pawnId: r.pawnId,
        actualLoanAmount: r.actualLoanAmount,
        oldDebt: r.oldDebt,
        expectedProfit: r.expectedProfit,
        paidInterest: r.paidInterest,
        interestToday: r.interestToday,
        nextPayment: n?.next_date ?? null,
        isCompleted: n?.is_completed ?? false,
        hasPaid: n?.has_paid ?? false,
        loading: false,
      } as any;
    });
    setPawnDetails(map);
  };

  useEffect(() => {
    computeDetails(pawns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pawns]);

  // Use auto update cash fund hook
  const { triggerUpdate } = useAutoUpdateCashFund({
    onUpdate: (newCashFund) => {
      console.log('Cash fund updated to:', newCashFund);
      refreshSummary();
      computeDetails(pawns);
    }
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

  const displayPawns = useMemo(() => {
    if (filters?.status !== 'due_tomorrow') return pawns;
    const tomorrow = addDays(new Date().setHours(0,0,0,0) as any, 1);
    return pawns.filter(p => {
      const next = pawnDetails[p.id]?.nextPayment;
      if (!next) return false;
      return isSameDay(new Date(next), tomorrow);
    });
  }, [pawns, filters?.status, pawnDetails]);

  const effectiveTotalItems = filters?.status === 'due_tomorrow' ? displayPawns.length : totalItems;
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
      handleRefresh();
      // Trigger cash fund update when payment history changes
      triggerUpdate();
    }
  };
  
  // Handle refresh after contract operations
  const handleRefresh = () => {
    refetch();
    refreshSummary();
    computeDetails(pawns);
  };
  
  const { statuses: pawnStatuses } = usePawnStatuses(pawns.map(p => p.id));

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
            />

            {/* Bảng dữ liệu hợp đồng */}
            <PawnsTable
              pawns={displayPawns}
              statusMap={statusMap}
              onEdit={handleEditPawn}
              onDelete={handleOpenDeleteDialog}
              onUpdateStatus={handleOpenStatusDialog}
              onShowPaymentHistory={handleOpenPaymentHistory}
              calculatedDetails={pawnDetails}
              calculatedStatuses={pawnStatuses}
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
            refetch(); // Refresh danh sách hợp đồng sau khi tạo mới
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
              refetch(); // Refresh danh sách hợp đồng sau khi cập nhật
              triggerUpdate(); // Trigger cash fund update
            }}
          />
        )}
      </div>
    </Layout>
  );
}
