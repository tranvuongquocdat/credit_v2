'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function DeletePasswordChangeDialog({ isOpen, onClose }: Props) {
  const [oldPwd, setOld] = useState('');
  const [newPwd, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConf, setShowConf] = useState(false);

  const disabled = !oldPwd || !newPwd || newPwd !== confirm;

  const handleSave = async () => {
    setLoading(true);
    const resp = await fetch('/api/delete-password/change', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
    });
    const res = await resp.json();
    setLoading(false);

    if (!resp.ok) {
      toast({ title: 'Lỗi', description: res.error, variant: 'destructive' });
      return;
    }

    toast({ title: 'Thành công', description: 'Đã đổi mật khẩu xoá' });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Đổi mật khẩu xoá</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Input type={showOld ? 'text' : 'password'} placeholder="Mật khẩu cũ" value={oldPwd} onChange={(e) => setOld(e.target.value)} className="pr-10" />
            <button type="button" className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500" onClick={() => setShowOld(p=>!p)}>
              {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <Input type={showNew ? 'text' : 'password'} placeholder="Mật khẩu mới" value={newPwd} onChange={(e) => setNew(e.target.value)} className="pr-10" />
            <button type="button" className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500" onClick={() => setShowNew(p=>!p)}>
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <Input type={showConf ? 'text' : 'password'} placeholder="Xác nhận mật khẩu mới" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="pr-10" />
            <button type="button" className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500" onClick={() => setShowConf(p=>!p)}>
              {showConf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button disabled={disabled || isLoading} onClick={handleSave}>
            {isLoading ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 