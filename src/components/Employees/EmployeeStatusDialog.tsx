'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, UserX, UserCheck } from 'lucide-react';
import { Employee, EmployeeStatus, EmployeeWithAuth } from '@/models/employee';
import { activateEmployee, deactivateEmployee } from '@/lib/employee';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EmployeeStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employee: EmployeeWithAuth | null;
}

export function EmployeeStatusDialog({
  isOpen,
  onClose,
  onSuccess,
  employee
}: EmployeeStatusDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Xử lý thay đổi trạng thái nhân viên
  const handleChangeStatus = async () => {
    if (!employee) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const isActivating = employee.status === EmployeeStatus.INACTIVE;
      const { error } = isActivating 
        ? await activateEmployee(employee.uid)
        : await deactivateEmployee(employee.uid);
      
      if (error) {
        const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
          ? String(error.message) 
          : 'Lỗi không xác định';
        throw new Error(errorMessage);
      }
      
      onClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể thay đổi trạng thái nhân viên');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Không hiển thị gì nếu không có nhân viên được chọn
  if (!employee) return null;

  const isDeactivating = employee.status === EmployeeStatus.WORKING;
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isDeactivating ? 'Xác nhận vô hiệu hóa' : 'Xác nhận kích hoạt'}
          </DialogTitle>
        </DialogHeader>
        
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Lỗi</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="py-4">
          {isDeactivating ? (
            <div className="space-y-4">
              <p>Bạn có chắc chắn muốn vô hiệu hóa tài khoản của nhân viên <strong>{employee.full_name}</strong>?</p>
              <p className="text-sm text-muted-foreground">Nhân viên này sẽ không thể đăng nhập vào hệ thống sau khi bị vô hiệu hóa.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p>Bạn có chắc chắn muốn kích hoạt lại tài khoản của nhân viên <strong>{employee.full_name}</strong>?</p>
              <p className="text-sm text-muted-foreground">Nhân viên này sẽ có thể đăng nhập vào hệ thống sau khi được kích hoạt.</p>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button 
            onClick={handleChangeStatus}
            disabled={isSubmitting}
            className={isDeactivating ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}
          >
            {isSubmitting ? 'Đang xử lý...' : isDeactivating ? 'Vô hiệu hóa' : 'Kích hoạt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
