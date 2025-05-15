'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Customer } from '@/models/customer';
import { deleteCustomer } from '@/lib/customer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CustomerDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customer: Customer | null;
}

export function CustomerDeleteDialog({
  isOpen,
  onClose,
  onSuccess,
  customer
}: CustomerDeleteDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!customer) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const { success, error } = await deleteCustomer(customer.id);
      
      if (error) throw error;
      
      if (!success) {
        throw new Error('Không thể xóa khách hàng vì đã có hợp đồng liên quan');
      }
      
      onSuccess();
    } catch (err: any) {
      console.error('Error deleting customer:', err);
      setError(err.message || 'Có lỗi xảy ra khi xóa khách hàng. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle>
          <AlertDialogDescription>
            Hành động này không thể hoàn tác. Khách hàng {customer?.name} sẽ bị xóa vĩnh viễn khỏi hệ thống.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        {error && (
          <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
            <p className="font-bold">Lỗi</p>
            <p>{error}</p>
          </div>
        )}
        
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Hủy</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDelete}
            disabled={isSubmitting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            Xóa
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}