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
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { PawnPaymentPeriod } from '@/models/pawn-payment';
import { getPawnPaymentPeriods, savePaymentWithOtherAmount } from '@/lib/pawn-payment';
import { getPawnInterestDisplayString, calculatePawnInterestAmount as calculateInterestForPeriod, calculateInterestWithPrincipalChanges, PrincipalChange } from '@/lib/interest-calculator';
import { addPrincipalRepayment, updatePawnPrincipal } from '@/lib/pawn-principal-repayment';
import { addAdditionalLoan, updatePawnWithAdditionalLoan } from '@/lib/pawn-additional-loan';
import { addExtension, updatePawnEndDate } from '@/lib/pawn-extension';
import { PawnActionTabs, DEFAULT_PAWN_TABS, PawnTabId } from './PawnActionTabs';
import { AdditionalLoanTab, BadPawnTab, RedeemTab, DocumentsTab, ExtensionTab, PaymentTab, PrincipalRepaymentTab, LiquidationTab } from './tabs';
import { getPawnById } from '@/lib/pawn';
import { getPrincipalChangesForPawn } from '@/lib/pawn-principal-changes';
import { PawnAmountHistory, PawnTransactionType, getPawnAmountHistory } from '@/lib/pawn-amount-history';

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

  // Load payment periods and principal changes when modal opens
  useEffect(() => {
    if (isOpen && pawn?.id) {
      loadPaymentPeriods();
      loadPrincipalChanges();
    }
  }, [isOpen, pawn?.id]);

  const loadPaymentPeriods = async () => {
    if (!pawn?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await getPawnPaymentPeriods(pawn.id);
      
      if (error) throw error;
      
      setPaymentPeriods(data || []);
    } catch (err) {
      console.error('Error loading payment periods:', err);
      setError('Không thể tải dữ liệu kỳ thanh toán');
    } finally {
      setLoading(false);
    }
  };

  const loadPrincipalChanges = async () => {
    if (!pawn?.id) return;
    
    try {
      const { data, error } = await getPrincipalChangesForPawn(pawn.id);
      
      if (error) throw error;
      
      setPrincipalChanges(data || []);
    } catch (err) {
      console.error('Error loading principal changes:', err);
    }
  };

  // Refresh data after any changes
  const handleDataChange = async () => {
    await loadPaymentPeriods();
    await loadPrincipalChanges();
    
    // Reload pawn data to get updated information
    try {
      const { data: updatedPawn, error } = await getPawnById(pawn.id);
      if (!error && updatedPawn) {
        setCurrentPawn(updatedPawn);
      }
    } catch (err) {
      console.error('Error reloading pawn data:', err);
    }
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return format(new Date(dateString), 'dd/MM/yyyy', { locale: vi });
  };

  // Calculate days between dates
  const calculateDaysBetween = (start: Date, end: Date): number => {
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Combine payment periods with calculated interest
  const combinedPaymentPeriods = useMemo(() => {
    if (!currentPawn || !paymentPeriods.length) return [];

    return paymentPeriods.map(period => {
      const startDate = new Date(period.start_date);
      const endDate = new Date(period.end_date);
      
      // Calculate expected interest for this period
      let expectedInterest = 0;
      
      if (principalChanges && principalChanges.length > 0) {
        // Use the advanced calculation with principal changes
        expectedInterest = calculateInterestWithPrincipalChanges(
          currentPawn as any, // Cast to Credit-like object for calculation
          startDate,
          endDate,
          principalChanges
        );
      } else {
        // Use simple calculation
        const days = calculateDaysBetween(startDate, endDate);
        expectedInterest = calculateInterestForPeriod(currentPawn, days);
      }

      return {
        ...period,
        expected_amount: expectedInterest
      };
    });
  }, [currentPawn, paymentPeriods, principalChanges]);

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
            <h3 className="text-lg font-medium mb-4">Lịch sử giao dịch</h3>
            <p className="text-gray-500">Chức năng đang được phát triển...</p>
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl font-bold">
            Quản lý hợp đồng cầm đồ - {currentPawn?.contract_code || 'N/A'}
          </DialogTitle>
          <div className="text-sm text-gray-600 space-y-1">
            <div>Khách hàng: {currentPawn?.customer?.name || 'N/A'}</div>
            <div>Số tiền cầm: {formatCurrency(currentPawn?.loan_amount || 0)}</div>
            <div>Lãi suất: {getPawnInterestDisplayString(currentPawn)}</div>
            <div>Ngày cầm: {currentPawn?.loan_date ? formatDate(currentPawn.loan_date) : 'N/A'}</div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <PawnActionTabs
            tabs={DEFAULT_PAWN_TABS}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            className="flex-shrink-0"
          />
          
          <div className="flex-1 overflow-y-auto">
            {renderTabContent()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 