'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { PawnWarningsTable } from '@/components/Pawns/PawnWarningsTable';
import { PawnHistoryModal } from '@/components/Pawns/PawnHistoryModal';
import { useRouter } from 'next/navigation';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { getPawnWarnings } from '@/lib/pawn-warnings';
import { Button } from '@/components/ui/button';
import { Download, Search } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { PawnWarningsPagination } from '@/components/Pawns/PawnWarningsPagination';
// Removed: import { calculatePawnStatus } from '@/lib/Pawns/calculate_pawn_status';
import { usePermissions } from "@/hooks/usePermissions";
import { useDebounce } from '@/hooks/useDebounce';

export default function PawnWarningsPage() {
  const router = useRouter();
  const { currentStore, loading: storeLoading } = useStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Kiểm tra quyền xem danh sách hợp đồng trả góp
  const canViewPawnWarnings = hasPermission('xem_danh_sach_hop_dong_tra_gop');
  // State for pawns data
  const [pawns, setPawns] = useState<PawnWithCustomerAndCollateral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;
  
  // State for summary
  const [summary, setSummary] = useState({
    totalLoanAmount: 0,
    totalDueAmount: 0
  });
  
  // State for filters
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const debouncedCustomerFilter = useDebounce(customerNameFilter, 500);
  const [statusFilter, setStatusFilter] = useState<PawnStatus | "all">("all");
  
  // State for modals
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedPawn, setSelectedPawn] = useState<PawnWithCustomerAndCollateral | null>(null);
  
  // Status mapping for display
  const statusMap = {
    [PawnStatus.ON_TIME]: { label: 'Đang cầm', color: 'bg-green-100 text-green-800' },
    [PawnStatus.LATE_INTEREST]: { label: 'Chậm lãi', color: 'bg-yellow-100 text-yellow-800' },
    [PawnStatus.BAD_DEBT]: { label: 'Nợ xấu', color: 'bg-red-100 text-red-800' },
    [PawnStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-gray-100 text-gray-800' },
    [PawnStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800' }
  };
  
  // Load pawns data when the page loads, store changes, or pagination/filter changes
  useEffect(() => {
    if (currentStore?.id) {
      loadPawns();
    }
  }, [currentStore, currentPage, debouncedCustomerFilter, statusFilter]);
  
  // Load pawns with warnings
  const loadPawns = async () => {
    if (!currentStore?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: warningsError, totalItems: total, totalPages: pages, summary: summaryData } = await getPawnWarnings(
        currentPage,
        itemsPerPage,
        currentStore.id,
        debouncedCustomerFilter,
        statusFilter
      );
      
      if (warningsError) {
        throw warningsError;
      }
      
      setPawns(data || []);
      setTotalItems(total || 0);
      setTotalPages(pages || 1);
      
      if (summaryData) {
        setSummary(summaryData);
      }
    } catch (err) {
      console.error('Error loading pawn warnings:', err);
      setError('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.');
      toast({
        title: 'Lỗi',
        description: 'Không thể tải danh sách cảnh báo cầm đồ',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle view detail - optimized to use view data if available
  const handleViewDetail = async (pawn: PawnWithCustomerAndCollateral) => {
    // If status_code is already available from the view, use it directly
    if (pawn.status_code) {
      // Map status_code to PawnStatus enum
      const statusMapping: Record<string, PawnStatus> = {
        'ON_TIME': PawnStatus.ON_TIME,
        'CLOSED': PawnStatus.CLOSED,
        'DELETED': PawnStatus.DELETED,
        'OVERDUE': PawnStatus.ON_TIME, // Map to ON_TIME for now
        'LATE_INTEREST': PawnStatus.LATE_INTEREST,
        'FINISHED': PawnStatus.CLOSED, // Map to CLOSED
        'BAD_DEBT': PawnStatus.BAD_DEBT,
      };
      
      pawn.status = statusMapping[pawn.status_code] || PawnStatus.ON_TIME;
    } else {
      // Fallback: assume ON_TIME if status_code not available
      pawn.status = PawnStatus.ON_TIME;
    }
    
    setSelectedPawn(pawn);
    setIsHistoryModalOpen(true);
  };

  // Handle customer click to navigate to pawns
  const handleCustomerClick = (pawn: PawnWithCustomerAndCollateral) => {
    router.push(`/pawns/${pawn.contract_code}`);
  };

  // Handle close history modal
  const handleCloseHistoryModal = (hasDataChanged?: boolean) => {
    setIsHistoryModalOpen(false);
    setSelectedPawn(null);
    
    // Reload data if there were changes
    if (hasDataChanged) {
      loadPawns();
    }
  };
  
  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // Handle filter change
  const handleCustomerFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerNameFilter(e.target.value);
    setCurrentPage(1); // Reset to first page when filter changes
  };
  
  // Handle status filter change
  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value as PawnStatus | "all");
    setCurrentPage(1); // Reset to first page when filter changes
  };
  
  // Handle clear filters
  const handleClearFilters = () => {
    setCustomerNameFilter("");
    setStatusFilter("all");
    setCurrentPage(1);
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
              <h1 className="text-lg font-bold">Cảnh báo cầm đồ</h1>
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
              <h1 className="text-lg font-bold">Cảnh báo cầm đồ</h1>
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
      {permissionsLoading ? (
        <div className="p-4 border rounded-md mb-4 bg-gray-50">
          <p className="text-center text-gray-500">Đang tải...</p>
        </div>
      ) : !canViewPawnWarnings ? (
        <div className="p-4 border rounded-md mb-4 bg-gray-50">
          <p className="text-center text-gray-500">Bạn không có quyền xem cảnh báo cầm đồ</p>
        </div>
      ) : (
      <>
      <div className="max-w-full">
        {/* Title */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Cảnh báo cầm đồ</h1>
          </div>
        </div>
        
        {/* Search Filters */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tên khách hàng</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  type="text"
                  placeholder="Tên khách hàng, VD: Tuấn"
                  value={customerNameFilter}
                  onChange={handleCustomerFilterChange}
                  className="pl-10 w-full"
                />
              </div>
            </div>

            <div className="flex items-end gap-2">
              <Button 
                onClick={handleClearFilters}
                variant="outline"
                disabled={!customerNameFilter && statusFilter === "all"}
              >
                Xóa bộ lọc
              </Button>
              <Button 
                onClick={handleExportExcel}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Xuất Excel
              </Button>
            </div>
          </div>
          
          {/* Show filter info if active */}
          {(customerNameFilter || statusFilter !== "all") && (
            <div className="mt-2 text-sm text-blue-600">
              {customerNameFilter && (
                <span>Đang lọc theo tên khách hàng: <span className="font-semibold">{customerNameFilter}</span> </span>
              )}
              {totalItems > 0 ? 
                ` (${totalItems} kết quả)` : 
                " (Không có kết quả)"}
            </div>
          )}
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {/* Pawns Warnings Table */}
        <PawnWarningsTable
          pawns={pawns}
          loading={loading}
          statusMap={statusMap}
          onViewDetail={handleViewDetail}
          onCustomerClick={handleCustomerClick}
          summary={summary}
        />
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex justify-center">
            <PawnWarningsPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>
      
      {/* Modals */}
      {selectedPawn && (
        <PawnHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={handleCloseHistoryModal}
          pawn={selectedPawn}
        />
      )}
      </>
      )}
    </Layout>
  );
} 