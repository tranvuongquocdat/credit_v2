'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { PawnPaymentPeriod } from '@/models/pawn-payment';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface PawnPaymentFormProps {
  isOpen: boolean;
  onClose: () => void;
  pawn: PawnWithCustomerAndCollateral;
  selectedPeriods: PawnPaymentPeriod[];
  onSuccess: () => void;
}

export function PawnPaymentForm({
  isOpen,
  onClose,
  pawn,
  selectedPeriods,
  onSuccess
}: PawnPaymentFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    actual_amount: 0,
    other_amount: 0,
    notes: ''
  });

  // Calculate total expected amount
  const totalExpectedAmount = selectedPeriods.reduce((total, period) => 
    total + (period.expected_amount || 0), 0
  );

  // Calculate total actual amount
  const totalActualAmount = paymentData.actual_amount + paymentData.other_amount;

  const handleSubmit = async () => {
    if (paymentData.actual_amount <= 0) {
      toast({
        title: "Lỗi",
        description: "Số tiền thanh toán phải lớn hơn 0",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement payment logic
      // This would involve:
      // 1. Creating payment records for each selected period
      // 2. Updating payment periods with payment information
      // 3. Recording the transaction in amount history
      
      console.log('Payment data:', {
        pawnId: pawn.id,
        selectedPeriods: selectedPeriods.map(p => p.id),
        paymentDate: paymentData.payment_date,
        actualAmount: paymentData.actual_amount,
        otherAmount: paymentData.other_amount,
        notes: paymentData.notes
      });

      toast({
        title: "Thành công",
        description: `Đã ghi nhận thanh toán ${formatCurrency(totalActualAmount)}`
      });

      onSuccess();
    } catch (error) {
      console.error('Error processing payment:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xử lý thanh toán",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPaymentData({
      payment_date: new Date().toISOString().split('T')[0],
      actual_amount: 0,
      other_amount: 0,
      notes: ''
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thanh toán lãi phí</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Contract Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium text-gray-700 mb-2">Thông tin hợp đồng</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span>Mã hợp đồng:</span>
                <span className="font-medium">{pawn.contract_code || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Khách hàng:</span>
                <span className="font-medium">{pawn.customer?.name || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Selected Periods */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-700 mb-2">Kỳ thanh toán được chọn</h4>
            <div className="space-y-2">
              {selectedPeriods.map((period) => (
                <div key={period.id} className="flex justify-between text-sm">
                  <span>Kỳ {period.period_number}</span>
                  <span className="font-medium">{formatCurrency(period.expected_amount || 0)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Tổng cộng:</span>
                <span className="text-blue-600">{formatCurrency(totalExpectedAmount)}</span>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="payment_date">Ngày thanh toán</Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentData.payment_date}
                onChange={(e) => setPaymentData(prev => ({
                  ...prev,
                  payment_date: e.target.value
                }))}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="actual_amount">Số tiền lãi phí</Label>
              <Input
                id="actual_amount"
                type="number"
                value={paymentData.actual_amount}
                onChange={(e) => setPaymentData(prev => ({
                  ...prev,
                  actual_amount: Number(e.target.value)
                }))}
                placeholder="Nhập số tiền lãi phí"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="other_amount">Số tiền khác (nếu có)</Label>
              <Input
                id="other_amount"
                type="number"
                value={paymentData.other_amount}
                onChange={(e) => setPaymentData(prev => ({
                  ...prev,
                  other_amount: Number(e.target.value)
                }))}
                placeholder="Phí phạt, phí dịch vụ..."
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="notes">Ghi chú</Label>
              <Textarea
                id="notes"
                value={paymentData.notes}
                onChange={(e) => setPaymentData(prev => ({
                  ...prev,
                  notes: e.target.value
                }))}
                placeholder="Ghi chú về thanh toán..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          {/* Payment Summary */}
          {totalActualAmount > 0 && (
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-medium text-green-700 mb-2">Tổng kết thanh toán</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Số tiền lãi phí:</span>
                  <span className="font-medium">{formatCurrency(paymentData.actual_amount)}</span>
                </div>
                {paymentData.other_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Số tiền khác:</span>
                    <span className="font-medium">{formatCurrency(paymentData.other_amount)}</span>
                  </div>
                )}
                <div className="border-t pt-1 flex justify-between font-bold">
                  <span>Tổng thanh toán:</span>
                  <span className="text-green-600">{formatCurrency(totalActualAmount)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>So với dự kiến:</span>
                  <span className={totalActualAmount >= totalExpectedAmount ? 'text-green-600' : 'text-red-600'}>
                    {totalActualAmount >= totalExpectedAmount ? '+' : ''}{formatCurrency(totalActualAmount - totalExpectedAmount)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            Hủy bỏ
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || paymentData.actual_amount <= 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 