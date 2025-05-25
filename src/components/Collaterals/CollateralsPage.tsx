'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Plus, Search } from 'lucide-react';
import { CollateralsTable } from './CollateralsTable';
import { CollateralForm } from './CollateralForm';
import { CollateralWithStore, Collateral, CollateralCategory, CollateralStatus } from '@/models/collateral';
import { getCollaterals, deleteCollateral, getCollateralById } from '@/lib/collateral';
import { useToast } from '@/components/ui/use-toast';

interface CollateralsPageProps {
  storeId: string;
}

export function CollateralsPage({ storeId }: CollateralsPageProps) {
  const { toast } = useToast();
  
  // State
  const [collaterals, setCollaterals] = useState<CollateralWithStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingCollateral, setEditingCollateral] = useState<Collateral | null>(null);
  
  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingCollateral, setDeletingCollateral] = useState<CollateralWithStore | null>(null);

  // Load collaterals
  const loadCollaterals = async () => {
    setLoading(true);
    try {
      const filters: any = { storeId };
      
      if (categoryFilter !== 'all') {
        filters.category = categoryFilter;
      }
      
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }

      const { data, error } = await getCollaterals(filters);
      
      if (error) {
        toast({
          title: "Lỗi",
          description: "Không thể tải danh sách tài sản thế chấp",
          variant: "destructive"
        });
        return;
      }

      setCollaterals(data || []);
    } catch (error) {
      console.error('Error loading collaterals:', error);
      toast({
        title: "Lỗi",
        description: "Có lỗi xảy ra khi tải dữ liệu",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount and when filters change
  useEffect(() => {
    loadCollaterals();
  }, [storeId, categoryFilter, statusFilter]);

  // Filter collaterals by search term
  const filteredCollaterals = collaterals.filter(collateral => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      collateral.name.toLowerCase().includes(searchLower) ||
      collateral.code.toLowerCase().includes(searchLower) ||
      (collateral.attr_01 && collateral.attr_01.toLowerCase().includes(searchLower)) ||
      (collateral.attr_02 && collateral.attr_02.toLowerCase().includes(searchLower)) ||
      (collateral.attr_03 && collateral.attr_03.toLowerCase().includes(searchLower))
    );
  });

  // Handle add new
  const handleAdd = () => {
    setEditingCollateral(null);
    setShowForm(true);
  };

  // Handle edit
  const handleEdit = async (id: string) => {
    try {
      const { data, error } = await getCollateralById(id);
      
      if (error || !data) {
        toast({
          title: "Lỗi",
          description: "Không thể tải thông tin tài sản thế chấp",
          variant: "destructive"
        });
        return;
      }

      setEditingCollateral(data);
      setShowForm(true);
    } catch (error) {
      console.error('Error loading collateral for edit:', error);
      toast({
        title: "Lỗi",
        description: "Có lỗi xảy ra khi tải dữ liệu",
        variant: "destructive"
      });
    }
  };

  // Handle delete
  const handleDelete = (collateral: CollateralWithStore) => {
    setDeletingCollateral(collateral);
    setShowDeleteDialog(true);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!deletingCollateral) return;

    try {
      const { error } = await deleteCollateral(deletingCollateral.id);
      
      if (error) {
        toast({
          title: "Lỗi",
          description: "Không thể xóa tài sản thế chấp",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Thành công",
        description: "Đã xóa tài sản thế chấp"
      });

      loadCollaterals();
    } catch (error) {
      console.error('Error deleting collateral:', error);
      toast({
        title: "Lỗi",
        description: "Có lỗi xảy ra khi xóa dữ liệu",
        variant: "destructive"
      });
    } finally {
      setShowDeleteDialog(false);
      setDeletingCollateral(null);
    }
  };

  // Handle form success
  const handleFormSuccess = () => {
    loadCollaterals();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Quản lý tài sản thế chấp</h1>
        <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Thêm mới
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-lg border">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Tìm kiếm theo tên, mã, thuộc tính..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="min-w-[150px]">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Lĩnh vực" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value={CollateralCategory.PAWN}>Cầm đồ</SelectItem>
              <SelectItem value={CollateralCategory.UNSECURED}>Tín chấp</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="min-w-[150px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value={CollateralStatus.ACTIVE}>Hoạt động</SelectItem>
              <SelectItem value={CollateralStatus.INACTIVE}>Không hoạt động</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search Button */}
        <Button variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
          Tìm kiếm
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
        </div>
      ) : (
        <CollateralsTable
          collaterals={filteredCollaterals}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Form Dialog */}
      <CollateralForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        collateral={editingCollateral}
        storeId={storeId}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa</DialogTitle>
          </DialogHeader>
          <div>
            Bạn có chắc chắn muốn xóa tài sản thế chấp "{deletingCollateral?.name}" không? 
            Hành động này không thể hoàn tác.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 