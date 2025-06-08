'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { PawnWarningsTable } from '@/components/Pawns/PawnWarningsTable';
import { PawnSearchFilters } from '@/components/Pawns/PawnSearchFilters';
import { PawnHistoryModal } from '@/components/Pawns/PawnHistoryModal';
import { useRouter } from 'next/navigation';
import { PawnWithCustomerAndCollateral, PawnStatus, PawnFilters } from '@/models/pawn';
import { getPawns } from '@/lib/pawn';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export default function PawnWarningsPage() {
  const router = useRouter();
  const { currentStore, loading: storeLoading } = useStore();
  
  // State for pawns data
  const [pawns, setPawns] = useState<PawnWithCustomerAndCollateral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for filters
  const [filters, setFilters] = useState<PawnFilters>({
    contract_code: '',
    customer_name: '',
    status: 'all',
    start_date: '',
    end_date: ''
  });
  
  // State for modals
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedPawn, setSelectedPawn] = useState<PawnWithCustomerAndCollateral | null>(null);
  
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
  const loadPawns = async (searchFilters: PawnFilters = filters) => {
    if (!currentStore?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Get all active pawns (not closed or deleted)
      const pawnFilters: PawnFilters = {
        contract_code: searchFilters.contract_code,
        customer_name: searchFilters.customer_name,
        store_id: currentStore.id,
        status: searchFilters.status === 'all' ? undefined : searchFilters.status as PawnStatus
      };
      
      const { data, error: pawnError } = await getPawns(
        1,
        1000, // Get all pawns
        pawnFilters
      );
      
      if (pawnError) throw pawnError;
      
      // Filter only active pawns that might have warnings
      const activePawns = (data || []).filter(pawn => 
        pawn.status !== PawnStatus.CLOSED && 
        pawn.status !== PawnStatus.DELETED
      );
      
      setPawns(activePawns);
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
      loadPawns(filters);
    }
  }, [currentStore?.id]);
  
  // Handle search
  const handleSearch = (searchFilters: PawnFilters) => {
    setFilters(searchFilters);
    loadPawns(searchFilters);
  };
  
  // Handle reset filters
  const handleResetFilters = () => {
    const emptyFilters: PawnFilters = {
      contract_code: '',
      customer_name: '',
      status: 'all',
      start_date: '',
      end_date: ''
    };
    setFilters(emptyFilters);
    loadPawns(emptyFilters);
  };

  // Handle view detail
  const handleViewDetail = (pawn: PawnWithCustomerAndCollateral) => {
    setSelectedPawn(pawn);
    setIsHistoryModalOpen(true);
  };

  // Handle customer click to navigate to pawns
  const handleCustomerClick = (pawn: PawnWithCustomerAndCollateral) => {
    router.push(`/pawns?contract=${pawn.contract_code}`);
  };

  // Handle close history modal
  const handleCloseHistoryModal = () => {
    setIsHistoryModalOpen(false);
    setSelectedPawn(null);
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
              <input
                type="text"
                placeholder="Tên khách hàng, VD: Tuấn"
                value={filters.customer_name}
                onChange={(e) => setFilters(prev => ({ ...prev, customer_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Trạng thái hợp đồng</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as PawnStatus | "all" }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tất cả</option>
                <option value="on_time">Đang cầm</option>
                <option value="overdue">Quá hạn</option>
                <option value="late_interest">Chậm lãi</option>
                <option value="bad_debt">Nợ xấu</option>
              </select>
            </div>
            
            <div className="flex items-end gap-2">
              <Button 
                onClick={() => handleSearch(filters)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Tìm kiếm
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
        />
      </div>
      
      {/* Modals */}
      {selectedPawn && (
        <PawnHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={handleCloseHistoryModal}
          pawn={selectedPawn}
        />
      )}
    </Layout>
  );
} 