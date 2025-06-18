import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { deactivateAdmin } from '@/lib/admin';
import { AdminWithProfile, AdminStatus } from '@/models/admin';
import { toast } from '@/components/ui/use-toast';

interface BulkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  admins: AdminWithProfile[]; // list from page state
  onSuccess: () => void; // reload callback
}

export function AdminBulkDeactivateDialog({ isOpen, onClose, admins, onSuccess }: BulkDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const activeAdmins = admins.filter(a => a.status === AdminStatus.ACTIVE);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await Promise.all(activeAdmins.map(a => deactivateAdmin(a.id).then(res => {
        if (res.error) throw new Error(res.error.message);
      })));

      toast({
        title: 'Thành công',
        description: `Đã vô hiệu hóa ${activeAdmins.length} admin đang hoạt động`,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: 'Lỗi', description: err.message || 'Không thể vô hiệu hóa toàn bộ', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Vô hiệu hóa tất cả Admin?</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="space-y-3 text-sm">
              <p>Bạn sắp vô hiệu hóa <strong>{activeAdmins.length}</strong> admin đang hoạt động.</p>
              <p className="text-red-600">• Tất cả admin đó sẽ không thể đăng nhập.</p>
              <p className="text-red-600">• Mọi nhân viên dưới quyền của họ cũng sẽ bị vô hiệu hóa.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Hủy</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isLoading} className="bg-red-600 hover:bg-red-700">
            {isLoading ? 'Đang xử lý...' : 'Xác nhận'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 