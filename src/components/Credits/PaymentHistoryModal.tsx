'use client';

import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { CreditWithCustomer, InterestType, Credit } from '@/models/credit';
import { CreditPaymentPeriod } from '@/models/credit-payment';
import { getCreditPaymentPeriods, savePaymentWithOtherAmount } from '@/lib/credit-payment';
import { getInterestDisplayString, calculateInterestAmount as calculateInterestForPeriod, calculateInterestWithPrincipalChanges, PrincipalChange } from '@/lib/interest-calculator';
import { addPrincipalRepayment, updateCreditPrincipal } from '@/lib/principal-repayment';
import { addAdditionalLoan, updateCreditWithAdditionalLoan } from '@/lib/additional-loan';
import { addExtension, updateCreditEndDate } from '@/lib/extension';
import { CreditActionTabs, DEFAULT_CREDIT_TABS, TabId } from './CreditActionTabs';
import { AdditionalLoanTab, BadCreditTab, CloseTab, DocumentsTab, ExtensionTab, PaymentTab, PrincipalRepaymentTab } from './tabs';
import { getCreditById } from '@/lib/credit';
import { getPrincipalChangesForCredit } from '@/lib/credit-principal-changes';
import { CreditAmountHistory, CreditTransactionType, getCreditAmountHistory } from '@/lib/credit-amount-history';
import { calculateDaysBetween, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';


interface PaymentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  credit: CreditWithCustomer;
}

