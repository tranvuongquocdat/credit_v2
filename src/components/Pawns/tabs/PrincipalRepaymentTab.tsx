'use client';

import { useState } from 'react';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { PrincipalRepaymentForm } from '../PrincipalRepaymentForm';
import { PrincipalRepaymentList } from '../PrincipalRepaymentList';
import { toast } from '@/components/ui/use-toast';
import { getPawnStatus } from '@/lib/pawn';

interface PrincipalRepaymentTabProps {
  pawn: PawnWithCustomerAndCollateral;
  refreshRepayments: number;
  setRefreshRepayments: (value: React.SetStateAction<number>) => void;
  onDataChange?: () => void;
}

export function PrincipalRepaymentTab({
  pawn,
  refreshRepayments,
  setRefreshRepayments,
  onDataChange
}: PrincipalRepaymentTabProps) {
  const [localRefreshTrigger, setLocalRefreshTrigger] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Check if pawn is closed or deleted
  const isClosed = pawn?.status === PawnStatus.CLOSED || pawn?.status === PawnStatus.DELETED;

  const refreshData = () => {
    // Update both the parent counter and local counter
    setRefreshRepayments(prev => prev + 1);
    setLocalRefreshTrigger(prev => prev + 1);

    // Call the onDataChange callback if provided
    if (onDataChange) {
      onDataChange();
    }
  };

  return (
    <div>
      <PrincipalRepaymentForm 
        pawnId={pawn?.id || ''}
        disabled={isClosed}
        onSubmit={async (data) => {
          try {
            const status = await getPawnStatus(pawn.id);
            if (status === PawnStatus.CLOSED) {
              toast({
                variant: "destructive",
                title: "Lỗi",
                description: "Hợp đồng đã đóng"
              });
              return;
            } else if (status === PawnStatus.DELETED) {
              toast({
                variant: "destructive",
                title: "Lỗi",
                description: "Hợp đồng đã bị xóa"
              });
              return;
            }
            if (!pawn?.id || isSubmitting || isClosed) return;
            
            setIsSubmitting(true);
            
            // Import dynamically to prevent duplicate imports
            const { recordPrincipalRepayment } = await import('@/lib/pawn-amount-history');
            
            // Sử dụng API mới để ghi lại khoản trả bớt gốc vào pawn_history
            const { data: historyData, error } = await recordPrincipalRepayment(
              pawn.id,
              data.amount,
              data.repaymentDate,
              data.notes
            );
            
            if (error) {
              throw error;
            }
            
            // Refresh danh sách
            refreshData();
            
            // Hiển thị thông báo thành công
            toast({
              title: "Thành công",
              description: "Đã cập nhật khoản trả bớt gốc thành công",
            });
          } catch (err) {
            console.error('Error adding principal repayment:', err);
            toast({
              variant: "destructive",
              title: "Lỗi",
              description: "Không thể thêm khoản trả bớt gốc. Vui lòng thử lại sau."
            });
          } finally {
            setIsSubmitting(false);
          }
        }}  
      />
      <PrincipalRepaymentList 
        pawnId={pawn.id} 
        key={localRefreshTrigger} // Force re-render when refreshTrigger changes
        onDeleted={refreshData}
      />
    </div>
  );
} 