'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { PawnCreateModal } from '@/components/Pawns/PawnCreateModal';
import { PawnEditModal } from '@/components/Pawns/PawnEditModal';
import { PawnHistoryModal } from '@/components/Pawns/PawnHistoryModal';
import { PawnTable } from '@/components/Pawns/PawnTable';
import { PawnSearchFilters } from '@/components/Pawns/PawnSearchFilters';
import { PawnsPagination } from '@/components/Pawns/PawnsPagination';
import { FinancialSummary } from '@/components/common/FinancialSummary';
import { useRouter } from 'next/navigation';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { getPawns } from '@/lib/pawn';
import { deletePawn } from '@/lib/pawn';
import { Button } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { StoreFinancialData } from '@/lib/store';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PawnFilters {
  contract_code: string;
  customer_name: string;
  status: string;
  start_date: string;
  end_date: string;
}

// Custom hook để lấy thông tin tài chính tổng hợp cho pawn system
function usePawnsSummary() {
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
      
      // Get pawns for interest calculation
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      // 2. Lấy tổng tiền cho vay (tổng loan_amount của các hợp đồng đang cầm)
      const { data: activePawnsData, error: activePawnsError } = await supabase
        .from('pawns')
        .select('loan_amount')
        .in('status', [PawnStatus.ON_TIME, PawnStatus.OVERDUE, PawnStatus.LATE_INTEREST, PawnStatus.BAD_DEBT]);
      
      if (activePawnsError) {
        console.error('Lỗi khi lấy dữ liệu hợp đồng đang hoạt động:', activePawnsError);
      }
      
      // Tính tổng tiền cho vay
      const totalLoan = activePawnsData?.reduce((sum, pawn) => sum + (pawn.loan_amount || 0), 0) || 0;
      
      // 3. Lấy tổng tiền nợ cũ
      const { data: oldDebtData, error: oldDebtError } = await supabase
        .from('pawn_payment_periods')
        .select(`
          expected_amount,
          actual_amount,
          pawns!inner(status)
        `)
        .neq('pawns.status', PawnStatus.CLOSED)
        .neq('pawns.status', PawnStatus.DELETED);
      
      if (oldDebtError) {
        console.error('Lỗi khi lấy dữ liệu nợ cũ:', oldDebtError);
      }
      
      // Tính tổng tiền nợ cũ
      let oldDebt = 0;
      oldDebtData?.forEach(period => {
        const expected = period.expected_amount || 0;
        const actual = period.actual_amount || 0;
        if (expected > actual) {
          oldDebt += (expected - actual);
        }
      });
      
      // 4. Lấy tổng lãi phí đã thu (tổng actual_amount của các kỳ thanh toán)
      const { data: collectedInterestData, error: collectedInterestError } = await supabase
        .from('pawn_payment_periods')
        .select('actual_amount, pawns!inner(status)')
        .neq('pawns.status', PawnStatus.CLOSED)
        .neq('pawns.status', PawnStatus.DELETED);
      
      if (collectedInterestError) {
        console.error('Lỗi khi lấy dữ liệu lãi phí đã thu:', collectedInterestError);
      }
      
      // Tính tổng lãi phí đã thu
      const collectedInterest = collectedInterestData?.reduce((sum, period) => sum + (period.actual_amount || 0), 0) || 0;
      
      // 5. Lấy dữ liệu pawns đang hoạt động để tính lãi dự kiến trong tháng này
      const { data: activePawns, error: expectedInterestError } = await supabase
        .from('pawns')
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
        .in('status', [PawnStatus.ON_TIME, PawnStatus.OVERDUE, PawnStatus.LATE_INTEREST, PawnStatus.BAD_DEBT])
        .lte('loan_date', lastDayOfMonth.toISOString());
      
      if (expectedInterestError) {
        console.error('Lỗi khi lấy dữ liệu cầm đồ đang hoạt động:', expectedInterestError);
      }
      
      // Tính tổng lãi phí dự kiến trong tháng này
      let monthlyInterestAmount = 0;
      
      if (activePawns) {
        monthlyInterestAmount = activePawns.reduce((total, pawn) => {
          let interestPerMonth = 0;
          
          // Đã cầm được bao nhiêu ngày
          const loanDate = new Date(pawn.loan_date);
          const daysSinceLoan = Math.max(0, Math.floor((today.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24)));
          
          // Không tính nếu khoản cầm bắt đầu sau tháng này
          if (loanDate > lastDayOfMonth) return total;
          
          // Kiểm tra pawn còn trong thời hạn cầm không
          const isWithinLoanPeriod = daysSinceLoan <= pawn.loan_period;
          if (!isWithinLoanPeriod) return total;
          
          // Tính toán lãi dựa trên loại lãi và cách tính
          switch (pawn.interest_ui_type) {
            case 'daily':
              // Số ngày trong tháng này mà khoản cầm đang hoạt động
              const daysInMonth = Math.min(
                lastDayOfMonth.getDate(),
                pawn.loan_period - (daysSinceLoan - today.getDate())
              );
              
              if (pawn.interest_notation === 'k_per_million') {
                // k/triệu/ngày
                interestPerMonth = (pawn.loan_amount / 1000000) * pawn.interest_value * daysInMonth * 1000;
              } else if (pawn.interest_notation === 'k_per_day') {
                // k/ngày
                interestPerMonth = pawn.interest_value * daysInMonth * 1000;
              }
              break;
              
            case 'monthly_30':
            case 'monthly_custom':
              if (pawn.interest_notation === 'percent_per_month') {
                // %/tháng
                const monthlyRate = pawn.interest_value / 100;
                interestPerMonth = pawn.loan_amount * monthlyRate;
              }
              break;
              
            case 'weekly_percent':
              if (pawn.interest_notation === 'percent_per_week') {
                // %/tuần
                const weeklyRate = pawn.interest_value / 100;
                // Số tuần trong tháng này (xấp xỉ 4.35 tuần/tháng)
                const weeksInMonth = 4.35;
                interestPerMonth = pawn.loan_amount * weeklyRate * weeksInMonth;
              }
              break;
              
            case 'weekly_k':
              if (pawn.interest_notation === 'k_per_week') {
                // k/tuần
                // Số tuần trong tháng này (xấp xỉ 4.35 tuần/tháng)
                const weeksInMonth = 4.35;
                interestPerMonth = pawn.interest_value * weeksInMonth * 1000;
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

export default function PawnsPage() {
  const router = useRouter();
  const { currentStore, loading: storeLoading } = useStore();
  
  // State for pawns data
  const [pawns, setPawns] = useState<PawnWithCustomerAndCollateral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage] = useState(20);
  
  // State for filters
  const [filters, setFilters] = useState<PawnFilters>({
    contract_code: '',
    customer_name: '',
    status: 'on_time',
    start_date: '',
    end_date: ''
  });
  
  // State for modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedPawnId, setSelectedPawnId] = useState<string>('');
  const [selectedPawn, setSelectedPawn] = useState<PawnWithCustomerAndCollateral | null>(null);
  
  // State for delete confirmation dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [pawnToDelete, setPawnToDelete] = useState<PawnWithCustomerAndCollateral | null>(null);
  
  // Lấy dữ liệu tài chính tổng hợp
  const { data: financialSummary, refresh: refreshFinancial } = usePawnsSummary();
  
  // Status mapping for display
  const statusMap = {
    [PawnStatus.ON_TIME]: { label: 'Đang cầm', color: 'bg-green-100 text-green-800' },
    [PawnStatus.OVERDUE]: { label: 'Quá hạn', color: 'bg-red-100 text-red-800' },
    [PawnStatus.LATE_INTEREST]: { label: 'Chậm lãi', color: 'bg-yellow-100 text-yellow-800' },
    [PawnStatus.BAD_DEBT]: { label: 'Nợ xấu', color: 'bg-red-100 text-red-800' },
    [PawnStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-gray-100 text-gray-800' },
    [PawnStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800' }
  };
  
  // Load pawns data
  const loadPawns = async (page: number = currentPage, searchFilters: PawnFilters = filters) => {
    if (!currentStore?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Combine search filters into a single search query
      const searchQuery = searchFilters.contract_code || searchFilters.customer_name || '';
      
      // Convert 'all' status to empty string for API
      const statusFilter = searchFilters.status === 'all' ? '' : searchFilters.status;
      
      const { data, error: pawnError, total } = await getPawns(
        page,
        itemsPerPage,
        searchQuery,
        currentStore.id,
        statusFilter
      );
      
      if (pawnError) throw pawnError;
      
      setPawns(data || []);
      setTotalPages(Math.ceil(total / itemsPerPage));
      setTotalItems(total);
    } catch (err) {
      console.error('Error loading pawns:', err);
      setError('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.');
      toast({
        title: 'Lỗi',
        description: 'Không thể tải danh sách hợp đồng cầm đồ',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Load data when component mounts or store changes
  useEffect(() => {
    if (currentStore?.id) {
      loadPawns(1, filters);
      setCurrentPage(1);
    }
  }, [currentStore?.id]);
  
  // Handle search
  const handleSearch = (searchFilters: PawnFilters) => {
    setFilters(searchFilters);
    setCurrentPage(1);
    loadPawns(1, searchFilters);
  };
  
  // Handle reset filters
  const handleResetFilters = () => {
    const emptyFilters: PawnFilters = {
      contract_code: '',
      customer_name: '',
      status: 'on_time',
      start_date: '',
      end_date: ''
    };
    setFilters(emptyFilters);
    setCurrentPage(1);
    loadPawns(1, emptyFilters);
  };
  
  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadPawns(page, filters);
  };
  
  // Handle open create modal
  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };
  
  // Handle close create modal
  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };
  
  // Handle pawn creation success
  const handleCreateSuccess = (pawnId: string) => {
    toast({
      title: 'Thành công',
      description: 'Hợp đồng cầm đồ đã được tạo thành công',
      variant: 'default',
    });
    loadPawns(currentPage, filters);
    refreshFinancial(); // Refresh financial data after creating new pawn
  };
  
  // Handle edit pawn
  const handleEditPawn = (pawnId: string) => {
    setSelectedPawnId(pawnId);
    setIsEditModalOpen(true);
  };
  
  // Handle close edit modal
  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedPawnId('');
  };
  
  // Handle edit success
  const handleEditSuccess = () => {
    toast({
      title: 'Thành công',
      description: 'Hợp đồng cầm đồ đã được cập nhật thành công',
      variant: 'default',
    });
    loadPawns(currentPage, filters);
    refreshFinancial(); // Refresh financial data after editing pawn
  };

  // Handle view detail
  const handleViewDetail = (pawn: PawnWithCustomerAndCollateral) => {
    setSelectedPawn(pawn);
    setIsHistoryModalOpen(true);
  };

  // Handle close history modal
  const handleCloseHistoryModal = (hasDataChanged?: boolean) => {
    setIsHistoryModalOpen(false);
    setSelectedPawn(null);
    // Only refresh data if there were actual changes
    if (hasDataChanged) {
      loadPawns(currentPage, filters);
      refreshFinancial();
    }
  };
  
  // Handle delete pawn
  const handleDelete = async (pawnId: string) => {
    // Find the pawn to delete
    const pawn = pawns.find(p => p.id === pawnId);
    if (!pawn) return;
    
    // Set the pawn to delete and open dialog
    setPawnToDelete(pawn);
    setIsDeleteDialogOpen(true);
  };
  
  // Handle confirming delete
  const handleConfirmDelete = async () => {
    if (!pawnToDelete) return;
    
    try {
      const result = await deletePawn(pawnToDelete.id);
      
      if (result.error) {
        toast({
          title: 'Lỗi',
          description: result.error.message || 'Không thể xóa hợp đồng',
          variant: 'destructive',
        });
        return;
      }
      
      toast({
        title: 'Thành công',
        description: 'Hợp đồng đã được xóa thành công',
        variant: 'default',
      });
      
      // Reload data
      loadPawns(currentPage, filters);
      refreshFinancial();
    } catch (error) {
      console.error('Error deleting pawn:', error);
      toast({
        title: 'Lỗi',
        description: 'Có lỗi xảy ra khi xóa hợp đồng',
        variant: 'destructive',
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setPawnToDelete(null);
    }
  };
  
  // Handle export Excel
  const handleExportExcel = () => {
    toast({
      title: 'Thông báo',
      description: 'Chức năng xuất Excel đang được phát triển',
      variant: 'default',
    });
  };
  
  if (storeLoading) {
    return (
      <Layout>
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quản lý cầm đồ</h1>
            </div>
          </div>
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
          </div>
        </div>
      </Layout>
    );
  }
  
  if (!currentStore) {
    return (
      <Layout>
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quản lý cầm đồ</h1>
            </div>
          </div>
          <div className="text-center py-10">
            <p>Vui lòng chọn cửa hàng để tiếp tục.</p>
          </div>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="max-w-full">
        {/* Title và nút trở về */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý cầm đồ</h1>
          </div>
        </div>
        
        {/* Thông tin tài chính */}
        <FinancialSummary 
          fundStatus={financialSummary || undefined}
          onRefresh={refreshFinancial}
          autoFetch={false}
        />
        
        {/* Search Filters */}
        <PawnSearchFilters
          statusMap={statusMap}
          onSearch={handleSearch}
          onReset={handleResetFilters}
          onCreateNew={handleOpenCreateModal}
          onExportExcel={handleExportExcel}
        />
        
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {/* Pawns Table */}
        <PawnTable
          pawns={pawns}
          loading={loading}
          statusMap={statusMap}
          onEdit={handleEditPawn}
          onViewDetail={handleViewDetail}
          onDelete={handleDelete}
        />
        
        {/* Pagination */}
        <PawnsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
        />
      </div>
      
      {/* Modals */}
      <PawnCreateModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onSuccess={handleCreateSuccess}
      />
      
      {selectedPawnId && (
        <PawnEditModal
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          pawnId={selectedPawnId}
          onSuccess={handleEditSuccess}
        />
      )}

      {selectedPawn && (
        <PawnHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={handleCloseHistoryModal}
          pawn={selectedPawn}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa hợp đồng</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa hợp đồng {pawnToDelete?.contract_code}?
              Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
} 