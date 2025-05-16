'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { getInstallmentById } from '@/lib/installment';
import { InstallmentStatus, InstallmentWithCustomer } from '@/models/installment';

// Import component từ Credits để đảm bảo nhất quán UI
import { CreditActionTabs, TabId } from '@/components/Credits/CreditActionTabs';

// Import các tab components
import { CustomerInfoTab } from './tabs/CustomerInfoTab';
import { PaymentScheduleTab } from './tabs/PaymentScheduleTab';
import { PaymentHistoryTab } from './tabs/PaymentHistoryTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { PaymentDueTab } from './tabs/PaymentDueTab';

interface InstallmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  installmentId: string;
}

// Các tab cho hợp đồng trả góp, dùng cấu trúc giống Credits
const INSTALLMENT_TABS = [
  { id: 'info', label: 'Thông tin khách hàng' },
  { id: 'schedule', label: 'Lịch trả góp' },
  { id: 'payments', label: 'Lịch sử thanh toán' },
  { id: 'payment_due', label: 'Lịch đóng tiền' },
  { id: 'documents', label: 'Chứng từ' },
];

export function InstallmentDetailModal({
  isOpen,
  onClose,
  installmentId,
}: InstallmentDetailModalProps) {
  const [installment, setInstallment] = useState<InstallmentWithCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('info');

  // Fetch installment data
  useEffect(() => {
    if (!installmentId || !isOpen) return;

    async function fetchInstallmentData() {
      setIsLoading(true);
      setError(null);

      try {
        // Mock data - thay thế API call với dữ liệu giả
        const mockData: InstallmentWithCustomer = {
          id: installmentId,
          contract_code: `HĐ-${installmentId.substring(0, 5)}`,
          customer_id: 'cus-123456',
          amount_given: 10000000,
          interest_rate: 15,
          duration: 30,
          amount_paid: 2000000,
          old_debt: 0,
          daily_amount: 350000,
          remaining_amount: 8000000,
          status: InstallmentStatus.ON_TIME,
          due_date: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString(),
          start_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          customer: {
            id: 'cus-123456',
            name: 'Nguyễn Văn A',
            address: 'Hà Nội, Việt Nam',
            notes: 'Khách hàng VIP',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            store_id: 'store-123456',
          }
        };

        // Giả lập độ trễ của mạng
        await new Promise(resolve => setTimeout(resolve, 800));

        setInstallment(mockData);
      } catch (err: any) {
        console.error('Error fetching installment:', err);
        setError(err.message || 'Có lỗi xảy ra khi tải dữ liệu');
      } finally {
        setIsLoading(false);
      }
    }

    fetchInstallmentData();
  }, [installmentId, isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">
            Chi tiết hợp đồng trả góp
            {installment?.contract_code && ` - ${installment.contract_code}`}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="ml-2">Đang tải thông tin hợp đồng...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-500">{error}</div>
        ) : installment ? (
          <div className="space-y-4 py-4">
            {/* Sử dụng CreditActionTabs thay vì tự tạo custom tabs */}
            <CreditActionTabs
              tabs={INSTALLMENT_TABS}
              activeTab={activeTab}
              onChangeTab={(tab) => setActiveTab(tab)}
            />

            {/* Nội dung tab */}
            <div className="mt-4">
              {activeTab === 'info' && (
                <CustomerInfoTab installment={installment} />
              )}
              
              {activeTab === 'schedule' && (
                <PaymentScheduleTab installmentId={installmentId} />
              )}
              
              {activeTab === 'payments' && (
                <PaymentHistoryTab installmentId={installmentId} />
              )}
              
              {activeTab === 'payment_due' && (
                <PaymentDueTab installmentId={installmentId} />
              )}
              
              {activeTab === 'documents' && (
                <DocumentsTab installmentId={installmentId} />
              )}
            </div>
          </div>
        ) : (
          <div className="text-center p-8 text-gray-500">Không tìm thấy thông tin hợp đồng</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
