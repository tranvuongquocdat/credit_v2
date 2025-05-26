'use client';

import { useState } from 'react';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { AdditionalLoanForm } from '../AdditionalLoanForm';
import { AdditionalLoanList } from '../AdditionalLoanList';
import { toast } from '@/components/ui/use-toast';

interface AdditionalLoanTabProps {
  pawn: PawnWithCustomerAndCollateral;
  onDataChange?: () => void;
}

export function AdditionalLoanTab({ pawn, onDataChange }: AdditionalLoanTabProps) {
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

  return (
    <div>
      <AdditionalLoanForm 
        pawnId={pawn?.id || ''}
        onSubmit={async (data) => {
          try {
            if (!pawn?.id || isSubmitting) return;
            
            setIsSubmitting(true);
            
            // Import dynamically to prevent duplicate imports
            const { recordAdditionalLoan } = await import('@/lib/pawn-amount-history');
            
            // Sử dụng API mới để ghi lại khoản vay thêm vào pawn_amount_history
            const { data: historyData, error } = await recordAdditionalLoan(
              pawn.id,
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
      {pawn?.id && (
        <AdditionalLoanList
          pawnId={pawn.id}
          key={refreshTrigger} // Force re-render when refreshTrigger changes
          onDeleted={refreshData}
        />
      )}
    </div>
  );
} 