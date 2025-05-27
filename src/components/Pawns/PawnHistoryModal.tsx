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
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { PawnPaymentPeriod } from '@/models/pawn-payment';
import { getPawnPaymentPeriods } from '@/lib/pawn-payment';
import { getPawnInterestDisplayString, calculatePawnInterestAmount as calculateInterestForPeriod, calculateInterestWithPrincipalChanges, PrincipalChange } from '@/lib/interest-calculator';
import { PawnActionTabs, DEFAULT_PAWN_TABS, PawnTabId } from './PawnActionTabs';
import { AdditionalLoanTab, BadPawnTab, RedeemTab, DocumentsTab, ExtensionTab, PaymentTab, PrincipalRepaymentTab, LiquidationTab } from './tabs';
import { getPawnById } from '@/lib/pawn';
import { getPrincipalChangesForPawn } from '@/lib/pawn-principal-changes';
import { PawnAmountHistory, PawnTransactionType, getPawnAmountHistory } from '@/lib/pawn-amount-history';
import { formatCurrency, calculateDaysBetween, formatDate, formatDateTime } from '@/lib/utils';

interface PawnHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  pawn: PawnWithCustomerAndCollateral;
}

export function PawnHistoryModal({
  isOpen,
  onClose,
  pawn
}: PawnHistoryModalProps) {
  const [activeTab, setActiveTab] = useState<PawnTabId>('payment');
  const [paymentPeriods, setPaymentPeriods] = useState<PawnPaymentPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [currentPawn, setCurrentPawn] = useState(pawn);
  const [principalChanges, setPrincipalChanges] = useState<PrincipalChange[]>([]);
  const [refreshRepayments, setRefreshRepayments] = useState(0);
  const [pawnHistory, setPawnHistory] = useState<PawnAmountHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const loadPaymentPeriods = useCallback(async () => {
    if (!pawn?.id) return;
    
    try {
      const { data, error } = await getPawnPaymentPeriods(pawn.id);
      
      if (error) throw error;
      
      setPaymentPeriods(data || []);
    } catch (err) {
      console.error('Error loading payment periods:', err);
      setError('Không thể tải dữ liệu kỳ thanh toán');
    }
  }, [pawn?.id]);

  // Load principal changes
  const loadPrincipalChanges = useCallback(async () => {
    if (!pawn?.id) return;
    
    try {
      const { data, error } = await getPrincipalChangesForPawn(pawn.id);
      
      if (error) {
        console.error('Error loading principal changes:', error);
        return;
      }
      
      setPrincipalChanges(data || []);
    } catch (err) {
      console.error('Error fetching principal changes:', err);
    }
  }, [pawn?.id]);

  // Load all initial data when modal opens
  useEffect(() => {
    if (isOpen && pawn?.id && !initialLoadComplete) {
      const loadInitialData = async () => {
        setLoading(true);
        setError(null);
        
        try {
          // Load both data sources concurrently
          await Promise.all([
            loadPrincipalChanges(),
            loadPaymentPeriods()
          ]);
          
          setInitialLoadComplete(true);
        } catch (err) {
          console.error('Error loading initial data:', err);
          setError('Không thể tải dữ liệu');
        } finally {
          setLoading(false);
        }
      };
      
      loadInitialData();
    }
    
    // Reset when modal closes
    if (!isOpen) {
      setInitialLoadComplete(false);
      setError(null);
    }
  }, [isOpen, pawn?.id, initialLoadComplete, loadPaymentPeriods, loadPrincipalChanges]);

  // Refresh data after any changes
  const handleDataChange = async () => {
    if (!pawn?.id) return;
    
    try {
      // Load data concurrently without showing loading state
      await Promise.all([
        loadPrincipalChanges(),
        loadPaymentPeriods()
      ]);
      
      // Reload pawn data to get updated information
      try {
        const { data: updatedPawn, error } = await getPawnById(pawn.id);
        if (!error && updatedPawn) {
          setCurrentPawn(updatedPawn);
        }
      } catch (err) {
        console.error('Error reloading pawn data:', err);
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  };

  // Generate estimated payment periods based on pawn contract
  const generateEstimatedPaymentPeriods = useCallback((pawn: PawnWithCustomerAndCollateral | null): PawnPaymentPeriod[] => {
    if (!pawn) return [];
    
    console.log('Generating estimated payment periods for pawn:', pawn.id, 'with principal changes:', principalChanges);
    
    const result: PawnPaymentPeriod[] = [];
    const loanDate = new Date(pawn.loan_date);
    const loanPeriod = pawn.loan_period; // Total loan period in days
    
    // Calculate end date of the contract
    const endDate = new Date(loanDate);
    endDate.setDate(endDate.getDate() + loanPeriod - 1);
    
    console.log('Loan period calculation:', {
      loanDate: loanDate.toISOString(),
      endDate: endDate.toISOString(),
      loanPeriod,
      interestValue: pawn.interest_value,
      interestType: pawn.interest_type,
      loanAmount: pawn.loan_amount
    });
    
    // Only create ONE period from loan start to loan end
    // Calculate expected interest for this period
    let expectedAmount = 0;
      
    if (principalChanges && principalChanges.length > 0) {
      // Use advanced calculation with principal changes
      try {
        expectedAmount = calculateInterestWithPrincipalChanges(
          pawn as any, // Type assertion for compatibility
          loanDate,
          endDate,
          principalChanges
        );
        console.log('Interest calculated with principal changes:', expectedAmount);
      } catch (error) {
        console.error('Error calculating interest with principal changes:', error);
        // Fallback to simple calculation
        expectedAmount = calculateInterestForPeriod(pawn, loanPeriod);
        console.log('Fallback interest calculation:', expectedAmount);
      }
    } else {
      // Use simple calculation
      // For estimated periods, always use loan_period to ensure consistency
      const days = loanPeriod; // Use loan_period directly instead of calculating from dates
      expectedAmount = calculateInterestForPeriod(pawn, days);
      console.log('Simple interest calculation:', expectedAmount, 'for', days, 'days');
    }
    
    // Ensure expectedAmount is not 0 or negative
    if (expectedAmount <= 0) {
      console.warn('Expected amount is 0 or negative, recalculating with simple method');
      expectedAmount = calculateInterestForPeriod(pawn, loanPeriod);
      console.log('Recalculated expected amount:', expectedAmount);
    }
    
    result.push({
      id: `estimated-1`, // Only one estimated period
      pawn_id: pawn.id,
      period_number: 1,
      start_date: loanDate.toISOString(),
      end_date: endDate.toISOString(),
      expected_amount: expectedAmount,
      actual_amount: 0,
      payment_date: null,
      notes: null,
      other_amount: 0
    });
    
    console.log('Generated estimated payment period:', result[0]);
    
    return result;
  }, [principalChanges]);

  // Merge estimated periods with actual periods from database
  const mergePaymentPeriods = useCallback((estimated: PawnPaymentPeriod[], actual: PawnPaymentPeriod[]): PawnPaymentPeriod[] => {
    const result: PawnPaymentPeriod[] = [];
    const actualByPeriod = new Map<number, PawnPaymentPeriod>();
    
    // Index actual periods by period number
    actual.forEach(period => {
      actualByPeriod.set(period.period_number, period);
    });
    
    // Start with estimated periods and replace with actual where available
    estimated.forEach(estimatedPeriod => {
      const actualPeriod = actualByPeriod.get(estimatedPeriod.period_number);
      
      if (actualPeriod) {
        // Use actual period data AS IS - no modifications to database records
        // IMPORTANT: We preserve ALL data from database exactly as it is
        result.push(actualPeriod);
        
        // Remove from map so we don't add it again
        actualByPeriod.delete(estimatedPeriod.period_number);
      } else {
        // Use estimated period (no actual data exists yet)
        // Only for these periods we apply principal changes calculation
        result.push(estimatedPeriod);
      }
    });
    
    // Add any remaining actual periods that don't have estimated counterparts
    // These are also preserved AS IS from database
    actualByPeriod.forEach(actualPeriod => {
      result.push(actualPeriod);
    });
    
    // Generate next estimated period if the latest period is paid
    if (actual.length > 0 && currentPawn) {
      // Sort actual periods by period number to find the latest
      const sortedActual = [...actual].sort((a, b) => b.period_number - a.period_number);
      const latestPeriod = sortedActual[0];
      
      // Check if latest period is fully paid
      if (latestPeriod.actual_amount >= latestPeriod.expected_amount) {
        // Generate next period
        const nextPeriodNumber = latestPeriod.period_number + 1;
        
        // Check if we already have this period in result
        const hasNextPeriod = result.some(p => p.period_number === nextPeriodNumber);
        
        if (!hasNextPeriod) {
          // Calculate start date (day after latest period end)
          const nextStartDate = new Date(latestPeriod.end_date);
          nextStartDate.setDate(nextStartDate.getDate() + 1);
          
          // Calculate end date (start date + loan_period - 1)
          const nextEndDate = new Date(nextStartDate);
          nextEndDate.setDate(nextEndDate.getDate() + currentPawn.loan_period - 1);
          
          // Calculate expected amount for next period
          let expectedAmount = 0;
          
          if (principalChanges && principalChanges.length > 0) {
            try {
              expectedAmount = calculateInterestWithPrincipalChanges(
                currentPawn as any,
                nextStartDate,
                nextEndDate,
                principalChanges
              );
            } catch (error) {
              console.error('Error calculating interest for next period with principal changes:', error);
              // Fallback to simple calculation
              expectedAmount = calculateInterestForPeriod(currentPawn, currentPawn.loan_period);
            }
          } else {
            // For next estimated periods, also use loan_period for consistency
            const days = currentPawn.loan_period; // Use loan_period directly
            expectedAmount = calculateInterestForPeriod(currentPawn, days);
          }
          
          // Ensure expectedAmount is not 0 or negative
          if (expectedAmount <= 0) {
            console.warn('Next period expected amount is 0 or negative, recalculating with simple method');
            expectedAmount = calculateInterestForPeriod(currentPawn, currentPawn.loan_period);
          }
          
          // Add next estimated period
          result.push({
            id: `estimated-${nextPeriodNumber}`,
            pawn_id: currentPawn.id,
            period_number: nextPeriodNumber,
            start_date: nextStartDate.toISOString(),
            end_date: nextEndDate.toISOString(),
            expected_amount: expectedAmount,
            actual_amount: 0,
            payment_date: null,
            notes: null,
            other_amount: 0
          });
        }
      }
    }
    
    // Sort by period number
    return result.sort((a, b) => a.period_number - b.period_number);
  }, [currentPawn, principalChanges]);

  // Generate combined payment periods
  const combinedPaymentPeriods = useMemo(() => {
    if (!currentPawn) return [];
    
    const estimated = generateEstimatedPaymentPeriods(currentPawn);
    const merged = mergePaymentPeriods(estimated, paymentPeriods);
    
    return merged;
  }, [currentPawn, paymentPeriods, principalChanges, generateEstimatedPaymentPeriods, mergePaymentPeriods]);

  // Calculate totals for display
  const calculateTotals = useMemo(() => {
    // For total expected, use combined periods (includes estimated)
    const totalExpected = combinedPaymentPeriods.reduce((sum, period) => sum + (period.expected_amount || 0), 0);
    
    // For total paid and debt calculation, use only actual payment periods from DB
    const totalPaid = paymentPeriods.reduce((sum, period) => sum + (period.actual_amount || 0), 0);
    const totalExpectedFromDB = paymentPeriods.reduce((sum, period) => sum + (period.expected_amount || 0), 0);
    const remainingAmount = totalPaid - totalExpectedFromDB;
    
    // Calculate next payment due date
    let nextPaymentDate = 'Chưa có';
    
    // Find the first unpaid period or the next estimated period
    const unpaidPeriod = combinedPaymentPeriods.find(period => 
      period.actual_amount < period.expected_amount
    );
    
    if (unpaidPeriod) {
      nextPaymentDate = formatDate(unpaidPeriod.end_date);
    }

    return {
      totalExpected,
      totalPaid,
      remainingAmount,
      nextPaymentDate
    };
  }, [combinedPaymentPeriods, paymentPeriods, formatDate]);

  // Format date for display
  const loanDateFormatted = currentPawn?.loan_date ? formatDate(currentPawn.loan_date) : 'N/A';
  const endDateFormatted = useMemo(() => {
    if (!currentPawn?.loan_date || !currentPawn?.loan_period) return 'N/A';
    const endDate = new Date(currentPawn.loan_date);
    endDate.setDate(endDate.getDate() + currentPawn.loan_period - 1);
    return formatDate(endDate.toISOString());
  }, [currentPawn?.loan_date, currentPawn?.loan_period, formatDate]);

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
      case PawnTransactionType.NEW_LOAN:
        return 'Tạo hợp đồng';
      case PawnTransactionType.PRINCIPAL_REPAYMENT:
        return 'Trả bớt gốc';
      case PawnTransactionType.PAYMENT:
        return 'Đóng lãi phí';
      case PawnTransactionType.CONTRACT_CLOSE:
        return 'Đóng hợp đồng';
      case PawnTransactionType.CONTRACT_ROTATION:
        return 'Xoay hợp đồng';
      case 'payment_cancel':
        return 'Hủy đóng lãi phí';
      case 'contract_reopen':
        return 'Mở lại hợp đồng';
      default:
        return 'Giao dịch khác';
    }
  };

  // Helper function to calculate history totals
  const historyTotals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;

    pawnHistory.forEach(history => {
      totalDebit += history.debit_amount || 0;
      totalCredit += history.credit_amount || 0;
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
            paymentPeriods={paymentPeriods}
            combinedPaymentPeriods={combinedPaymentPeriods}
            loading={loading}
            error={error}
            showPaymentForm={showPaymentForm}
            setShowPaymentForm={setShowPaymentForm}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            calculateDaysBetween={calculateDaysBetween}
            onDataChange={handleDataChange}
            principalChanges={principalChanges}
          />
        );
      case 'principal-repayment':
        return (
          <PrincipalRepaymentTab
            pawn={currentPawn}
            refreshRepayments={refreshRepayments}
            setRefreshRepayments={setRefreshRepayments}
            onDataChange={handleDataChange}
          />
        );
      case 'additional-loan':
        return (
          <AdditionalLoanTab
            pawn={currentPawn}
            onDataChange={handleDataChange}
          />
        );
      case 'extension':
        return (
          <ExtensionTab
            pawn={currentPawn}
            onDataChange={handleDataChange}
          />
        );
      case 'redeem':
        return (
          <RedeemTab
            pawn={currentPawn}
            onClose={onClose}
          />
        );
      case 'liquidation':
        return (
          <LiquidationTab
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
                        {pawnHistory.map((history, index) => (
                          <tr key={history.id}>
                            <td className="px-4 py-3 text-sm text-gray-700 text-center">{index + 1}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(history.created_at)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{getTransactionTypeDisplay(history.transaction_type)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                              {history.debit_amount && history.debit_amount > 0 ? formatCurrency(history.debit_amount) : ""}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right text-green-600">
                              {history.credit_amount && history.credit_amount > 0 ? formatCurrency(history.credit_amount) : ""}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">{history.notes || '-'}</td>
                          </tr>
                        ))}
                        
                        {/* Initial loan entry */}
                        <tr>
                          <td className="px-4 py-3 text-sm text-gray-700 text-center">{pawnHistory.length + 1}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{formatDate(currentPawn?.loan_date || '')}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">Tạo hợp đồng</td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                            {formatCurrency(currentPawn?.loan_amount || 0)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-right">0</td>
                          <td className="px-4 py-3 text-sm text-gray-700">Cho cầm</td>
                        </tr>
                        
                        {/* Summary rows */}
                        <tr className="bg-amber-50">
                          <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Tổng Tiền</td>
                          <td className="px-4 py-2 text-sm font-medium text-right text-red-600">
                            {formatCurrency(historyTotals.totalDebit + (currentPawn?.loan_amount || 0))}
                          </td>
                          <td className="px-4 py-2 text-sm font-medium text-right text-green-600">
                            {formatCurrency(historyTotals.totalCredit)}
                          </td>
                          <td></td>
                        </tr>
                        <tr className="bg-amber-100">
                          <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Chênh lệch</td>
                          <td colSpan={2} className="px-4 py-2 text-sm font-medium text-right">
                            <span className={(historyTotals.totalDebit + (currentPawn?.loan_amount || 0)) - historyTotals.totalCredit >= 0 ? "text-red-600" : "text-green-600"}>
                              {formatCurrency(historyTotals.totalCredit - (historyTotals.totalDebit + (currentPawn?.loan_amount || 0)))}
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] md:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hợp đồng cầm đồ</DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          {/* Thông tin khách hàng */}
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">{currentPawn?.customer?.name || 'Khách hàng'}</h3>
            <h3 className="font-medium">Tổng lãi phí: {formatCurrency(calculateTotals.totalExpected)}</h3>
          </div>
          
          {/* Tổng hợp chi tiết */}
          <div className="grid grid-cols-2 gap-8 my-4">
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tiền cầm</td>
                    <td className="py-1 px-2 text-right border" colSpan={2}>{formatCurrency(currentPawn?.loan_amount || 0)}</td>
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
                    <td className="py-1 px-2 border font-bold">Đã thanh toán</td>
                    <td className="py-1 px-2 text-right border">{formatCurrency(calculateTotals.totalPaid)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">{calculateTotals.remainingAmount > 0 ? 'Tiền thừa' : 'Nợ cũ'}</td>
                    <td className={`py-1 px-2 text-right border ${calculateTotals.remainingAmount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Math.abs(calculateTotals.remainingAmount))}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Ngày trả lãi gần nhất</td>
                    <td className="py-1 px-2 text-right border">{calculateTotals.nextPaymentDate}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Trạng thái</td>
                    <td className="py-1 px-2 text-right border">Đang cầm</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabs */}
          <PawnActionTabs
            tabs={DEFAULT_PAWN_TABS}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
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