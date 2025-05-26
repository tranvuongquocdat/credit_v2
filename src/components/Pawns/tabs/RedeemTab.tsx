'use client';

import { useEffect, useState } from 'react';
import { PawnStatus, PawnWithCustomerAndCollateral } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { calculatePawnInterestAmount, calculateDailyRateForPawn } from '@/lib/interest-calculator';
import { formatCurrency } from '@/lib/utils';
import { PawnPaymentPeriod } from '@/models/pawn-payment';
import { getPawnPaymentPeriods, savePaymentWithOtherAmount, deletePawnPaymentPeriod } from '@/lib/pawn-payment';
import { updatePawn } from '@/lib/pawn';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface RedeemTabProps {
  pawn: PawnWithCustomerAndCollateral;
  onClose: () => void;
}

export function RedeemTab({ pawn, onClose }: RedeemTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentPeriods, setPaymentPeriods] = useState<PawnPaymentPeriod[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    loadPaymentPeriods();
  }, [pawn.id]);

  const loadPaymentPeriods = async () => {
    try {
      const { data, error } = await getPawnPaymentPeriods(pawn.id);
      if (error) throw error;
      setPaymentPeriods(data || []);
    } catch (error) {
      console.error('Error loading payment periods:', error);
    }
  };

  // Calculate outstanding interest
  const calculateOutstandingInterest = () => {
    const unpaidPeriods = paymentPeriods.filter(period => !period.payment_date);
    return unpaidPeriods.reduce((total, period) => {
      const startDate = new Date(period.start_date);
      const endDate = new Date(period.end_date);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      return total + calculatePawnInterestAmount(pawn, days);
    }, 0);
  };

  // Calculate interest from last payment to today
  const calculateCurrentInterest = () => {
    const lastPayment = paymentPeriods
      .filter(period => period.payment_date)
      .sort((a, b) => new Date(b.payment_date!).getTime() - new Date(a.payment_date!).getTime())[0];
    
    const startDate = lastPayment 
      ? new Date(lastPayment.payment_date!)
      : new Date(pawn.loan_date);
    
    const today = new Date();
    const days = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return calculatePawnInterestAmount(pawn, days);
  };

  const handleRedeem = async () => {
    setLoading(true);
    try {
      // Update pawn status to closed
      const { error } = await updatePawn(pawn.id, {
        status: PawnStatus.CLOSED
      });

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã chuộc đồ thành công"
      });

      onClose();
    } catch (error) {
      console.error('Error redeeming pawn:', error);
      toast({
        title: "Lỗi",
        description: "Không thể chuộc đồ",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const outstandingInterest = calculateOutstandingInterest();
  const currentInterest = calculateCurrentInterest();
  const totalAmount = pawn.loan_amount + outstandingInterest + currentInterest;

  return (
    <div className="p-6 space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <h3 className="text-xl font-bold text-green-800 mb-4">Chuộc đồ</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Thông tin hợp đồng</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Mã hợp đồng:</span>
                  <span className="font-medium">{pawn.contract_code || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Khách hàng:</span>
                  <span className="font-medium">{pawn.customer?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ngày cầm:</span>
                  <span className="font-medium">
                    {new Date(pawn.loan_date).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Tài sản:</span>
                  <span className="font-medium">{pawn.collateral_detail || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Tính toán thanh toán</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Số tiền gốc:</span>
                  <span className="font-medium">{formatCurrency(pawn.loan_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Lãi phí chưa thanh toán:</span>
                  <span className="font-medium">{formatCurrency(outstandingInterest)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Lãi phí hiện tại:</span>
                  <span className="font-medium">{formatCurrency(currentInterest)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Tổng cần thanh toán:</span>
                  <span className="text-green-600">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">Lưu ý quan trọng</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Khách hàng cần thanh toán đầy đủ số tiền gốc và lãi phí</li>
              <li>• Sau khi chuộc đồ, hợp đồng sẽ được đóng</li>
              <li>• Tài sản thế chấp sẽ được trả lại cho khách hàng</li>
              <li>• Thao tác này không thể hoàn tác</li>
            </ul>
          </div>

          <div className="flex justify-center space-x-4">
            <Button
              onClick={() => setShowConfirmDialog(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-2"
              disabled={loading}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận chuộc đồ'}
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="px-8 py-2"
            >
              Hủy bỏ
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận chuộc đồ</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4">
              Bạn có chắc chắn muốn thực hiện chuộc đồ cho hợp đồng <strong>{pawn.contract_code}</strong>?
            </p>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Tổng số tiền cần thu:</span>
                  <span className="font-bold text-green-600">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowConfirmDialog(false)}
              variant="outline"
            >
              Hủy bỏ
            </Button>
            <Button
              onClick={handleRedeem}
              className="bg-green-600 hover:bg-green-700"
              disabled={loading}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 