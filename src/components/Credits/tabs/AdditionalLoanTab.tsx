'use client';

import { useState } from 'react';
import { CreditWithCustomer, CreditStatus } from '@/models/credit';
import { AdditionalLoanForm } from '../AdditionalLoanForm';
import { AdditionalLoanList } from '../AdditionalLoanList';
import { toast } from '@/components/ui/use-toast';

interface AdditionalLoanTabProps {
  credit: CreditWithCustomer;
  onDataChange?: () => void;
}

export function AdditionalLoanTab({ credit, onDataChange }: AdditionalLoanTabProps) {
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
      <AdditionalLoanForm 
        creditId={credit?.id || ''}
        disabled={isClosed}
        onSubmit={async (data) => {
          try {
            if (!credit?.id || isSubmitting || isClosed) return;
            
            setIsSubmitting(true);
            
            // Import dynamically to prevent duplicate imports
            const { recordAdditionalLoan } = await import('@/lib/credit-amount-history');
            
            // Sử dụng API mới để ghi lại khoản vay thêm vào credit_amount_history
            const { data: historyData, error } = await recordAdditionalLoan(
              credit.id,
              data.amount,
              data.loanDate,
              data.notes
            );
            
            if (error) {
              throw error;
            }
            
            // Trigger refresh with new function
            refreshData();
            
            // Hiển thị thông báo thành công
            toast({
              title: "Thành công",
              description: "Đã cập nhật khoản vay thêm thành công",
            });
          } catch (err) {
            console.error('Error adding additional loan:', err);
            toast({
              variant: "destructive",
              title: "Lỗi",
              description: "Không thể thêm khoản vay thêm. Vui lòng thử lại sau."
            });
          } finally {
            setIsSubmitting(false);
          }
        }}
      />
      
      {/* Danh sách vay thêm */}
      {credit?.id && (
        <AdditionalLoanList
          creditId={credit.id}
          key={refreshTrigger} // Force re-render when refreshTrigger changes
          onDeleted={refreshData}
        />
      )}
    </div>
  );
}
