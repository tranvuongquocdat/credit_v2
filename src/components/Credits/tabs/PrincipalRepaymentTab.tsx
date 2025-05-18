'use client';

import { CreditWithCustomer } from '@/models/credit';
import { PrincipalRepaymentForm } from '../PrincipalRepaymentForm';
import { PrincipalRepaymentList } from '../PrincipalRepaymentList';
import { addPrincipalRepayment, updateCreditPrincipal } from '@/lib/principal-repayment';

interface PrincipalRepaymentTabProps {
  credit: CreditWithCustomer;
  refreshRepayments: number;
  setRefreshRepayments: (value: React.SetStateAction<number>) => void;
}

export function PrincipalRepaymentTab({
  credit,
  refreshRepayments,
  setRefreshRepayments
}: PrincipalRepaymentTabProps) {
  return (
    <div>
      <PrincipalRepaymentForm 
        onSubmit={async (data) => {
          try {
            if (!credit?.id) return;
            
            // Thêm khoản trả bớt gốc
            await addPrincipalRepayment({
              credit_id: credit.id,
              amount: data.amount,
              repayment_date: data.repaymentDate,
              notes: data.notes
            });
            
            // Cập nhật số tiền gốc còn lại của hợp đồng
            await updateCreditPrincipal(credit.id, data.amount);
            
            // Refresh danh sách
            setRefreshRepayments(prev => prev + 1);
            
            // Hiển thị thông báo thành công
            alert('Đã cập nhật khoản trả bớt gốc thành công');
          } catch (err) {
            console.error('Error adding principal repayment:', err);
            alert('Không thể thêm khoản trả bớt gốc. Vui lòng thử lại sau.');
          }
        }}  
      />
      <PrincipalRepaymentList 
        creditId={credit.id} 
        onDeleted={() => setRefreshRepayments(prev => prev + 1)} 
      />
    </div>
  );
}
