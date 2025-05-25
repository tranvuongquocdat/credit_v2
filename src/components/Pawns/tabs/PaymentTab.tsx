'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { PawnPaymentForm } from '../PawnPaymentForm';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { PawnPaymentPeriod } from '@/models/pawn-payment';
import { toast } from '@/components/ui/use-toast';
import { PrincipalChange, calculateInterestWithPrincipalChanges } from '@/lib/interest-calculator';
import { getPrincipalChangesForPawn } from '@/lib/pawn-principal-changes';

type PaymentTabProps = {
  pawn: PawnWithCustomerAndCollateral | null;
  paymentPeriods: PawnPaymentPeriod[];
  combinedPaymentPeriods: PawnPaymentPeriod[];
  loading: boolean;
  error: string | null;
  showPaymentForm: boolean;
  setShowPaymentForm: (show: boolean) => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  calculateDaysBetween: (start: Date, end: Date) => number;
  onDataChange?: () => void;
  principalChanges?: PrincipalChange[];
};

export function PaymentTab({
  pawn,
  paymentPeriods,
  combinedPaymentPeriods,
  loading,
  error,
  showPaymentForm,
  setShowPaymentForm,
  formatCurrency,
  formatDate,
  calculateDaysBetween,
  onDataChange,
  principalChanges
}: PaymentTabProps) {
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());

  // Toggle period selection
  const togglePeriodSelection = (periodId: string) => {
    setSelectedPeriods(prev => 
      prev.includes(periodId) 
        ? prev.filter(id => id !== periodId)
        : [...prev, periodId]
    );
  };

  // Toggle period expansion
  const togglePeriodExpansion = (periodId: string) => {
    setExpandedPeriods(prev => {
      const newSet = new Set(prev);
      if (newSet.has(periodId)) {
        newSet.delete(periodId);
      } else {
        newSet.add(periodId);
      }
      return newSet;
    });
  };

  // Select all periods
  const selectAllPeriods = () => {
    const unpaidPeriods = combinedPaymentPeriods
      .filter(period => !period.payment_date)
      .map(period => period.id);
    setSelectedPeriods(unpaidPeriods);
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedPeriods([]);
  };

  // Calculate total amount for selected periods
  const calculateTotalAmount = () => {
    return combinedPaymentPeriods
      .filter(period => selectedPeriods.includes(period.id))
      .reduce((total, period) => total + (period.expected_amount || 0), 0);
  };

  // Get period status
  const getPeriodStatus = (period: PawnPaymentPeriod) => {
    if (period.payment_date) {
      return { status: 'paid', label: 'Đã thanh toán', color: 'text-green-600 bg-green-50' };
    }
    
    const endDate = new Date(period.end_date);
    const today = new Date();
    
    if (endDate < today) {
      return { status: 'overdue', label: 'Quá hạn', color: 'text-red-600 bg-red-50' };
    }
    
    return { status: 'pending', label: 'Chưa thanh toán', color: 'text-yellow-600 bg-yellow-50' };
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Đang tải dữ liệu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header with actions */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Kỳ thanh toán lãi phí</h3>
        <div className="flex space-x-2">
          <button
            onClick={selectAllPeriods}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Chọn tất cả
          </button>
          <button
            onClick={clearAllSelections}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Bỏ chọn
          </button>
        </div>
      </div>

      {/* Selected periods summary */}
      {selectedPeriods.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium text-blue-900">
                Đã chọn {selectedPeriods.length} kỳ thanh toán
              </p>
              <p className="text-blue-700">
                Tổng tiền: {formatCurrency(calculateTotalAmount())}
              </p>
            </div>
            <button
              onClick={() => setShowPaymentForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Thanh toán
            </button>
          </div>
        </div>
      )}

      {/* Payment periods list */}
      <div className="space-y-2">
        {combinedPaymentPeriods.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Chưa có kỳ thanh toán nào</p>
          </div>
        ) : (
          combinedPaymentPeriods.map((period) => {
            const status = getPeriodStatus(period);
            const isExpanded = expandedPeriods.has(period.id);
            const isSelected = selectedPeriods.includes(period.id);
            const canSelect = !period.payment_date; // Only allow selection of unpaid periods

            return (
              <div
                key={period.id}
                className={`border rounded-lg ${isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {canSelect && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => togglePeriodSelection(period.id)}
                        />
                      )}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">
                            Kỳ {period.period_number}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          {formatDate(period.start_date)} - {formatDate(period.end_date)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="font-medium">
                          {formatCurrency(period.expected_amount || 0)}
                        </div>
                        {period.payment_date && (
                          <div className="text-sm text-gray-600">
                            Đã thanh toán: {formatDate(period.payment_date)}
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={() => togglePeriodExpansion(period.id)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <ChevronDown 
                          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Số ngày:</span>
                          <span className="ml-2 font-medium">
                            {calculateDaysBetween(new Date(period.start_date), new Date(period.end_date))}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Tiền lãi dự kiến:</span>
                          <span className="ml-2 font-medium">
                            {formatCurrency(period.expected_amount || 0)}
                          </span>
                        </div>
                        {period.actual_amount !== undefined && period.actual_amount !== period.expected_amount && (
                          <div>
                            <span className="text-gray-600">Tiền thực tế:</span>
                            <span className="ml-2 font-medium">
                              {formatCurrency(period.actual_amount)}
                            </span>
                          </div>
                        )}
                        {period.other_amount && (
                          <div>
                            <span className="text-gray-600">Tiền khác:</span>
                            <span className="ml-2 font-medium">
                              {formatCurrency(period.other_amount)}
                            </span>
                          </div>
                        )}
                        {period.notes && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Ghi chú:</span>
                            <span className="ml-2">{period.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Payment form modal */}
      {showPaymentForm && pawn && (
        <PawnPaymentForm
          isOpen={showPaymentForm}
          onClose={() => setShowPaymentForm(false)}
          pawn={pawn}
          selectedPeriods={selectedPeriods.map(id => 
            combinedPaymentPeriods.find(p => p.id === id)!
          ).filter(Boolean)}
          onSuccess={() => {
            setShowPaymentForm(false);
            setSelectedPeriods([]);
            onDataChange?.();
            toast({
              title: "Thành công",
              description: "Đã ghi nhận thanh toán lãi phí"
            });
          }}
        />
      )}
    </div>
  );
} 