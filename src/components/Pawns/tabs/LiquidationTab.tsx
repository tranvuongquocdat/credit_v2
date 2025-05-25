'use client';

import { useState } from 'react';
import { PawnStatus, PawnWithCustomerAndCollateral } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { updatePawn } from '@/lib/pawn';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface LiquidationTabProps {
  pawn: PawnWithCustomerAndCollateral;
  onClose: () => void;
}

export function LiquidationTab({ pawn, onClose }: LiquidationTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [liquidationData, setLiquidationData] = useState({
    liquidation_amount: 0,
    liquidation_date: new Date().toISOString().split('T')[0],
    liquidation_notes: ''
  });

  const handleLiquidation = async () => {
    setLoading(true);
    try {
      // Update pawn status to liquidated
      const { error } = await updatePawn(pawn.id, {
        status: PawnStatus.LIQUIDATED,
        notes: `Thanh lý ngày ${liquidationData.liquidation_date}. Số tiền thu được: ${formatCurrency(liquidationData.liquidation_amount)}. ${liquidationData.liquidation_notes}`
      });

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã thanh lý tài sản thành công"
      });

      onClose();
    } catch (error) {
      console.error('Error liquidating pawn:', error);
      toast({
        title: "Lỗi",
        description: "Không thể thanh lý tài sản",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateLoss = () => {
    return Math.max(0, pawn.loan_amount - liquidationData.liquidation_amount);
  };

  const calculateProfit = () => {
    return Math.max(0, liquidationData.liquidation_amount - pawn.loan_amount);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-xl font-bold text-red-800 mb-4">Thanh lý tài sản</h3>
        
        <div className="space-y-6">
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
                <div className="flex justify-between">
                  <span>Số tiền gốc:</span>
                  <span className="font-medium text-red-600">{formatCurrency(pawn.loan_amount)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Thông tin thanh lý</h4>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="liquidation_amount">Số tiền thu được từ thanh lý</Label>
                  <Input
                    id="liquidation_amount"
                    type="number"
                    value={liquidationData.liquidation_amount}
                    onChange={(e) => setLiquidationData(prev => ({
                      ...prev,
                      liquidation_amount: Number(e.target.value)
                    }))}
                    placeholder="Nhập số tiền thu được"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="liquidation_date">Ngày thanh lý</Label>
                  <Input
                    id="liquidation_date"
                    type="date"
                    value={liquidationData.liquidation_date}
                    onChange={(e) => setLiquidationData(prev => ({
                      ...prev,
                      liquidation_date: e.target.value
                    }))}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="liquidation_notes">Ghi chú thanh lý</Label>
                  <Textarea
                    id="liquidation_notes"
                    value={liquidationData.liquidation_notes}
                    onChange={(e) => setLiquidationData(prev => ({
                      ...prev,
                      liquidation_notes: e.target.value
                    }))}
                    placeholder="Ghi chú về quá trình thanh lý..."
                    className="mt-1"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Calculation Summary */}
          {liquidationData.liquidation_amount > 0 && (
            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Tổng kết thanh lý</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Số tiền gốc:</span>
                  <span className="font-medium">{formatCurrency(pawn.loan_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Số tiền thu được:</span>
                  <span className="font-medium">{formatCurrency(liquidationData.liquidation_amount)}</span>
                </div>
                <div className="border-t pt-2">
                  {calculateLoss() > 0 ? (
                    <div className="flex justify-between text-red-600 font-bold">
                      <span>Tổn thất:</span>
                      <span>-{formatCurrency(calculateLoss())}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-green-600 font-bold">
                      <span>Lợi nhuận:</span>
                      <span>+{formatCurrency(calculateProfit())}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-medium text-red-800 mb-2">Cảnh báo quan trọng</h4>
            <ul className="text-sm text-red-700 space-y-1">
              <li>• Thanh lý tài sản là biện pháp cuối cùng khi khách hàng không thể chuộc đồ</li>
              <li>• Sau khi thanh lý, hợp đồng sẽ được đóng và không thể hoàn tác</li>
              <li>• Cần tuân thủ đúng quy định pháp luật về thanh lý tài sản thế chấp</li>
              <li>• Khách hàng cần được thông báo trước khi thực hiện thanh lý</li>
            </ul>
          </div>

          <div className="flex justify-center space-x-4">
            <Button
              onClick={() => setShowConfirmDialog(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-8 py-2"
              disabled={loading || liquidationData.liquidation_amount <= 0}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận thanh lý'}
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
            <DialogTitle>Xác nhận thanh lý tài sản</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4 text-red-600 font-medium">
              ⚠️ Bạn có chắc chắn muốn thanh lý tài sản cho hợp đồng <strong>{pawn.contract_code}</strong>?
            </p>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Số tiền gốc:</span>
                  <span className="font-medium">{formatCurrency(pawn.loan_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Số tiền thu được:</span>
                  <span className="font-medium">{formatCurrency(liquidationData.liquidation_amount)}</span>
                </div>
                <div className="border-t pt-2">
                  {calculateLoss() > 0 ? (
                    <div className="flex justify-between text-red-600 font-bold">
                      <span>Tổn thất:</span>
                      <span>-{formatCurrency(calculateLoss())}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-green-600 font-bold">
                      <span>Lợi nhuận:</span>
                      <span>+{formatCurrency(calculateProfit())}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              Thao tác này không thể hoàn tác. Hợp đồng sẽ được đóng sau khi thanh lý.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowConfirmDialog(false)}
              variant="outline"
            >
              Hủy bỏ
            </Button>
            <Button
              onClick={handleLiquidation}
              className="bg-red-600 hover:bg-red-700"
              disabled={loading}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận thanh lý'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 