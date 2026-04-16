'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { getPawnInterestDisplayString } from '@/lib/interest-calculator';
import { PawnActionTabs, DEFAULT_PAWN_TABS, PawnTabId } from './PawnActionTabs';
import { AdditionalLoanTab, BadPawnTab, RedeemTab, DocumentsTab, PaymentTab, PrincipalRepaymentTab } from './tabs';
import { getPawnById } from '@/lib/pawn';
import { PawnHistoryRecord, PawnTransactionType, getPawnAmountHistory } from '@/lib/pawn-amount-history';
import { formatCurrency, calculateDaysBetween, formatDate, formatDateTime } from '@/lib/utils';
import { calculateActualLoanAmount } from '@/lib/Pawns/calculate_actual_loan_amount';
import { usePermissions } from '@/hooks/usePermissions';
import { Badge } from '@/components/ui/badge';
// Removed: import { calculatePawnStatus, PawnStatusResult } from '@/lib/Pawns/calculate_pawn_status';

interface PawnHistoryModalProps {
  isOpen: boolean;
  onClose: (hasDataChanged?: boolean) => void;
  pawn: PawnWithCustomerAndCollateral;
  onPaymentUpdate?: () => void;
}

export function PawnHistoryModal({
  isOpen,
  onClose,
  pawn,
  onPaymentUpdate
}: PawnHistoryModalProps) {
  const [activeTab, setActiveTab] = useState<PawnTabId>('payment');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [currentPawn, setCurrentPawn] = useState(pawn);
  const [refreshRepayments, setRefreshRepayments] = useState(0);
  const [pawnHistory, setPawnHistory] = useState<PawnHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [actualLoanAmount, setActualLoanAmount] = useState<number>(0);
  const [pawnStatus, setPawnStatus] = useState<{status: string; statusCode: string} | null>(null);
  
  // State to track if data has changed
  const [hasDataChanged, setHasDataChanged] = useState(false);
  
  // Get user permissions
  const { hasPermission } = usePermissions();

  // Load initial data when modal opens
  useEffect(() => {
    if (isOpen && pawn?.id && !initialLoadComplete) {
      setInitialLoadComplete(true);
      // Load actual loan amount
      loadActualLoanAmount();
      // Load pawn status
      loadPawnStatus();
    }
    
    // Reset when modal closes
    if (!isOpen) {
      setInitialLoadComplete(false);
      setError(null);
    }
  }, [isOpen, pawn?.id, initialLoadComplete]);

  // Load pawn status - optimized to use view data if available
  const loadPawnStatus = async () => {
    if (!pawn?.id) return;
    
    try {
      // If status_code is already available from the view, use it directly
      if (pawn.status_code) {
        // Map status_code to status result directly
        const statusMapping: Record<string, { status: string; statusCode: string }> = {
          'ON_TIME': { status: 'Đang vay', statusCode: 'ON_TIME' },
          'CLOSED': { status: 'Đã đóng', statusCode: 'CLOSED' },
          'DELETED': { status: 'Đã xóa', statusCode: 'DELETED' },
          'OVERDUE': { status: 'Quá hạn', statusCode: 'OVERDUE' },
          'LATE_INTEREST': { status: 'Chậm lãi', statusCode: 'LATE_INTEREST' },
          'FINISHED': { status: 'Hoàn thành', statusCode: 'FINISHED' },
          'BAD_DEBT': { status: 'Nợ xấu', statusCode: 'BAD_DEBT' },
        };
        
        const mappedStatus = statusMapping[pawn.status_code] || statusMapping['ON_TIME'];
        setPawnStatus(mappedStatus);
      } else {
        // Fallback: assume ON_TIME if status_code not available
        setPawnStatus({ status: 'Đang vay', statusCode: 'ON_TIME' });
      }
    } catch (error) {
      console.error('Error loading pawn status:', error);
      setPawnStatus(null);
    }
  };

  // Load actual loan amount
  const loadActualLoanAmount = async () => {
    if (!pawn?.id) return;
    
    try {
      const amount = await calculateActualLoanAmount(pawn.id);
      setActualLoanAmount(amount);
    } catch (error) {
      console.error('Error loading actual loan amount:', error);
      setActualLoanAmount(pawn.loan_amount || 0);
    }
  };

  // Get status badge component based on status code
  const getStatusBadge = () => {
    if (!pawnStatus) {
      return <Badge className="bg-gray-100 text-gray-800 border-gray-200">
        {currentPawn?.status || 'Đang tải...'}
      </Badge>;
    }
    
    // Áp dụng màu sắc dựa trên statusCode
    switch (pawnStatus.statusCode) {
      case 'CLOSED':
        return (
          <Badge className="bg-gray-100 text-gray-800 border-gray-200">
            {pawnStatus.status}
          </Badge>
        );
      case 'DELETED':
        return (
          <Badge className="bg-gray-100 text-gray-800 border-gray-200">
            {pawnStatus.status}
          </Badge>
        );
      case 'OVERDUE':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            {pawnStatus.status}
          </Badge>
        );
      case 'LATE_INTEREST':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            {pawnStatus.status}
          </Badge>
        );
      case 'ON_TIME':
      default:
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            {pawnStatus.status}
          </Badge>
        );
    }
  };

  // Refresh data after any changes
  const handleDataChange = async () => {
    if (!pawn?.id) return;
    
    try {
      // Reload pawn data to get updated information
      try {
        const { data: updatedPawn, error } = await getPawnById(pawn.id);
        if (!error && updatedPawn) {
          setCurrentPawn(updatedPawn);
        }
      } catch (err) {
        console.error('Error reloading pawn data:', err);
      }
      
      // Mark that data has changed
      setHasDataChanged(true);
      
      // Reload actual loan amount
      await loadActualLoanAmount();
      
      // Reload pawn status
      await loadPawnStatus();
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  };

  // Format date for display
  const loanDateFormatted = currentPawn?.loan_date ? formatDate(currentPawn.loan_date) : 'N/A';
  const endDateFormatted = useMemo(() => {
    if (!currentPawn?.loan_date || !currentPawn?.loan_period) return 'N/A';
    const endDate = new Date(currentPawn.loan_date);
    endDate.setDate(endDate.getDate() + currentPawn.loan_period - 1);
    return formatDate(endDate.toISOString());
  }, [currentPawn?.loan_date, currentPawn?.loan_period]);

  // Load pawn amount history when tab changes to history or when pawn changes
  useEffect(() => {
    async function loadPawnHistory() {
      if (!pawn?.id || activeTab !== 'history' || !initialLoadComplete) return;
      
      setHistoryLoading(true);
      try {
        const { data, error } = await getPawnAmountHistory(pawn.id);
        
        if (error) {
          throw error;
        }
        
        setPawnHistory(data || []);
      } catch (err) {
        console.error('Error loading pawn history:', err);
      } finally {
        setHistoryLoading(false);
      }
    }
    
    loadPawnHistory();
  }, [pawn?.id, activeTab, refreshRepayments, initialLoadComplete]);

  // Helper function to get transaction type display text
  const getTransactionTypeDisplay = (type: PawnTransactionType | string): string => {
    switch (type) {
      case PawnTransactionType.INITIAL_LOAN:
        return 'Tạo hợp đồng';
      case PawnTransactionType.PRINCIPAL_REPAYMENT:
        return 'Trả bớt gốc';
      case PawnTransactionType.PAYMENT:
        return 'Đóng lãi phí';
      case PawnTransactionType.CONTRACT_CLOSE:
        return 'Đóng hợp đồng';
      case PawnTransactionType.PAYMENT_CANCEL:
        return 'Hủy đóng lãi phí';
      case PawnTransactionType.CONTRACT_REOPEN:
        return 'Mở lại hợp đồng';
      case PawnTransactionType.ADDITIONAL_LOAN:
        return 'Vay thêm';
      case PawnTransactionType.CANCEL_ADDITIONAL_LOAN:
        return 'Hủy vay thêm';
      case PawnTransactionType.CANCEL_PRINCIPAL_REPAYMENT:
        return 'Hủy trả bớt gốc';
      case 'contract_delete':
        return 'Xóa hợp đồng';
      default:
        return 'Giao dịch khác';
    }
  };

  // Helper function to calculate history totals
  const historyTotals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;

    pawnHistory.forEach(history => {
      // Add debit and credit amounts from original records
      totalDebit += history.debit_amount || 0;
      totalCredit += history.credit_amount || 0;
      
      // Add cancel records if they exist
      if ((history as any).updated_at && history.transaction_type === 'payment' && (history as any).is_deleted === true) {
        totalDebit += history.credit_amount || 0; // Cancel record adds to debit
      }
    });

    return {
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit
    };
  }, [pawnHistory]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'payment':
        return (
          <PaymentTab
            pawn={currentPawn}
            loading={loading}
            error={error}
            showPaymentForm={showPaymentForm}
            setShowPaymentForm={setShowPaymentForm}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            calculateDaysBetween={calculateDaysBetween}
            onDataChange={handleDataChange}
            onPaymentUpdate={onPaymentUpdate}
          />
        );
      case 'principal-repayment':
        // Check permission for principal repayment
        if (!hasPermission('tra_bot_goc_cam_do')) {
          return (
            <div className="p-4 text-center">
              <p className="text-red-500">Bạn không có quyền trả bớt gốc</p>
            </div>
          );
        }
        return (
          <PrincipalRepaymentTab
            pawn={currentPawn}
            refreshRepayments={refreshRepayments}
            setRefreshRepayments={setRefreshRepayments}
            onDataChange={handleDataChange}
          />
        );
      case 'additional-loan':
        // Check permission for additional loan
        if (!hasPermission('vay_them_goc_cam_do')) {
          return (
            <div className="p-4 text-center">
              <p className="text-red-500">Bạn không có quyền vay thêm gốc</p>
            </div>
          );
        }
        return (
          <AdditionalLoanTab
            pawn={currentPawn}
            onDataChange={handleDataChange}
          />
        );
      case 'redeem':
        // Check permission for redeeming
        if (!hasPermission('chuoc_do_cam_do')) {
          return (
            <div className="p-4 text-center">
              <p className="text-red-500">Bạn không có quyền chuộc đồ</p>
            </div>
          );
        }
        return (
          <RedeemTab
            pawn={currentPawn}
            onClose={onClose}
          />
        );
      case 'documents':
        return (
          <DocumentsTab
            pawn={currentPawn}
          />
        );
      case 'history':
        return (
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
              ) : pawnHistory.length === 0 ? (
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
                          // Create expanded history list with cancel records
                          const expandedHistory: Array<{
                            id: string;
                            created_at: string;
                            transaction_type: string;
                            debit_amount: number;
                            credit_amount: number;
                            description: string;
                            isCancel?: boolean;
                          }> = [];

                          pawnHistory.forEach(history => {
                            // Add original record
                            expandedHistory.push({
                              id: history.id,
                              created_at: history.created_at,
                              transaction_type: history.transaction_type,
                              debit_amount: history.debit_amount || 0,
                              credit_amount: history.credit_amount || 0,
                              description: history.description || '-'
                            });

                            // If has updated_at and is payment, add cancel record (check if properties exist)
                            if ((history as any).updated_at && history.transaction_type === 'payment' && (history as any).is_deleted === true) {
                              expandedHistory.push({
                                id: `${history.id}-cancel`,
                                created_at: (history as any).updated_at,
                                transaction_type: 'payment_cancel',
                                debit_amount: history.credit_amount || 0, // Debit amount from original record
                                credit_amount: 0,
                                description: `Hủy đóng lãi phí - ${history.description || ''}`,
                                isCancel: true
                              });
                            }
                          });

                          // Sort by time
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
        );
      case 'bad-credit':
        return (
          <BadPawnTab
            pawn={currentPawn}
          />
        );
      default:
        return null;
    }
  };

  // Update pawn state when initial pawn changes
  useEffect(() => {
    setCurrentPawn(pawn);
  }, [pawn]);
  
  // Reset active tab if user doesn't have permission for the current tab
  useEffect(() => {
    const checkPermissionForActiveTab = () => {
      if (activeTab === 'additional-loan' && !hasPermission('vay_them_goc_cam_do')) {
        setActiveTab('payment');
      } else if (activeTab === 'principal-repayment' && !hasPermission('tra_bot_goc_cam_do')) {
        setActiveTab('payment');
      } else if (activeTab === 'redeem' && !hasPermission('chuoc_do_cam_do')) {
        setActiveTab('payment');
      }
    };
    
    checkPermissionForActiveTab();
  }, [activeTab, hasPermission]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose(hasDataChanged)}>
      <DialogContent className="sm:max-w-[800px] md:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hợp đồng cầm đồ</DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          {/* Customer information */}
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">{currentPawn?.customer?.name || 'Khách hàng'}</h3>
            <h3 className="font-medium">Hợp đồng cầm đồ</h3>
          </div>
          
          {/* Summary details */}
          <div className="grid grid-cols-2 gap-8 my-4">
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tiền cầm</td>
                    <td className="py-1 px-2 text-right border" colSpan={2}>{formatCurrency(actualLoanAmount || currentPawn?.loan_amount || 0)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Lãi phí</td>
                    <td className="py-1 px-2 text-right border" colSpan={2}>
                      {currentPawn ? getPawnInterestDisplayString(currentPawn) : '-'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Cầm từ ngày</td>
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
                    <td className="py-1 px-2 border font-bold">Trạng thái</td>
                    <td className="py-1 px-2 text-right border">
                      {getStatusBadge()}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Mã hợp đồng</td>
                    <td className="py-1 px-2 text-right border">{currentPawn?.contract_code || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tài sản</td>
                    <td className="py-1 px-2 text-right border">
                      {(() => {
                        const name = currentPawn?.collateral_asset?.name ||
                          (currentPawn?.collateral_detail && typeof currentPawn.collateral_detail === 'object'
                            ? currentPawn.collateral_detail.name
                            : typeof currentPawn?.collateral_detail === 'string' ? currentPawn.collateral_detail : null) || '-';
                        const qty = currentPawn?.collateral_detail?.quantity;
                        return qty ? `${name} (x${qty})` : name;
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabs - Filter tabs based on permissions */}
          <PawnActionTabs
            tabs={DEFAULT_PAWN_TABS.filter(tab => {
              // Hide AdditionalLoanTab if user doesn't have vay_them_goc_cam_do permission
              if (tab.id === 'additional-loan' && !hasPermission('vay_them_goc_cam_do')) {
                return false;
              }
              
              // Hide PrincipalRepaymentTab if user doesn't have tra_bot_goc_cam_do permission
              if (tab.id === 'principal-repayment' && !hasPermission('tra_bot_goc_cam_do')) {
                return false;
              }
              
              // Hide RedeemTab if user doesn't have chuoc_do_cam_do permission
              if (tab.id === 'redeem' && !hasPermission('chuoc_do_cam_do')) {
                return false;
              }
              
              return true;
            })}
            activeTab={activeTab}
            onChangeTab={(tabId: PawnTabId) => setActiveTab(tabId)}
            variant="scrollable"
            className="mb-2"
          />
          
          <div className="flex-1 overflow-y-auto">
            {renderTabContent()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 