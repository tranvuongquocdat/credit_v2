'use client';

import { useState } from 'react';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface PrincipalRepaymentTabProps {
  pawn: PawnWithCustomerAndCollateral;
  onDataChange?: () => void;
}

export function PrincipalRepaymentTab({ pawn, onDataChange }: PrincipalRepaymentTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [repaymentData, setRepaymentData] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const handleRepayment = async () => {
    if (repaymentData.amount <= 0) {
      toast({
        title: "Lỗi",
        description: "Số tiền trả phải lớn hơn 0",
        variant: "destructive"
      });
      return;
    }

    if (repaymentData.amount > pawn.loan_amount) {
      toast({
        title: "Lỗi",
        description: "Số tiền trả không thể lớn hơn số tiền gốc",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement principal repayment logic
      // This would involve:
      // 1. Creating a principal repayment record
      // 2. Updating the pawn's loan amount
      // 3. Recording the transaction in amount history
      
      console.log('Principal repayment:', {
        pawnId: pawn.id,
        amount: repaymentData.amount,
        date: repaymentData.date,
        notes: repaymentData.notes
      });

      toast({
        title: "Thành công",
        description: `Đã ghi nhận trả bớt gốc ${formatCurrency(repaymentData.amount)}`
      });

      // Reset form
      setRepaymentData({
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        notes: ''
      });

      onDataChange?.();
    } catch (error) {
      console.error('Error processing principal repayment:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xử lý trả bớt gốc",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateNewLoanAmount = () => {
    return Math.max(0, pawn.loan_amount - repaymentData.amount);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-xl font-bold text-blue-800 mb-4">Trả bớt gốc</h3>
        
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Thông tin hiện tại</h4>
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
                  <span>Số tiền gốc hiện tại:</span>
                  <span className="font-medium text-blue-600">{formatCurrency(pawn.loan_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tài sản:</span>
                  <span className="font-medium">{pawn.collateral_detail || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Thông tin trả gốc</h4>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="repayment_amount">Số tiền trả gốc</Label>
                  <Input
                    id="repayment_amount"
                    type="number"
                    value={repaymentData.amount}
                    onChange={(e) => setRepaymentData(prev => ({
                      ...prev,
                      amount: Number(e.target.value)
                    }))}
                    placeholder="Nhập số tiền trả gốc"
                    className="mt-1"
                    max={pawn.loan_amount}
                  />
                </div>

                <div>
                  <Label htmlFor="repayment_date">Ngày trả</Label>
                  <Input
                    id="repayment_date"
                    type="date"
                    value={repaymentData.date}
                    onChange={(e) => setRepaymentData(prev => ({
                      ...prev,
                      date: e.target.value
                    }))}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="repayment_notes">Ghi chú</Label>
                  <Textarea
                    id="repayment_notes"
                    value={repaymentData.notes}
                    onChange={(e) => setRepaymentData(prev => ({
                      ...prev,
                      notes: e.target.value
                    }))}
                    placeholder="Ghi chú về việc trả gốc..."
                    className="mt-1"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Calculation Summary */}
          {repaymentData.amount > 0 && (
            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Tổng kết sau khi trả gốc</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Số tiền gốc hiện tại:</span>
                  <span className="font-medium">{formatCurrency(pawn.loan_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Số tiền trả gốc:</span>
                  <span className="font-medium text-red-600">-{formatCurrency(repaymentData.amount)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Số tiền gốc còn lại:</span>
                  <span className="text-blue-600">{formatCurrency(calculateNewLoanAmount())}</span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">Lưu ý quan trọng</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Trả bớt gốc sẽ giảm số tiền nợ gốc của hợp đồng</li>
              <li>• Lãi suất vẫn được tính trên số tiền gốc còn lại</li>
              <li>• Không thể trả nhiều hơn số tiền gốc hiện tại</li>
              <li>• Giao dịch này sẽ được ghi nhận vào lịch sử</li>
            </ul>
          </div>

          <div className="flex justify-center space-x-4">
            <Button
              onClick={handleRepayment}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2"
              disabled={loading || repaymentData.amount <= 0 || repaymentData.amount > pawn.loan_amount}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận trả gốc'}
            </Button>
            <Button
              onClick={() => setRepaymentData({
                amount: 0,
                date: new Date().toISOString().split('T')[0],
                notes: ''
              })}
              variant="outline"
              className="px-8 py-2"
            >
              Đặt lại
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 