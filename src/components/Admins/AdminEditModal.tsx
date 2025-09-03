import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateAdmin } from '@/lib/admin';
import { AdminWithProfile, AdminStatus } from '@/models/admin';
import { toast } from '@/components/ui/use-toast';

interface AdminEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  admin: AdminWithProfile | null;
}

export function AdminEditModal({ isOpen, onClose, onSuccess, admin }: AdminEditModalProps) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    status: AdminStatus.ACTIVE,
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (admin) {
      setFormData({
        username: admin.username || '',
        email: admin.email || '',
        status: admin.status,
        password: '',
      });
    }
  }, [admin]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!admin || !formData.username.trim()) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập đầy đủ thông tin bắt buộc',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const { data, error } = await updateAdmin(admin.id, {
        username: formData.username.trim(),
        email: formData.email?.trim() || undefined,
        status: formData.status,
        password: formData.password?.trim() || undefined,
      });

      if (error) {
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể cập nhật admin',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Thành công',
        description: 'Đã cập nhật thông tin admin thành công',
      });

      onSuccess();
      onClose();
    } catch (err) {
      toast({
        title: 'Lỗi',
        description: 'Đã xảy ra lỗi khi cập nhật admin',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa Admin</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Tên đăng nhập *</Label>
            <Input
              id="username"
              value={formData.username || ''}
              onChange={(e) => handleInputChange('username', e.target.value)}
              placeholder="Nhập tên đăng nhập"
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              placeholder="Để trống nếu không thay đổi"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Tên</Label>
            <Input
              id="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Nhập email"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? 'Đang cập nhật...' : 'Cập nhật'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 