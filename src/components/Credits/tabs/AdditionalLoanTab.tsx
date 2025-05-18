'use client';

import { CreditWithCustomer } from '@/models/credit';
import { AdditionalLoanForm } from '../AdditionalLoanForm';
import { AdditionalLoanList } from '../AdditionalLoanList';
import { addAdditionalLoan, updateCreditWithAdditionalLoan } from '@/lib/additional-loan';

interface AdditionalLoanTabProps {
  credit: CreditWithCustomer;
}

export function AdditionalLoanTab({ credit }: AdditionalLoanTabProps) {
  return (
    <div>
      <AdditionalLoanForm 
        onSubmit={async (data) => {
          try {
            if (!credit?.id) return;
            
            // Thêm khoản vay thêm
            await addAdditionalLoan({
              credit_id: credit.id,
              amount: data.amount,
              loan_date: data.loanDate,
              notes: data.notes
            });
            
            // Cập nhật số tiền gốc của hợp đồng
            await updateCreditWithAdditionalLoan(credit.id, data.amount);
            
            // Hiển thị thông báo thành công
            alert('Đã cập nhật khoản vay thêm thành công');
          } catch (err) {
            console.error('Error adding additional loan:', err);
            alert('Không thể thêm khoản vay thêm. Vui lòng thử lại sau.');
          }
        }}
      />
      
      {/* Danh sách vay thêm */}
      {credit?.id && (
        <AdditionalLoanList
          creditId={credit.id}
          onDeleted={() => {
            // TODO: Reload credit data after deletion
          }}
        />
      )}
    </div>
  );
}
