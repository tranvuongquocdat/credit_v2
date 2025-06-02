'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { getInterestDisplayString, calculateInterestAmount as calculateInterestForPeriod, calculateInterestWithPrincipalChanges, PrincipalChange, calculateDailyRateForCredit } from '@/lib/interest-calculator';
import { addPrincipalRepayment, updateCreditPrincipal } from '@/lib/principal-repayment';
import { addAdditionalLoan, updateCreditWithAdditionalLoan } from '@/lib/additional-loan';
import { addExtension, updateCreditEndDate } from '@/lib/extension';
import { CreditActionTabs, DEFAULT_CREDIT_TABS, TabId } from './CreditActionTabs';
import { AdditionalLoanTab, BadCreditTab, CloseTab, DocumentsTab, ExtensionTab, PaymentTab, PrincipalRepaymentTab } from './tabs';
import { getCreditById } from '@/lib/credit';
import { getPrincipalChangesForCredit } from '@/lib/credit-principal-changes';
import { CreditAmountHistory, CreditTransactionType, getCreditAmountHistory } from '@/lib/credit-amount-history';
import { calculateDaysBetween, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { getExpectedMoney } from '@/lib/Credits/create_principal_payment_history';
import { calculateDebtToLatestPaidPeriod } from '@/lib/Credits/calculate_remaining_debt';
import { getCreditPaymentHistory } from '@/lib/Credits/payment_history';
import { calculateActualLoanAmount } from '@/lib/Credits/calculate_actual_loan_amount';


interface PaymentHistoryModalProps {
  isOpen: boolean;
  onClose: (hasDataChanged?: boolean) => void;
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
  
  // State để track việc có thay đổi dữ liệu hay không
  const [hasDataChanged, setHasDataChanged] = useState(false);
  
  // State cho modal nhập tiền khách trả
  const [showPaymentInput, setShowPaymentInput] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [otherAmount, setOtherAmount] = useState<number>(0);
  
  // State đơn giản cho tổng lãi phí và nợ cũ
  const [totalExpectedInterest, setTotalExpectedInterest] = useState<number>(0);
  const [remainingDebt, setRemainingDebt] = useState<number>(0);
  const [loadingFinancials, setLoadingFinancials] = useState(false);
  
  // State cho payment history từ getCreditPaymentHistory
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loadingPaymentHistory, setLoadingPaymentHistory] = useState(false);
  
  // State cho actual loan amount
  const [actualLoanAmount, setActualLoanAmount] = useState<number>(0);
  const [loadingActualAmount, setLoadingActualAmount] = useState(false);
  
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
      case CreditTransactionType.CONTRACT_DELETE:
        return 'Xóa hợp đồng';
      default:
        return 'Giao dịch khác';
    }
  };

  // Helper function to calculate history totals
  const calculateHistoryTotals = () => {
    let totalDebit = 0;
    let totalCredit = 0;

    creditHistory.forEach(history => {
      // Add debit and credit amounts from original records
      totalDebit += history.debit_amount || 0;
      totalCredit += history.credit_amount || 0;
      
      // Add cancel records if they exist
      if (history.updated_at && history.transaction_type === 'payment' && history.is_deleted === true) {
        totalDebit += history.credit_amount || 0; // Cancel record adds to debit
      }
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
  
  // useEffect để load payment history
  useEffect(() => {
    async function loadPaymentHistory() {
      if (!credit?.id) {
        setPaymentHistory([]);
        return;
      }

      setLoadingPaymentHistory(true);
      try {
        const history = await getCreditPaymentHistory(credit.id);
        // Filter chỉ lấy payment records chưa bị xóa
        const paymentRecords = history.filter(record => 
          record.transaction_type === 'payment' && 
          record.is_deleted === false
        );
        setPaymentHistory(paymentRecords);
        
        console.log('Payment history loaded:', {
          total: history.length,
          payments: paymentRecords.length
        });
      } catch (error) {
        console.error('Error loading payment history:', error);
        setPaymentHistory([]);
      } finally {
        setLoadingPaymentHistory(false);
      }
    }

    loadPaymentHistory();
  }, [credit?.id, hasDataChanged]); // Reload khi có data change
  
  // useEffect đơn giản để tính tổng lãi phí và nợ cũ
  useEffect(() => {
    async function calculateFinancials() {
      if (!credit?.id) {
        setTotalExpectedInterest(0);
        setRemainingDebt(0);
        return;
      }

      setLoadingFinancials(true);
      try {
        // 1. Gọi getExpectedMoney và tính tổng
        const dailyAmounts = await getExpectedMoney(credit.id);
        const total = dailyAmounts.reduce((sum, amount) => sum + amount, 0);
        setTotalExpectedInterest(Math.round(total));

        // 2. Gọi calculateDebtToLatestPaidPeriod
        const debt = await calculateDebtToLatestPaidPeriod(credit.id);
        setRemainingDebt(debt);

        console.log('Financials calculated:', {
          totalExpected: Math.round(total),
          debt: debt
        });
      } catch (error) {
        console.error('Error calculating financials:', error);
        setTotalExpectedInterest(0);
        setRemainingDebt(0);
      } finally {
        setLoadingFinancials(false);
      }
    }

    calculateFinancials();
  }, [credit?.id, hasDataChanged]);

  // useEffect để tính actual loan amount
  useEffect(() => {
    async function loadActualLoanAmount() {
      if (!credit?.id) {
        setActualLoanAmount(0);
        return;
      }

      setLoadingActualAmount(true);
      try {
        const amount = await calculateActualLoanAmount(credit.id);
        setActualLoanAmount(amount);
        console.log('Actual loan amount calculated:', amount);
      } catch (error) {
        console.error('Error calculating actual loan amount:', error);
        setActualLoanAmount(credit.loan_amount || 0); // Fallback to original amount
      } finally {
        setLoadingActualAmount(false);
      }
    }

    loadActualLoanAmount();
  }, [credit?.id, hasDataChanged]); // Reload khi có data change

  // Sử dụng giá trị đơn giản
  const totalExpected = totalExpectedInterest;
  const remainingAmount = remainingDebt;

  // CẬP NHẬT: totalPaid từ getCreditPaymentHistory
  const totalPaid = useMemo(() => {
    return paymentHistory.reduce((sum, payment) => sum + (payment.credit_amount || 0), 0);
  }, [paymentHistory]);

  // Generate date range for display
  const loanDateFormatted = formatDate(credit?.loan_date);
  const endDateFormatted = credit?.loan_date 
    ? formatDate(new Date(new Date(credit.loan_date).getTime() + (credit.loan_period - 1) * 24 * 60 * 60 * 1000).toISOString())
    : '-';

  const historyTotals = calculateHistoryTotals();
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose(hasDataChanged)}>
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
            <h3 className="font-medium">
              {loadingFinancials ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin"></div>
                  Đang tính...
                </span>
              ) : (
                `Tổng lãi phí: ${formatCurrency(totalExpected)}`
              )}
            </h3>
          </div>
          
          {/* Tổng hợp chi tiết */}
          <div className="grid grid-cols-2 gap-8 my-4">
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tiền vay</td>
                    <td className="py-1 px-2 text-right border" colSpan={2}>
                      {loadingActualAmount ? (
                        <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mx-auto"></div>
                      ) : (
                        formatCurrency(actualLoanAmount)
                      )}
                    </td>
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
                    <td className="py-1 px-2 text-right border">
                      {loadingPaymentHistory ? (
                        <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mx-auto"></div>
                      ) : (
                        formatCurrency(totalPaid)
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">
                      {loadingFinancials ? 'Đang tính...' : (remainingAmount < 0 ? 'Tiền thừa' : 'Nợ cũ')}
                    </td>
                    <td className={`py-1 px-2 text-right border ${
                      loadingFinancials ? 'text-gray-500' : 
                      remainingAmount < 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {loadingFinancials ? (
                        <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mx-auto"></div>
                      ) : (
                        formatCurrency(Math.abs(remainingAmount))
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Trạng thái</td>
                    <td className="py-1 px-2 text-right border">
                      {credit?.status === 'closed' ? 'Đã đóng' : 'Đang vay'}
                    </td>
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
                // Mark that data has changed
                setHasDataChanged(true);
                
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
                
                // Reload credit info to get updated debt_amount
                reloadCreditInfo();
              }}
            />
          )}
          
          {activeTab === 'principal-repayment' && (
            <PrincipalRepaymentTab
              credit={credit}
              refreshRepayments={refreshRepayments}
              setRefreshRepayments={setRefreshRepayments}
              onDataChange={() => {
                // Mark that data has changed
                setHasDataChanged(true);
                reloadCreditInfo();
              }}
            />
          )}
          
          {activeTab === 'additional-loan' && (
            <AdditionalLoanTab 
              credit={credit}
              key={refreshAdditionalLoans}
              onDataChange={() => {
                // Mark that data has changed
                setHasDataChanged(true);
                setRefreshAdditionalLoans(prev => prev + 1);
                reloadCreditInfo();
              }}
            />
          )}
          
          {activeTab === 'extension' && (
            <ExtensionTab 
              credit={credit} 
              onDataChange={() => {
                // Mark that data has changed
                setHasDataChanged(true);
                reloadCreditInfo();
              }}
            />
          )}
          
          {activeTab === 'close' && (
            <CloseTab credit={credit} onClose={() => onClose(hasDataChanged)} />
          )}
          
          {activeTab === 'documents' && (
            <DocumentsTab creditId={creditId} creditStatus={credit?.status || undefined} />
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
                          {(() => {
                            // Tạo danh sách records mở rộng với các bản ghi hủy
                            const expandedHistory: Array<{
                              id: string;
                              created_at: string;
                              transaction_type: string;
                              debit_amount: number;
                              credit_amount: number;
                              description: string;
                              isCancel?: boolean;
                            }> = [];

                            creditHistory.forEach(history => {
                              // Thêm bản ghi gốc
                              expandedHistory.push({
                                id: history.id,
                                created_at: history.created_at,
                                transaction_type: history.transaction_type,
                                debit_amount: history.debit_amount || 0,
                                credit_amount: history.credit_amount || 0,
                                description: history.description || '-'
                              });

                              // Nếu có updated_at và là payment, thêm bản ghi hủy
                              if (history.updated_at && history.transaction_type === 'payment' && history.is_deleted === true) {
                                expandedHistory.push({
                                  id: `${history.id}-cancel`,
                                  created_at: history.updated_at,
                                  transaction_type: 'payment_cancel',
                                  debit_amount: history.credit_amount || 0, // Số tiền ghi nợ của bản ghi gốc
                                  credit_amount: 0,
                                  description: `Hủy đóng lãi phí - ${history.description || ''}`,
                                  isCancel: true
                                });
                              }
                            });

                            // Sắp xếp theo thời gian
                            expandedHistory.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

                            return expandedHistory.map((record, index) => (
                              <tr key={record.id} className={record.isCancel ? 'bg-red-50' : ''}>
                                <td className="px-4 py-3 text-sm text-gray-700 text-center">{index + 1}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(record.created_at)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">
                                  {record.isCancel ? (
                                    <span className="text-red-600 font-medium">Hủy đóng lãi phí</span>
                                  ) : (
                                    getTransactionTypeDisplay(record.transaction_type)
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                                  {record.debit_amount > 0 ? formatCurrency(record.debit_amount) : ""}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700 text-right text-green-600">
                                  {record.credit_amount > 0 ? formatCurrency(record.credit_amount) : ""}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700">{record.description}</td>
                              </tr>
                            ));
                          })()}
                          
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
