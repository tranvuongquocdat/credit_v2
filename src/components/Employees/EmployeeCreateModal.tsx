'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Store } from '@/models/store';
import { EmployeeFormData } from '@/models/employee';
import { createEmployee } from '@/lib/employee';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmployeeForm } from '@/components/Employee';

interface EmployeeCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  stores: Store[];
}

export function EmployeeCreateModal({
  isOpen,
  onClose,
  onSuccess,
  stores
}: EmployeeCreateModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Xử lý thêm nhân viên mới
  const handleAddEmployee = async (data: EmployeeFormData) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const { error } = await createEmployee(data);
      
      if (error) {
        const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
          ? String(error.message) 
          : 'Lỗi không xác định';
        throw new Error(errorMessage);
      }
      
      onClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo nhân viên mới');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Thêm nhân viên mới</DialogTitle>
        </DialogHeader>
        
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Lỗi</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="py-4">
          <EmployeeForm
            onSubmit={handleAddEmployee}
            isSubmitting={isSubmitting}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
