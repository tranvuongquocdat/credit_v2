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
import { CreditWithCustomer, InterestType } from '@/models/credit';
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

// Import our new UI components
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { DataTable } from '@/components/ui/DataTable';
import { Icon } from '@/components/ui/Icon';
import { FormRow } from '@/components/ui/FormRow';

// Import tab components
import { 
  DocumentsTab,
  ScheduleTab,
  BadCreditTab,
  LatePaymentHistoryTab
} from './tabs';

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
  
  // Helper function to calculate interest amount based on credit details
  const calculateInterestAmount = (credit: CreditWithCustomer | null) => {
    if (!credit) return 0;
    
    if (credit.interest_type === InterestType.PERCENTAGE) {
      // For percentage interest: loan_amount * (interest_value/100/30) * days * 30
      return Math.round(credit.loan_amount * (credit.interest_value / 100 / 30) * credit.interest_period * 30);
    } else {
      // For fixed interest: (interest_value/interest_period) * days * interest_period
      return Math.round((credit.interest_value / credit.interest_period) * credit.interest_period * credit.interest_period);
    }
  }

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
      <DialogContent 
        className="sm:max-w-[800px] md:max-w-[900px] max-h-[90vh] overflow-y-auto" 
      >
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
            <div className="p-4">
              <div className="grid grid-cols-[200px_1fr] gap-y-4 items-center">
                <div className="text-right pr-4 font-medium">Ngày đóng HĐ :</div>
                <div>
                  <input
                    type="text"
                    className="border rounded px-2 py-1 w-full max-w-[300px]"
                    defaultValue={format(new Date(), 'dd-MM-yyyy')}
                  />
                </div>
                
                <div className="text-right pr-4 font-medium">Tiền cầm :</div>
                <div className="text-blue-600 font-medium">
                  {credit?.loan_amount?.toLocaleString('vi-VN')} vnd
                </div>
                
                <div className="text-right pr-4 font-medium">Nợ cũ :</div>
                <div className="text-blue-600 font-medium">
                  0 vnd
                </div>
                
                <div className="text-right pr-4 font-medium">Tiền lãi phí :</div>
                <div className="text-blue-600 font-medium">
                  {/* Calculate interest based on loan_amount and interest_value */}
                  {(calculateInterestAmount(credit) || 0).toLocaleString('vi-VN')} vnd ({credit?.interest_period || 0} ngày)
                </div>
                
                <div className="text-right pr-4 font-medium">Tiền khác :</div>
                <div>
                  <input
                    type="text"
                    className="border rounded px-2 py-1 w-full max-w-[300px]"
                    defaultValue="0"
                  />
                </div>
                
                <div className="text-right pr-4 font-medium">Tổng tiền chuộc :</div>
                <div className="text-red-600 font-medium">
                  {((credit?.loan_amount || 0) + (calculateInterestAmount(credit) || 0)).toLocaleString('vi-VN')} vnd
                </div>
              </div>
              
              <div className="mt-6 flex justify-center">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8">
                  Đóng HĐ
                </Button>
              </div>
            </div>
          )}
          
          {activeTab === 'debt' && (
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Khách hàng nợ lãi phí */}
                <div className="border rounded-md">
                  <div className="bg-gray-100 p-3 border-b flex items-center">
                    <span className="text-amber-600 mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </span>
                    <span className="font-medium">Khách hàng nợ lãi phí</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-[150px_1fr] gap-4 items-center mb-4">
                      <div className="text-right">
                        <label htmlFor="debt-amount" className="font-medium">
                          Số tiền nợ lại lần này <span className="text-red-500">*</span>
                        </label>
                      </div>
                      <div>
                        <input
                          id="debt-amount"
                          type="text"
                          className="border rounded px-2 py-1 w-full"
                          defaultValue="0"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                        Ghi nợ
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Khách hàng trả nợ */}
                <div className="border rounded-md">
                  <div className="bg-gray-100 p-3 border-b flex items-center">
                    <span className="text-green-600 mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 9v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9"></path>
                        <polyline points="7 14 12 9 17 14"></polyline>
                        <line x1="12" y1="9" x2="12" y2="21"></line>
                      </svg>
                    </span>
                    <span className="font-medium">Khách hàng trả nợ</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-[150px_1fr] gap-4 items-center mb-4">
                      <div className="text-right">
                        <label htmlFor="pay-debt-amount" className="font-medium">
                          Số tiền trả nợ <span className="text-red-500">*</span>
                        </label>
                      </div>
                      <div>
                        <input
                          id="pay-debt-amount"
                          type="text"
                          className="border rounded px-2 py-1 w-full"
                          defaultValue="0"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                        Thanh toán
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'documents' && (
            <DocumentsTab creditId={credit?.id || ''} />
          )}
          
          {activeTab === 'history' && (
            <div className="p-4">
              {/* Ghi chú */}
              <div className="mb-6">
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  <h3 className="text-lg font-medium">Ghi Chú</h3>
                </div>
                <div>
                  <textarea 
                    className="w-full border rounded-md p-3 min-h-[100px] text-sm"
                    placeholder="Nhập ghi chú..."
                  ></textarea>
                  <div className="flex justify-end mt-2">
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                      Lưu
                    </Button>
                  </div>
                </div>
              </div>
              {/* Lịch sử nhắc nợ */}
              <div className="mb-6">
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                  </svg>
                  <h3 className="text-lg font-medium">Lịch sử nhắc nợ</h3>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-16 text-center">STT</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Ngày</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Người Thao tác</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nội dung</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* No data placeholder */}
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-sm text-gray-500 text-center">
                          Chưa có dữ liệu
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>


              {/* Lịch sử thao tác */}
              <div>
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                  <h3 className="text-lg font-medium">Lịch sử thao tác</h3>
                </div>
                <div className="text-sm text-amber-600 italic mb-2">
                  *Lưu ý : Tiền khác đã được cộng vào tiền ghi có / ghi nợ
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-16 text-center">STT</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Ngày</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Giao dịch viên</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 text-right">Số tiền ghi nợ</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 text-right">Số tiền ghi có</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nội dung</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      <tr>
                        <td className="px-4 py-3 text-sm text-gray-700 text-center">1</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{format(new Date(), 'dd-MM-yyyy HH:mm:ss')}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">Admin</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                          {credit?.loan_amount?.toLocaleString('vi-VN')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">0</td>
                        <td className="px-4 py-3 text-sm text-gray-700">Cho vay</td>
                      </tr>
                      <tr className="bg-amber-50">
                        <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Tổng Tiền</td>
                        <td className="px-4 py-2 text-sm font-medium text-right text-red-600">
                          {credit?.loan_amount?.toLocaleString('vi-VN')}
                        </td>
                        <td className="px-4 py-2 text-sm font-medium text-right text-blue-600">0</td>
                        <td></td>
                      </tr>
                      <tr className="bg-amber-100">
                        <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Chênh lệch</td>
                        <td colSpan={2} className="px-4 py-2 text-sm font-medium text-right text-red-600">
                          -{credit?.loan_amount?.toLocaleString('vi-VN')}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'late-payment-history' && (
            <LatePaymentHistoryTab credit={credit} />
          )}
          
          {activeTab === 'schedule' && (
            <ScheduleTab creditId={credit?.id || ''} />
          )}
          
          {activeTab === 'bad-credit' && (
            <BadCreditTab credit={credit} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
