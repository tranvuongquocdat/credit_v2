'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { PawnWarningsTable } from '@/components/Pawns/PawnWarningsTable';
import { PawnHistoryModal } from '@/components/Pawns/PawnHistoryModal';
import { useRouter } from 'next/navigation';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { getPawnWarnings, PawnReasonFilter, categorizePawnReason } from '@/lib/pawn-warnings';
import { Button } from '@/components/ui/button';
import { Download, Search } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { usePermissions } from "@/hooks/usePermissions";
import { useDebounce } from '@/hooks/useDebounce';  
import { usePawnCalculations } from "@/hooks/usePawnCalculation";

export default function PawnWarningsPage() {
  const router = useRouter();
  const { currentStore, loading: storeLoading } = useStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Kiểm tra quyền xem danh sách hợp đồng trả góp
  const canViewPawnWarnings = hasPermission('xem_danh_sach_hop_dong_tra_gop');
  
  // State for pawns data
  const [allPawns, setAllPawns] = useState<PawnWithCustomerAndCollateral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;
  
  // State for filters
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const debouncedCustomerFilter = useDebounce(customerNameFilter, 500);
  const [contractCodeFilter, setContractCodeFilter] = useState("");
  const debouncedContractFilter = useDebounce(contractCodeFilter, 500);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const debouncedEmployeeFilter = useDebounce(employeeFilter, 500);
  const [reasonFilter, setReasonFilter] = useState<PawnReasonFilter | "all">("all");
  
  
  // Get pawn calculations for interest calculation
  const { details: pawnCalculations } = usePawnCalculations();
  
  // State for modals
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedPawn, setSelectedPawn] = useState<PawnWithCustomerAndCollateral | null>(null);
  
  
  // Load pawns data when the page loads, store changes, or filter changes
  useEffect(() => {
    if (currentStore?.id) {
      loadPawns();
    }
  }, [currentStore, debouncedCustomerFilter, debouncedContractFilter, debouncedEmployeeFilter]);
  
  
  // Load pawns with warnings
  const loadPawns = async () => {
    if (!currentStore?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: warningsError } = await getPawnWarnings(
        1,
        1000, // Fetch all for client-side filtering
        currentStore.id,
        debouncedCustomerFilter,
      );
      
      if (warningsError) {
        throw warningsError;
      }
      
      setAllPawns(data || []);
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
  

  // Client-side filtering and pagination
  const filteredResults = reasonFilter === "all" 
    ? allPawns.filter(pawn => {
        const reasonCategories = categorizePawnReason(pawn.reason || '');
        return !reasonCategories.includes("tomorrow_due");
      })
    : allPawns.filter(pawn => {
        const reasonCategories = categorizePawnReason(pawn.reason || '');
        return reasonCategories.includes(reasonFilter);
      });
  
  const finalFiltered = filteredResults.filter(pawn => {
    const customerMatch = !debouncedCustomerFilter || 
      pawn.customer?.name?.toLowerCase().includes(debouncedCustomerFilter.toLowerCase());
    
    const contractMatch = !debouncedContractFilter || 
      pawn.contract_code?.toLowerCase().includes(debouncedContractFilter.toLowerCase());
    
    return customerMatch && contractMatch;
  });
  
  // Pagination
  const totalFilteredItems = finalFiltered.length;
  const totalFilteredPages = Math.ceil(totalFilteredItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPawns = finalFiltered.slice(startIndex, endIndex);
  
  // Update pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedCustomerFilter, debouncedContractFilter, debouncedEmployeeFilter, reasonFilter]);
  
  // Update totals when filtered results change
  useEffect(() => {
    setTotalItems(totalFilteredItems);
    setTotalPages(totalFilteredPages);
  }, [totalFilteredItems, totalFilteredPages]);
  
  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // Handle filter changes
  const handleCustomerFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerNameFilter(e.target.value);
  };
  
  // const handleContractFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   setContractCodeFilter(e.target.value);
  // };
  
  // const handleEmployeeFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   setEmployeeFilter(e.target.value);
  // };
  
  const handleReasonFilterChange = (value: string) => {
    setReasonFilter(value as PawnReasonFilter | "all");
  };
  
  // Handle clear filters
  const handleClearFilters = () => {
    setCustomerNameFilter("");
    setContractCodeFilter("");
    setReasonFilter("all");
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
        <div className="mb-4 py-4 bg-gray-50 rounded-lg">
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

            {/* <div>
              <label className="block text-sm font-medium mb-1">Mã hợp đồng</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  type="text"
                  placeholder="Mã hợp đồng, VD: CD001"
                  value={contractCodeFilter}
                  onChange={handleContractFilterChange}
                  className="pl-10 w-full"
                />
              </div>
            </div> */}

            {/* <div>
              <label className="block text-sm font-medium mb-1">Nhân viên</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  type="text"
                  placeholder="Tên nhân viên, VD: An"
                  value={employeeFilter}
                  onChange={handleEmployeeFilterChange}
                  className="pl-10 w-full"
                />
              </div>
            </div> */}

            <div>
              <label className="block text-sm font-medium mb-1">Lý do</label>
              <Select value={reasonFilter} onValueChange={handleReasonFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn lý do" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="today_due">Hôm nay phải đóng</SelectItem>
                  <SelectItem value="tomorrow_due">Ngày mai đóng</SelectItem>
                  <SelectItem value="late">Chậm lãi</SelectItem>
                  <SelectItem value="overdue">Quá hạn</SelectItem>
                  <SelectItem value="end_today">Kết thúc hôm nay</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex items-end gap-2">
            <Button 
              onClick={handleClearFilters}
              variant="outline"
              disabled={!customerNameFilter && !contractCodeFilter && !employeeFilter && reasonFilter === "all"}
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
          
          {/* Show filter info if active */}
          {(customerNameFilter || contractCodeFilter || employeeFilter || reasonFilter !== "all") && (
            <div className="mt-2 text-sm text-blue-600">
              {customerNameFilter && (
                <span>Đang lọc theo tên khách hàng: <span className="font-semibold">{customerNameFilter}</span> </span>
              )}
              {contractCodeFilter && (
                <span>Đang lọc theo mã hợp đồng: <span className="font-semibold">{contractCodeFilter}</span> </span>
              )}
              {employeeFilter && (
                <span>Đang lọc theo nhân viên: <span className="font-semibold">{employeeFilter}</span> </span>
              )}
              {reasonFilter !== "all" && (
                <span>Đang lọc theo lý do: <span className="font-semibold">{reasonFilter}</span> </span>
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
          pawns={paginatedPawns}
          isLoading={loading}
          onViewDetail={handleViewDetail}
          onCustomerClick={handleCustomerClick}
          pawnCalculations={pawnCalculations}
        />
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex justify-center">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                Trước
              </Button>
              <span className="text-sm text-gray-600">
                Trang {currentPage} / {totalPages} ({totalItems} kết quả)
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Tiếp
              </Button>
            </div>
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