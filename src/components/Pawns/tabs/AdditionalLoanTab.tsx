'use client';

import { useState } from 'react';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface AdditionalLoanTabProps {
  pawn: PawnWithCustomerAndCollateral;
  onDataChange?: () => void;
}

export function AdditionalLoanTab({ pawn, onDataChange }: AdditionalLoanTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loanData, setLoanData] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const handleAdditionalLoan = async () => {
    if (loanData.amount <= 0) {
      toast({
        title: "Lỗi",
        description: "Số tiền vay thêm phải lớn hơn 0",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement additional loan logic
      // This would involve:
      // 1. Creating an additional loan record
      // 2. Updating the pawn's loan amount
      // 3. Recording the transaction in amount history
      
      console.log('Additional loan:', {
        pawnId: pawn.id,
        amount: loanData.amount,
        date: loanData.date,
        notes: loanData.notes
      });

      toast({
        title: "Thành công",
        description: `Đã ghi nhận vay thêm ${formatCurrency(loanData.amount)}`
      });

      // Reset form
      setLoanData({
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        notes: ''
      });

      onDataChange?.();
    } catch (error) {
      console.error('Error processing additional loan:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xử lý vay thêm",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateNewLoanAmount = () => {
    return pawn.loan_amount + loanData.amount;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <h3 className="text-xl font-bold text-purple-800 mb-4">Vay thêm</h3>
        
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
                  <span className="font-medium text-purple-600">{formatCurrency(pawn.loan_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tài sản:</span>
                  <span className="font-medium">{pawn.collateral_detail || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ngày cầm:</span>
                  <span className="font-medium">
                    {new Date(pawn.loan_date).toLocaleDateString('vi-VN')}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Thông tin vay thêm</h4>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="loan_amount">Số tiền vay thêm</Label>
                  <Input
                    id="loan_amount"
                    type="number"
                    value={loanData.amount}
                    onChange={(e) => setLoanData(prev => ({
                      ...prev,
                      amount: Number(e.target.value)
                    }))}
                    placeholder="Nhập số tiền vay thêm"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="loan_date">Ngày vay thêm</Label>
                  <Input
                    id="loan_date"
                    type="date"
                    value={loanData.date}
                    onChange={(e) => setLoanData(prev => ({
                      ...prev,
                      date: e.target.value
                    }))}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="loan_notes">Ghi chú</Label>
                  <Textarea
                    id="loan_notes"
                    value={loanData.notes}
                    onChange={(e) => setLoanData(prev => ({
                      ...prev,
                      notes: e.target.value
                    }))}
                    placeholder="Ghi chú về việc vay thêm..."
                    className="mt-1"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Calculation Summary */}
          {loanData.amount > 0 && (
            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Tổng kết sau khi vay thêm</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Số tiền gốc hiện tại:</span>
                  <span className="font-medium">{formatCurrency(pawn.loan_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Số tiền vay thêm:</span>
                  <span className="font-medium text-green-600">+{formatCurrency(loanData.amount)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Tổng số tiền gốc mới:</span>
                  <span className="text-purple-600">{formatCurrency(calculateNewLoanAmount())}</span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">Lưu ý quan trọng</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Vay thêm sẽ tăng số tiền nợ gốc của hợp đồng</li>
              <li>• Lãi suất sẽ được tính trên tổng số tiền gốc mới</li>
              <li>• Cần đánh giá lại giá trị tài sản thế chấp</li>
              <li>• Giao dịch này sẽ được ghi nhận vào lịch sử</li>
              <li>• Khách hàng cần ký xác nhận vay thêm</li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Điều kiện vay thêm</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Hợp đồng phải đang trong tình trạng tốt</li>
              <li>• Khách hàng đã thanh toán đầy đủ lãi phí đến thời điểm hiện tại</li>
              <li>• Giá trị tài sản thế chấp phải đủ để đảm bảo cho khoản vay mới</li>
              <li>• Tuân thủ các quy định về tỷ lệ cho vay tối đa</li>
            </ul>
          </div>

          <div className="flex justify-center space-x-4">
            <Button
              onClick={handleAdditionalLoan}
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-2"
              disabled={loading || loanData.amount <= 0}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận vay thêm'}
            </Button>
            <Button
              onClick={() => setLoanData({
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