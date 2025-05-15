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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { X, ChevronDown } from 'lucide-react';
import { CreditWithCustomer } from '@/models/credit';
import { CreditPaymentPeriod, PaymentPeriodStatus } from '@/models/credit-payment';
import { getCreditPaymentPeriods } from '@/lib/credit-payment';
import { addPrincipalRepayment, updateCreditPrincipal } from '@/lib/principal-repayment';
import { addAdditionalLoan, updateCreditWithAdditionalLoan } from '@/lib/additional-loan';
import { addExtension, updateCreditEndDate } from '@/lib/extension';
import { CreditActionTabs, DEFAULT_CREDIT_TABS, TabId } from './CreditActionTabs';
import { PaymentForm } from './PaymentForm';
import { PrincipalRepaymentForm } from './PrincipalRepaymentForm';
import { PrincipalRepaymentList } from './PrincipalRepaymentList';
import { AdditionalLoanForm } from './AdditionalLoanForm';
import { AdditionalLoanList } from './AdditionalLoanList';
import { ExtensionForm } from './ExtensionForm';
import { ExtensionList } from './ExtensionList';

interface PaymentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  credit: CreditWithCustomer;
}

export function PaymentHistoryModal({
  isOpen,
  onClose,
  credit
}: PaymentHistoryModalProps) {
  const [paymentPeriods, setPaymentPeriods] = useState<CreditPaymentPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('payment'); // Tab mặc định là "Đóng lãi phí"
  const [showPaymentForm, setShowPaymentForm] = useState(false); // Hiển thị form đóng lãi phí
  const [refreshRepayments, setRefreshRepayments] = useState(0); // Counter để refresh danh sách trả bớt gốc

  useEffect(() => {
    async function loadPaymentPeriods() {
      if (!credit?.id) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const { data, error } = await getCreditPaymentPeriods(credit.id);
        
        if (error) {
          throw error;
        }
        
        // Ensure status is properly typed as PaymentPeriodStatus
        setPaymentPeriods(data ? data.map(period => ({
          ...period,
          status: period.status as PaymentPeriodStatus
        })) : []);
      } catch (err) {
        console.error('Error loading payment periods:', err);
        setError('Không thể tải dữ liệu thanh toán');
      } finally {
        setLoading(false);
      }
    }
    
    if (isOpen) {
      loadPaymentPeriods();
    }
  }, [isOpen, credit?.id]);
  
  // Format currency helper
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(amount);
  };
  
  // Format date helper
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd-MM-yyyy', { locale: vi });
    } catch (error) {
      return '-';
    }
  };
  
  // Calculate total amounts
  const totalAmount = credit?.loan_amount || 0;
  const totalPaid = 0; // This should come from the API or be calculated
  const remainingAmount = totalAmount - totalPaid;
  
  // Generate date range for display
  const loanDateFormatted = formatDate(credit?.loan_date);
  const endDateFormatted = credit?.loan_date 
    ? formatDate(new Date(new Date(credit.loan_date).getTime() + credit.loan_period * 24 * 60 * 60 * 1000).toISOString())
    : '-';
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] md:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hợp đồng vay tiền</DialogTitle>
        </DialogHeader>
        
        <div className="mt-2">
          {/* Thông tin khách hàng */}
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">{credit?.customer?.name || 'Khách hàng'}</h3>
            <h3 className="font-medium text-red-600">Tổng lãi phí: {formatCurrency(250000)}</h3>
          </div>
          
          {/* Tổng hợp chi tiết */}
          <div className="grid grid-cols-2 gap-8 my-4">
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tiền vay</td>
                    <td className="py-1 px-2 text-right border">{formatCurrency(credit?.loan_amount || 0)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Lãi phí</td>
                    <td className="py-1 px-2 text-right border">
                      {credit?.interest_type === 'percentage' 
                        ? `${credit.interest_value}%` 
                        : formatCurrency(credit?.interest_value || 0)}
                      {credit?.interest_period ? ` /${credit.interest_period} ngày` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Vay từ ngày</td>
                    <td className="py-1 px-2 text-right border">{loanDateFormatted} → {endDateFormatted}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Đã thanh toán</td>
                    <td className="py-1 px-2 text-right border">{formatCurrency(0)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Nợ cũ</td>
                    <td className="py-1 px-2 text-right text-red-600 border">{formatCurrency(0)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Trạng thái</td>
                    <td className="py-1 px-2 text-right border">Đang vay</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Tabs */}
          <CreditActionTabs 
            tabs={DEFAULT_CREDIT_TABS} 
            activeTab={activeTab} 
            onChangeTab={(tabId: TabId) => setActiveTab(tabId)} 
            variant="scrollable"
            className="mb-2"
          />
          
          {/* Nội dung theo tab */}
          {activeTab === 'payment' && (
            <div>
              {/* Link mở form đóng lãi phí */}
              <div className="flex items-center mb-2 ml-1">
                <ChevronDown className="h-4 w-4 text-blue-600" />
                <a 
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault();
                    setShowPaymentForm(!showPaymentForm);
                  }}
                  className="text-blue-600 hover:underline ml-1"
                >
                  Đóng lãi phí tùy biến theo ngày
                </a>
              </div>
              
              {/* Form đóng lãi phí tùy biến */}
              {showPaymentForm && (
                <PaymentForm 
                  onClose={() => setShowPaymentForm(false)}
                  onSubmit={(data) => {
                    console.log('Submitted payment data:', data);
                    // Xử lý dữ liệu đóng lãi phí tại đây
                    setShowPaymentForm(false);
                  }}
                />
              )}
              
              <div className="overflow-auto mt-2" style={{ maxHeight: '400px' }}>
                <table className="w-full border-collapse">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left text-sm font-medium text-gray-500 border">STT</th>
                    <th className="px-2 py-2 text-left text-sm font-medium text-gray-500 border">Ngày</th>
                    <th className="px-2 py-2 text-center text-sm font-medium text-gray-500 border">Số ngày</th>
                    <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền lãi phí</th>
                    <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền khác</th>
                    <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tổng lãi phí</th>
                    <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền khách trả</th>
                    <th className="px-2 py-2 text-center text-sm font-medium text-gray-500 border w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-gray-500">
                        Đang tải dữ liệu...
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-red-500">
                        {error}
                      </td>
                    </tr>
                  ) : paymentPeriods.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-gray-500">
                        Chưa có dữ liệu thanh toán
                      </td>
                    </tr>
                  ) : (
                    // Dữ liệu mẫu như trong hình
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-2 py-2 text-center border">{index + 1}</td>
                        <td className="px-2 py-2 text-center border">
                          {formatDate(new Date(2025, 4, 15 + index).toISOString())} 
                          {' →'} 
                          {formatDate(new Date(2025, 4, 15 + index).toISOString())}
                        </td>
                        <td className="px-2 py-2 text-center border">1</td>
                        <td className="px-2 py-2 text-right border">{formatCurrency(50000)}</td>
                        <td className="px-2 py-2 text-right border">{formatCurrency(0)}</td>
                        <td className="px-2 py-2 text-right border">{formatCurrency(50000)}</td>
                        <td className="px-2 py-2 text-right border">
                          <span className="text-blue-500 cursor-pointer">
                            {formatCurrency(50000).replace('₫', '')}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center border">
                          <Checkbox />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                </table>
              </div>
            </div>
          )}
          
          {activeTab === 'principal-repayment' && (
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
                    
                    // Hiển thị thông báo thành công (có thể thêm toast notification ở đây)
                    alert('Đã cập nhật khoản trả bớt gốc thành công');
                  } catch (err) {
                    console.error('Error adding principal repayment:', err);
                    alert('Không thể thêm khoản trả bớt gốc. Vui lòng thử lại sau.');
                  }
                }}  
              />
              
              {/* Danh sách tiền gốc */}
              {credit?.id && (
                <PrincipalRepaymentList 
                  creditId={credit.id} 
                  key={refreshRepayments}
                  onDeleted={() => {
                    // Reload credit data when a repayment is deleted
                    // TODO: Add function to reload credit data after deletion
                  }}
                />
              )}
            </div>
          )}
          
          {activeTab === 'additional-loan' && (
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
          )}
          
          {activeTab === 'extension' && (
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
          )}
          
          {activeTab === 'close' && (
            <div className="p-4 text-center text-gray-500">
              Nội dung tính năng Đóng HĐ sẽ hiển thị ở đây
            </div>
          )}
          
          {activeTab === 'debt' && (
            <div className="p-4 text-center text-gray-500">
              Nội dung tính năng Nợ sẽ hiển thị ở đây
            </div>
          )}
          
          {activeTab === 'documents' && (
            <div className="p-4 text-center text-gray-500">
              Nội dung tính năng Chứng từ sẽ hiển thị ở đây
            </div>
          )}
          
          {activeTab === 'history' && (
            <div className="p-4 text-center text-gray-500">
              Nội dung tính năng Lịch sử sẽ hiển thị ở đây
            </div>
          )}
          
          {activeTab === 'late-payment-history' && (
            <div className="p-4 text-center text-gray-500">
              Nội dung tính năng Lịch sử trả chậm sẽ hiển thị ở đây
            </div>
          )}
          
          {activeTab === 'schedule' && (
            <div className="p-4 text-center text-gray-500">
              Nội dung tính năng Hẹn giờ sẽ hiển thị ở đây
            </div>
          )}
          
          {activeTab === 'bad-credit' && (
            <div className="p-4 text-center text-gray-500">
              Nội dung tính năng Báo xấu khách hàng sẽ hiển thị ở đây
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
