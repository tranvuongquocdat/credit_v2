'use client';

import { useState } from 'react';
import { CreditWithCustomer, CreditStatus } from '@/models/credit';
import { ExtensionForm } from '../ExtensionForm';
import { ExtensionList } from '../ExtensionList';
import { addExtension, updateCreditEndDate } from '@/lib/extension';
import { format } from 'date-fns';
import { toast } from '@/components/ui/use-toast';

interface ExtensionTabProps {
  credit: CreditWithCustomer;
  onDataChange?: () => void;
}

export function ExtensionTab({ credit, onDataChange }: ExtensionTabProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshData = () => {
    // Update refresh trigger
    setRefreshTrigger(prev => prev + 1);
    // Call parent's data change callback if provided
    if (onDataChange) {
      onDataChange();
    }
  };

  // Check if credit is closed
  const isClosed = credit?.status === CreditStatus.CLOSED;

  return (
    <div>
      <ExtensionForm
        customerName={credit?.customer?.name}
        disabled={isClosed}
        onSubmit={async (data) => {
          try {
            if (!credit?.id || isSubmitting || isClosed) return;
            
            setIsSubmitting(true);
            
            // Thêm khoản gia hạn
            const today = new Date();
            await addExtension({
              credit_id: credit.id,
              days: data.days,
              from_date: format(today, 'yyyy-MM-dd'),
              notes: data.notes
            });
            
            // Refresh danh sách
            refreshData();
            
            // Hiển thị thông báo thành công
            toast({
              title: "Thành công",
              description: "Đã gia hạn hợp đồng thành công",
            });
          } catch (err) {
            console.error('Error adding extension:', err);
            toast({
              variant: "destructive",
              title: "Lỗi",
              description: "Không thể gia hạn hợp đồng. Vui lòng thử lại sau."
            });
          } finally {
            setIsSubmitting(false);
          }
        }}
      />
      
      {/* Danh sách gia hạn */}
      {credit?.id && (
        <ExtensionList
          creditId={credit.id}
          key={refreshTrigger} // Force re-render when refreshTrigger changes
          onDeleted={refreshData}
        />
      )}
    </div>
  );
}
