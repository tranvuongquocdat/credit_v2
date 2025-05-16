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
import { CreditActionTabs, TabId, CreditTab } from '@/components/Credits/CreditActionTabs';

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
const INSTALLMENT_TABS: CreditTab[] = [
  { id: 'info' as TabId, label: 'Thông tin khách hàng' },
  { id: 'schedule' as TabId, label: 'Lịch trả góp' },
  { id: 'payments' as TabId, label: 'Lịch sử thanh toán' },
  { id: 'payment_due' as TabId, label: 'Lịch đóng tiền' },
  { id: 'documents' as TabId, label: 'Chứng từ' },
];

export function InstallmentDetailModal({
  isOpen,
  onClose,
  installmentId,
}: InstallmentDetailModalProps) {
  const [installment, setInstallment] = useState<InstallmentWithCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('info' as TabId);
  
  // Format currency helper
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(amount);
  };
  
  // Format installment status helper
  const formatInstallmentStatus = (status?: InstallmentStatus): string => {
    if (!status) return 'Không xác định';
    
    switch (status) {
      case InstallmentStatus.ON_TIME:
        return 'Đúng hẹn';
      case InstallmentStatus.OVERDUE:
        return 'Quá hạn';
      case InstallmentStatus.LATE_INTEREST:
        return 'Chậm lãi';
      case InstallmentStatus.CLOSED:
        return 'Đã đóng';
      default:
        return 'Không xác định';
    }
  };

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
            {/* Thông tin chung về hợp đồng trả góp */}
            <div className="mt-2">
              {/* Thông tin khách hàng */}
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium">{installment?.customer?.name || 'Khách hàng'}</h3>
                <h3 className="font-medium text-red-600">Số tiền hàng ngày: {formatCurrency(installment?.daily_amount || 0)}</h3>
              </div>
              
              {/* Tổng hợp chi tiết */}
              <div className="grid grid-cols-2 gap-8 my-4">
                <div>
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr>
                        <td className="py-1 px-2 border font-bold">Tiền vay ban đầu</td>
                        <td className="py-1 px-2 text-right border">{formatCurrency(installment?.amount_given || 0)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 px-2 border font-bold">Lãi suất</td>
                        <td className="py-1 px-2 text-right border">{installment?.interest_rate || 0}%</td>
                      </tr>
                      <tr>
                        <td className="py-1 px-2 border font-bold">Thời gian vay</td>
                        <td className="py-1 px-2 text-right border">{installment?.duration || 0} ngày</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr>
                        <td className="py-1 px-2 border font-bold">Đã thanh toán</td>
                        <td className="py-1 px-2 text-right border">{formatCurrency(installment?.amount_paid || 0)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 px-2 border font-bold">Nợ cũ</td>
                        <td className="py-1 px-2 text-right text-red-600 border">{formatCurrency(installment?.old_debt || 0)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 px-2 border font-bold">Trạng thái</td>
                        <td className="py-1 px-2 text-right border">{formatInstallmentStatus(installment?.status)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            {/* Sử dụng CreditActionTabs thay vì tự tạo custom tabs */}
            <CreditActionTabs
              tabs={INSTALLMENT_TABS}
              activeTab={activeTab}
              onChangeTab={(tab) => setActiveTab(tab)}
            />

            {/* Nội dung tab */}
            <div className="mt-4">
              {activeTab === ('info' as TabId) && (
                <CustomerInfoTab installment={installment} />
              )}
              
              {activeTab === ('schedule' as TabId) && (
                <PaymentScheduleTab installmentId={installmentId} />
              )}
              
              {activeTab === ('payments' as TabId) && (
                <PaymentHistoryTab installmentId={installmentId} />
              )}
              
              {activeTab === ('payment_due' as TabId) && (
                <PaymentDueTab installmentId={installmentId} />
              )}
              
              {activeTab === ('documents' as TabId) && (
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
