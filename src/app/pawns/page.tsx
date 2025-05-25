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
import { useRouter } from 'next/navigation';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { getPawns } from '@/lib/pawn';
import { Button } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface PawnFilters {
  contract_code: string;
  customer_name: string;
  status: string;
  start_date: string;
  end_date: string;
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
    status: '',
    start_date: '',
    end_date: ''
  });
  
  // State for modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedPawnId, setSelectedPawnId] = useState<string>('');
  const [selectedPawn, setSelectedPawn] = useState<PawnWithCustomerAndCollateral | null>(null);
  
  // Status mapping for display
  const statusMap = {
    [PawnStatus.ON_TIME]: { label: 'Đang vay', color: 'bg-green-100 text-green-800' },
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
      
      const { data, error: pawnError, total } = await getPawns(
        page,
        itemsPerPage,
        searchQuery,
        currentStore.id,
        searchFilters.status
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
      status: '',
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
  };

  // Handle view detail
  const handleViewDetail = (pawn: PawnWithCustomerAndCollateral) => {
    setSelectedPawn(pawn);
    setIsHistoryModalOpen(true);
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
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý cầm đồ</h1>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleExportExcel} 
              variant="outline"
              className="border-green-600 text-green-600 hover:bg-green-50"
            >
              <Download className="h-4 w-4 mr-1" /> Xuất Excel
            </Button>
            <Button onClick={handleOpenCreateModal} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-1" /> Hợp đồng mới
            </Button>
          </div>
        </div>
        
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
    </Layout>
  );
} 