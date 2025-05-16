'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, UserPlus, AlertCircle } from 'lucide-react';
import { Store } from '@/models/store';
import { EmployeeFormData, EmployeeStatus } from '@/models/employee';
import { createEmployee } from '@/lib/employee';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmployeeForm } from '@/components/Employee';
import { Modal } from '@/components/ui';

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
      const { data: newEmployee, error } = await createEmployee(data);
      
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
