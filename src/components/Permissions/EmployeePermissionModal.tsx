'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, AlertCircle, UserCog } from 'lucide-react';
import { EmployeeWithProfile } from '@/models/employee';
import { Permission, PermissionNode } from '@/models/permission';
import { 
  getPermissions, 
  getEmployeePermissions, 
  updateEmployeePermissions,
  buildPermissionTree,
  filterPermissions
} from '@/lib/permission';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TreeCheckbox } from '@/components/ui/tree-checkbox';
import { useToast } from '@/components/ui/use-toast';

interface EmployeePermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employee: EmployeeWithProfile | null;
  currentUserId: string;
}

export function EmployeePermissionModal({
  isOpen,
  onClose,
  onSuccess,
  employee,
  currentUserId
}: EmployeePermissionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [permissionTree, setPermissionTree] = useState<PermissionNode[]>([]);
  const [filteredTree, setFilteredTree] = useState<PermissionNode[]>([]);

  const { toast } = useToast();

  // Load permissions và employee permissions khi modal mở
  useEffect(() => {
    if (isOpen && employee) {
      loadData();
    }
  }, [isOpen, employee]);

  // Filter permissions khi search term thay đổi
  useEffect(() => {
    if (searchTerm.trim()) {
      setFilteredTree(filterPermissions(permissionTree, searchTerm));
    } else {
      setFilteredTree(permissionTree);
    }
  }, [searchTerm, permissionTree]);

  const loadData = async () => {
    if (!employee) return;

    setIsLoading(true);
    setError(null);

    try {
      // Load tất cả permissions
      const { data: permissions, error: permissionsError } = await getPermissions();
      if (permissionsError) throw new Error('Không thể tải danh sách quyền');

      // Load permissions của nhân viên
      const { data: employeePermissionIds, error: employeePermissionsError } = 
        await getEmployeePermissions(employee.uid);
      if (employeePermissionsError) throw new Error('Không thể tải quyền của nhân viên');

      setAllPermissions(permissions || []);
      setSelectedPermissionIds(employeePermissionIds || []);

      // Build permission tree
      const tree = buildPermissionTree(permissions || [], employeePermissionIds || []);
      setPermissionTree(tree);
      setFilteredTree(tree);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!employee) return;

    setIsSaving(true);
    setError(null);

    try {
      const { error } = await updateEmployeePermissions(
        employee.uid,
        selectedPermissionIds,
        currentUserId
      );

      if (error) {
        throw new Error('Không thể cập nhật quyền cho nhân viên');
      }

      toast({
        title: 'Thành công',
        description: 'Đã cập nhật quyền cho nhân viên',
      });

      onSuccess();
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectionChange = (newSelectedIds: string[]) => {
    setSelectedPermissionIds(newSelectedIds);
    
    // Rebuild tree với selection mới
    const newTree = buildPermissionTree(allPermissions, newSelectedIds);
    setPermissionTree(newTree);
    
    // Apply filter nếu có
    if (searchTerm.trim()) {
      setFilteredTree(filterPermissions(newTree, searchTerm));
    } else {
      setFilteredTree(newTree);
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Phân quyền cho nhân viên: {employee?.full_name}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Lỗi</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex-1 flex flex-col min-h-0">
          {/* Search Box */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Tìm kiếm quyền..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Permissions Tree */}
          <div className="flex-1 border rounded-lg p-4 overflow-auto min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Đang tải quyền...</span>
              </div>
            ) : filteredTree.length > 0 ? (
              <TreeCheckbox
                nodes={filteredTree}
                selectedIds={selectedPermissionIds}
                onSelectionChange={handleSelectionChange}
              />
            ) : (
              <div className="text-center py-8 text-gray-500">
                {searchTerm ? 'Không tìm thấy quyền nào phù hợp' : 'Không có quyền nào'}
              </div>
            )}
          </div>

          {/* Selected count */}
          <div className="mt-4 text-sm text-gray-600">
            Đã chọn: {selectedPermissionIds.length} quyền
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
          >
            Hủy
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Đang lưu...
              </>
            ) : (
              'Lưu thay đổi'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 