export function PaymentHistoryModal({
  isOpen,
  onClose,
  credit: initialCredit
}: PaymentHistoryModalProps) {
  // Properly declare the variables to fix TypeScript errors
  const [credit, setCredit] = useState<CreditWithCustomer>(initialCredit);
  const creditId = credit?.id || '';
  const [paymentPeriods, setPaymentPeriods] = useState<CreditPaymentPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('payment'); // Tab mặc định là "Đóng lãi phí"
  const [showPaymentForm, setShowPaymentForm] = useState(false); // Hiển thị form đóng lãi phí
  const [refreshRepayments, setRefreshRepayments] = useState(0); // Counter để refresh danh sách trả bớt gốc
  const [refreshAdditionalLoans, setRefreshAdditionalLoans] = useState(0); // Counter để refresh danh sách vay thêm
  const [principalChanges, setPrincipalChanges] = useState<PrincipalChange[]>([]);
  const [creditHistory, setCreditHistory] = useState<CreditAmountHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // State cho modal nhập tiền khách trả
  const [showPaymentInput, setShowPaymentInput] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [otherAmount, setOtherAmount] = useState<number>(0);
  
  // Cập nhật state credit khi initialCredit thay đổi
  useEffect(() => {
    setCredit(initialCredit);
  }, [initialCredit]);

  // Hàm reload thông tin hợp đồng
  const reloadCreditInfo = async () => {
    if (!credit?.id) return;
    
    try {
      const { data, error } = await getCreditById(credit.id);
      
      if (error) {
        throw error;
      }
      
      if (data) {
        setCredit(data);
      }
    } catch (err) {
      console.error('Error reloading credit info:', err);
    }
  };

  // Load credit amount history when tab changes to history or when credit changes
  useEffect(() => {
    async function loadCreditHistory() {
      if (!credit?.id || activeTab !== 'history') return;
      
      setHistoryLoading(true);
      try {
        const { data, error } = await getCreditAmountHistory(credit.id);
        
        if (error) {
          throw error;
        }
        
        // Force cast data to CreditAmountHistory[]
        setCreditHistory(data ? [...data] as unknown as CreditAmountHistory[] : []);
      } catch (err) {
        console.error('Error loading credit history:', err);
      } finally {
        setHistoryLoading(false);
      }
    }
    
    loadCreditHistory();
  }, [credit?.id, activeTab, refreshRepayments, refreshAdditionalLoans]);

  // Helper function to get transaction type display text
  const getTransactionTypeDisplay = (type: CreditTransactionType | string): string => {
    switch (type) {
      case CreditTransactionType.INITIAL_LOAN:
        return 'Tạo hợp đồng';
      case CreditTransactionType.ADDITIONAL_LOAN:
        return 'Vay thêm';
      case CreditTransactionType.PRINCIPAL_REPAYMENT:
        return 'Trả bớt gốc';
      case 'payment':
        return 'Đóng lãi phí';
      case 'payment_cancel':
        return 'Hủy đóng lãi phí';
      case 'contract_close':
        return 'Đóng hợp đồng';
      case 'contract_reopen':
        return 'Mở lại hợp đồng';
      case CreditTransactionType.CANCEL_PRINCIPAL_REPAYMENT:
        return 'Hủy trả bớt gốc';
      case CreditTransactionType.CANCEL_ADDITIONAL_LOAN:
        return 'Hủy vay thêm';
      default:
        return 'Giao dịch khác';
    }
  };

  // Helper function to calculate history totals
  const calculateHistoryTotals = () => {
    let totalDebit = 0;
    let totalCredit = 0;

    creditHistory.forEach(history => {
      // Add debit and credit amounts
      totalDebit += history.debit_amount || 0;
      totalCredit += history.credit_amount || 0;
    });

    return {
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit
    };
  };

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
        
        setPaymentPeriods(data || []);
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
  
  // Fetch principal changes when credit changes
  useEffect(() => {
    async function fetchPrincipalChanges() {
      if (!credit?.id) return;
      
      try {
        const { data, error } = await getPrincipalChangesForCredit(credit.id);
        
        if (error) {
          console.error('Error fetching principal changes:', error);
          return;
        }
        
        setPrincipalChanges(data || []);
      } catch (err) {
        console.error('Error in fetchPrincipalChanges:', err);
      }
    }
    
    fetchPrincipalChanges();
  }, [credit?.id, refreshRepayments, refreshAdditionalLoans]);
  
  // Calculate total amounts with useMemo
  const totalAmount = useMemo(() => credit?.loan_amount || 0, [credit?.loan_amount]);
  
  // Calculate total expected, paid, and remaining amounts from payment periods with useMemo
  const totalExpected = useMemo(() => 
    paymentPeriods.reduce((sum, period) => sum + (period.expected_amount || 0), 0),
    [paymentPeriods]
  );

  const totalPaid = useMemo(() => 
    paymentPeriods.reduce((sum, period) => sum + (period.actual_amount || 0), 0),
    [paymentPeriods]
  );
  
  // Sử dụng debt_amount trực tiếp từ credit thay vì tính toán
  const remainingAmount = credit?.debt_amount !== undefined ? -(credit.debt_amount) : 0;
  
  // Generate date range for display
  const loanDateFormatted = formatDate(credit?.loan_date);
  const endDateFormatted = credit?.loan_date 
    ? formatDate(new Date(new Date(credit.loan_date).getTime() + (credit.loan_period - 1) * 24 * 60 * 60 * 1000).toISOString())
    : '-';
  
  // Giải thích: Chúng ta trừ 1 vì khi tính số ngày, ngày đầu và ngày cuối đều được tính vào (inclusive)
  // Ví dụ: từ 18/5 đến 17/6 là 31 ngày, nhưng khi tính số ngày cần nhảy là 30 ngày
  
  // Calculate totals for history display
  const historyTotals = calculateHistoryTotals();
  
  // Hàm xử lý việc lưu thanh toán khi người dùng nhập xong
  const handleSavePayment = async () => {
    if (!selectedPeriodId || !credit) return;
    
    try {
      // Tìm kỳ được chọn
      const periodToUpdate = paymentPeriods.find(p => p.id === selectedPeriodId);
      if (!periodToUpdate) return;
      
      // Kiểm tra xem đây có phải kỳ tính toán chưa lưu trong DB không
      const isCalculatedPeriod = selectedPeriodId.startsWith('calculated-');
      
      // Sử dụng hàm savePaymentWithOtherAmount để lưu hoặc cập nhật
      const { data, error } = await savePaymentWithOtherAmount(
        credit.id,
        periodToUpdate,
        paymentAmount,
        otherAmount,
        isCalculatedPeriod
      );
      
      if (error) {
        console.error('Lỗi khi lưu thanh toán:', error);
        return;
      }
      
      // Cập nhật lại danh sách kỳ thanh toán
      if (data) {
        // Tạo bản sao của danh sách hiện tại
        const updatedPeriods = [...paymentPeriods];
        
        // Tìm và thay thế kỳ được cập nhật
        const periodIndex = updatedPeriods.findIndex(p => p.id === selectedPeriodId);
        if (periodIndex >= 0) {
          // Nếu đây là kỳ tính toán, thay thế ID tạm bởi ID thật
          updatedPeriods[periodIndex] = {
            ...periodToUpdate,
            id: isCalculatedPeriod ? data.id : periodToUpdate.id,
            actual_amount: paymentAmount,
            other_amount: otherAmount,
            payment_date: new Date().toISOString(),
          };
        }
        
        // Cập nhật state
        setPaymentPeriods(updatedPeriods);
      }
      
      // Đóng dialog
      setShowPaymentInput(false);
      setSelectedPeriodId(null);
    } catch (error) {
      console.error('Lỗi khi xử lý thanh toán:', error);
    }
  }
  
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
            <h3 className="font-medium">Tổng lãi phí: {formatCurrency(totalExpected)}</h3>
          </div>
          
          {/* Tổng hợp chi tiết */}
          <div className="grid grid-cols-2 gap-8 my-4">
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tiền vay</td>
                    <td className="py-1 px-2 text-right border" colSpan={2}>{formatCurrency(credit?.loan_amount || 0)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Lãi phí</td>
                    <td className="py-1 px-2 text-right border" colSpan={2}>
                      {credit ? getInterestDisplayString(credit) : '-'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Vay từ ngày</td>
                    <td className="py-1 px-2 text-right border">{loanDateFormatted}</td>
                    <td className="py-1 px-2 text-right border">{endDateFormatted}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Đã thanh toán</td>
                    <td className="py-1 px-2 text-right border">{formatCurrency(totalPaid)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">{remainingAmount > 0 ? 'Tiền thừa' : 'Nợ cũ'}</td>
                    <td className={`py-1 px-2 text-right border ${remainingAmount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Math.abs(remainingAmount))}
                    </td>
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
            <PaymentTab
              credit={credit}
              paymentPeriods={paymentPeriods}
              combinedPaymentPeriods={[]}
              loading={loading}
              error={error}
              showPaymentForm={showPaymentForm}
              setShowPaymentForm={setShowPaymentForm}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              calculateDaysBetween={calculateDaysBetween}
              principalChanges={principalChanges}
              onDataChange={() => {
                // Reload payment periods data
                if (credit?.id) {
                  setLoading(true);
                  getCreditPaymentPeriods(credit.id).then(({ data, error }) => {
                    setLoading(false);
                    if (error) {
                      setError('Không thể tải lại dữ liệu thanh toán');
                      return;
                    }
                    
                    setPaymentPeriods(data || []);
                  });
                }
              }}
            />
          )}
          
          {activeTab === 'principal-repayment' && (
            <PrincipalRepaymentTab
              credit={credit}
              refreshRepayments={refreshRepayments}
              setRefreshRepayments={setRefreshRepayments}
              onDataChange={reloadCreditInfo}
            />
          )}
          
          {activeTab === 'additional-loan' && (
            <AdditionalLoanTab 
              credit={credit}
              key={refreshAdditionalLoans}
              onDataChange={() => {
                setRefreshAdditionalLoans(prev => prev + 1);
                reloadCreditInfo();
              }}
            />
          )}
          
          {activeTab === 'extension' && (
            <ExtensionTab 
              credit={credit} 
              onDataChange={reloadCreditInfo}
            />
          )}
          
          {activeTab === 'close' && (
            <CloseTab credit={credit} onClose={onClose} />
          )}
          
          {activeTab === 'documents' && (
            <DocumentsTab creditId={creditId} />
          )}
          
          {activeTab === 'history' && credit && (
            <div className="p-4">
              {/* Lịch sử thao tác */}
              <div>
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                  <h3 className="text-lg font-medium">Lịch sử thao tác</h3>
                </div>
                
                {historyLoading ? (
                  <div className="flex justify-center items-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
                  </div>
                ) : creditHistory.length === 0 ? (
                  <div className="flex justify-center items-center py-10">
                    <p className="text-gray-500">Chưa có lịch sử giao dịch</p>
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-amber-600 italic mb-2">
                      *Lưu ý: Ghi nợ (debit) là tiền ra, ghi có (credit) là tiền vào
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-16 text-center">STT</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Ngày</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Loại giao dịch</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 text-right">Số tiền ghi nợ</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 text-right">Số tiền ghi có</th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nội dung</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {creditHistory.map((history, index) => (
                            <tr key={history.id}>
                              <td className="px-4 py-3 text-sm text-gray-700 text-center">{index + 1}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(history.created_at)}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{getTransactionTypeDisplay(history.transaction_type)}</td>
                              <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                                {history.debit_amount > 0 ? formatCurrency(history.debit_amount) : ""}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 text-right text-green-600">
                                {history.credit_amount > 0 ? formatCurrency(history.credit_amount) : ""}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{history.description || '-'}</td>
                            </tr>
                          ))}
                          
                          {/* Summary rows */}
                          <tr className="bg-amber-50">
                            <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Tổng Tiền</td>
                            <td className="px-4 py-2 text-sm font-medium text-right text-red-600">
                              {formatCurrency(historyTotals.totalDebit)}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium text-right text-green-600">
                              {formatCurrency(historyTotals.totalCredit)}
                            </td>
                            <td></td>
                          </tr>
                          <tr className="bg-amber-100">
                            <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Chênh lệch</td>
                            <td colSpan={2} className="px-4 py-2 text-sm font-medium text-right">
                              <span className={historyTotals.totalDebit - historyTotals.totalCredit >= 0 ? "text-red-600" : "text-green-600"}>
                                {formatCurrency(historyTotals.totalDebit - historyTotals.totalCredit)}
                              </span>
                            </td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'bad-credit' && (
            <BadCreditTab credit={credit} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
