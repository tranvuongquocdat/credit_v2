'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, UserCog, AlertCircle } from 'lucide-react';
import { Store } from '@/models/store';
import { Employee, EmployeeFormData, EmployeeStatus, EmployeeWithAuth } from '@/models/employee';
import { updateEmployee } from '@/lib/employee';
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmployeeForm } from '@/components/Employee';

interface EmployeeEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employee: EmployeeWithAuth | null;
  stores: Store[];
}

export function EmployeeEditModal({
  isOpen,
  onClose,
  onSuccess,
  employee,
  stores
}: EmployeeEditModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Xử lý cập nhật nhân viên
  const handleUpdateEmployee = async (data: EmployeeFormData) => {
    if (!employee) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const { error } = await updateEmployee(employee.uid, data);
      
      if (error) {
        const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
          ? String(error.message) 
          : 'Lỗi không xác định';
        throw new Error(errorMessage);
      }
      
      onClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật nhân viên');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Sửa thông tin nhân viên</DialogTitle>
        </DialogHeader>
        
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Lỗi</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="py-4">
          {employee && (
            <EmployeeForm
              employee={employee}
              onSubmit={handleUpdateEmployee}
              isSubmitting={isSubmitting}
              isEditing={true}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
