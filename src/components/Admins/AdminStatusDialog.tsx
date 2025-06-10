import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { activateAdmin, deactivateAdmin } from '@/lib/admin';
import { AdminWithProfile, AdminStatus } from '@/models/admin';
import { toast } from '@/components/ui/use-toast';

interface AdminStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  admin: AdminWithProfile | null;
}

export function AdminStatusDialog({ isOpen, onClose, onSuccess, admin }: AdminStatusDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  if (!admin) return null;

  const isActive = admin.status === AdminStatus.ACTIVE;
  const action = isActive ? 'vô hiệu hóa' : 'kích hoạt';
  const actionTitle = isActive ? 'Vô hiệu hóa Admin' : 'Kích hoạt Admin';

  const handleConfirm = async () => {
    setIsLoading(true);
    
    try {
      const { data, error } = isActive 
        ? await deactivateAdmin(admin.id)
        : await activateAdmin(admin.id);

      if (error) {
        toast({
          title: 'Lỗi',
          description: error.message || `Không thể ${action} admin`,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Thành công',
        description: isActive 
          ? `Đã vô hiệu hóa admin và tất cả nhân viên trong các cửa hàng của admin này`
          : `Đã kích hoạt admin và tất cả nhân viên bị vô hiệu hóa bởi superadmin trong các cửa hàng của admin này`,
      });

      onSuccess();
      onClose();
    } catch (err) {
      toast({
        title: 'Lỗi',
        description: `Đã xảy ra lỗi khi ${action} admin`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{actionTitle}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Bạn có chắc chắn muốn {action} admin <strong>{admin.full_name || admin.username}</strong>?
            </p>
            
            {isActive ? (
              <div className="bg-red-50 p-3 rounded-md border border-red-200">
                <p className="text-red-800 font-medium text-sm mb-2">⚠️ Cảnh báo:</p>
                <ul className="text-red-700 text-sm space-y-1">
                  <li>• Admin này sẽ không thể đăng nhập vào hệ thống</li>
                  <li>• <strong>Tất cả nhân viên</strong> trong các cửa hàng do admin này tạo sẽ bị vô hiệu hóa</li>
                  <li>• Các nhân viên đã bị vô hiệu hóa trước đó sẽ không bị ảnh hưởng</li>
                </ul>
              </div>
            ) : (
              <div className="bg-green-50 p-3 rounded-md border border-green-200">
                <p className="text-green-800 font-medium text-sm mb-2">✅ Kích hoạt lại:</p>
                <ul className="text-green-700 text-sm space-y-1">
                  <li>• Admin này sẽ có thể đăng nhập lại</li>
                  <li>• <strong>Chỉ những nhân viên</strong> bị vô hiệu hóa bởi superadmin sẽ được kích hoạt lại</li>
                  <li>• Nhân viên bị vô hiệu hóa bởi admin vẫn giữ nguyên trạng thái</li>
                </ul>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            Hủy
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
          >
            {isLoading ? `Đang ${action}...` : `${action.charAt(0).toUpperCase() + action.slice(1)}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 