'use client';

import { CreditWithCustomer } from '@/models/credit';
import { ExtensionForm } from '../ExtensionForm';
import { ExtensionList } from '../ExtensionList';
import { addExtension, updateCreditEndDate } from '@/lib/extension';
import { format } from 'date-fns';

interface ExtensionTabProps {
  credit: CreditWithCustomer;
}

export function ExtensionTab({ credit }: ExtensionTabProps) {
  return (
    <div>
      <ExtensionForm
        customerName={credit?.customer?.name}
        onSubmit={async (data) => {
          try {
            if (!credit?.id) return;
            
            // Thêm khoản gia hạn
            const today = new Date();
            await addExtension({
              credit_id: credit.id,
              days: data.days,
              extension_date: format(today, 'yyyy-MM-dd'),
              notes: data.notes
            });
            
            // Cập nhật ngày đáo hạn của hợp đồng
            await updateCreditEndDate(credit.id, data.days);
            
            // Hiển thị thông báo thành công
            alert('Đã gia hạn hợp đồng thành công');
          } catch (err) {
            console.error('Error adding extension:', err);
            alert('Không thể gia hạn hợp đồng. Vui lòng thử lại sau.');
          }
        }}
      />
      
      {/* Danh sách gia hạn */}
      {credit?.id && (
        <ExtensionList
          creditId={credit.id}
          onDeleted={() => {
            // TODO: Reload credit data after deletion
          }}
        />
      )}
    </div>
  );
}
