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
import { deleteAdmin } from '@/lib/admin';
import { AdminWithProfile } from '@/models/admin';
import { toast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';

interface AdminDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  admin: AdminWithProfile | null;
}

export function AdminDeleteDialog({ isOpen, onClose, onSuccess, admin }: AdminDeleteDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  if (!admin) return null;

  const handleConfirm = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      // Verify delete password first
      const resp = await fetch('/api/delete-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const verifyRes = await resp.json();
      if (!resp.ok) {
        const msg = verifyRes.error || 'Xác thực thất bại';
        toast({ title: 'Lỗi', description: msg, variant: 'destructive' });
        setErrorMsg(msg);
        setIsLoading(false);
        return;
      }

      const { error } = await deleteAdmin(admin.id);
      if (error) {
        const msg = error.message || 'Không thể xóa admin';
        toast({ title: 'Lỗi', description: msg, variant: 'destructive' });
        setErrorMsg(msg);
        setIsLoading(false);
        return;
      }

      toast({ title: 'Thành công', description: 'Đã xóa admin thành công' });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Đã xảy ra lỗi');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa Admin</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Bạn có chắc chắn muốn xóa admin <strong>{admin.full_name || admin.username}</strong>?
            </p>
            
            <div className="bg-red-50 p-3 rounded-md border border-red-200">
              <p className="text-red-800 font-medium text-sm mb-2">⚠️ Cảnh báo:</p>
              <ul className="text-red-700 text-sm space-y-1">
                <li>• Admin này sẽ bị xóa vĩnh viễn khỏi hệ thống</li>
                <li>• <strong>Tất cả cửa hàng</strong> do admin này tạo sẽ bị xóa</li>
                <li>• <strong>Tất cả nhân viên</strong> trong các cửa hàng đó sẽ bị xóa</li>
                <li>• <strong>Không thể khôi phục</strong> sau khi xóa</li>
              </ul>
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="del-pass">Mật khẩu xoá</Label>
              <div className="relative">
                <Input
                  id="del-pass"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"
                  onClick={() => setShowPwd((p) => !p)}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {errorMsg && <p className="text-sm text-red-600 mt-2">{errorMsg}</p>}
            {isLoading && (
              <div className="flex justify-center py-4">
                <RefreshCw className="animate-spin h-5 w-5 text-gray-500" />
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
            disabled={isLoading || !password}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? 'Đang xóa...' : 'Xóa'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 