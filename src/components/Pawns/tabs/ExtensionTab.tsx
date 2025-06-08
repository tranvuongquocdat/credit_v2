'use client';

import { useState, useEffect } from 'react';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { calculateActualLoanAmount } from '@/lib/Pawns/calculate_actual_loan_amount';

interface ExtensionTabProps {
  pawn: PawnWithCustomerAndCollateral;
  onDataChange?: () => void;
}

export function ExtensionTab({ pawn, onDataChange }: ExtensionTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [actualLoanAmount, setActualLoanAmount] = useState(0);
  const [extensionData, setExtensionData] = useState({
    extension_days: 30,
    extension_fee: 0,
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  // Load actual loan amount on component mount
  useEffect(() => {
    const loadActualAmount = async () => {
      try {
        const amount = await calculateActualLoanAmount(pawn.id);
        setActualLoanAmount(amount);
      } catch (error) {
        console.error('Error loading actual loan amount:', error);
        setActualLoanAmount(pawn.loan_amount);
      }
    };
    
    loadActualAmount();
  }, [pawn.id, pawn.loan_amount]);

  const handleExtension = async () => {
    if (extensionData.extension_days <= 0) {
      toast({
        title: "Lỗi",
        description: "Số ngày gia hạn phải lớn hơn 0",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement extension logic
      // This would involve:
      // 1. Creating an extension record
      // 2. Updating the pawn's loan period or end date
      // 3. Recording the transaction in amount history
      
      console.log('Extension:', {
        pawnId: pawn.id,
        extensionDays: extensionData.extension_days,
        extensionFee: extensionData.extension_fee,
        date: extensionData.date,
        notes: extensionData.notes
      });

      toast({
        title: "Thành công",
        description: `Đã gia hạn ${extensionData.extension_days} ngày`
      });

      // Reset form
      setExtensionData({
        extension_days: 30,
        extension_fee: 0,
        date: new Date().toISOString().split('T')[0],
        notes: ''
      });

      onDataChange?.();
    } catch (error) {
      console.error('Error processing extension:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xử lý gia hạn",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateNewEndDate = () => {
    const currentEndDate = new Date(pawn.loan_date);
    currentEndDate.setDate(currentEndDate.getDate() + pawn.loan_period + extensionData.extension_days);
    return currentEndDate;
  };

  const calculateOriginalEndDate = () => {
    const originalEndDate = new Date(pawn.loan_date);
    originalEndDate.setDate(originalEndDate.getDate() + pawn.loan_period);
    return originalEndDate;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
        <h3 className="text-xl font-bold text-orange-800 mb-4">Gia hạn hợp đồng</h3>
        
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
                  <span>Số tiền gốc:</span>
                  <span className="font-medium text-orange-600">{formatCurrency(actualLoanAmount || pawn.loan_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ngày cầm:</span>
                  <span className="font-medium">
                    {new Date(pawn.loan_date).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Thời hạn ban đầu:</span>
                  <span className="font-medium">{pawn.loan_period} ngày</span>
                </div>
                <div className="flex justify-between">
                  <span>Ngày đáo hạn gốc:</span>
                  <span className="font-medium text-red-600">
                    {calculateOriginalEndDate().toLocaleDateString('vi-VN')}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Thông tin gia hạn</h4>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="extension_days">Số ngày gia hạn</Label>
                  <Input
                    id="extension_days"
                    type="number"
                    value={extensionData.extension_days}
                    onChange={(e) => setExtensionData(prev => ({
                      ...prev,
                      extension_days: Number(e.target.value)
                    }))}
                    placeholder="Nhập số ngày gia hạn"
                    className="mt-1"
                    min={1}
                    disabled={pawn.status === PawnStatus.CLOSED || pawn.status === PawnStatus.DELETED}
                  />
                </div>

                <div>
                  <Label htmlFor="extension_fee">Phí gia hạn (nếu có)</Label>
                  <Input
                    id="extension_fee"
                    type="number"
                    value={extensionData.extension_fee}
                    onChange={(e) => setExtensionData(prev => ({
                      ...prev,
                      extension_fee: Number(e.target.value)
                    }))}
                    placeholder="Nhập phí gia hạn"
                    className="mt-1"
                    disabled={pawn.status === PawnStatus.CLOSED || pawn.status === PawnStatus.DELETED}
                  />
                </div>

                <div>
                  <Label htmlFor="extension_date">Ngày gia hạn</Label>
                  <Input
                    id="extension_date"
                    type="date"
                    value={extensionData.date}
                    onChange={(e) => setExtensionData(prev => ({
                      ...prev,
                      date: e.target.value
                    }))}
                    className="mt-1"
                    disabled={pawn.status === PawnStatus.CLOSED || pawn.status === PawnStatus.DELETED}
                  />
                </div>

                <div>
                  <Label htmlFor="extension_notes">Ghi chú</Label>
                  <Textarea
                    id="extension_notes"
                    value={extensionData.notes}
                    onChange={(e) => setExtensionData(prev => ({
                      ...prev,
                      notes: e.target.value
                    }))}
                    placeholder="Ghi chú về việc gia hạn..."
                    className="mt-1"
                    rows={3}
                    disabled={pawn.status === PawnStatus.CLOSED || pawn.status === PawnStatus.DELETED}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Calculation Summary */}
          {extensionData.extension_days > 0 && (
            <div className="bg-white p-4 rounded-lg border">
              <h4 className="font-medium text-gray-700 mb-2">Tổng kết sau khi gia hạn</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Thời hạn ban đầu:</span>
                  <span className="font-medium">{pawn.loan_period} ngày</span>
                </div>
                <div className="flex justify-between">
                  <span>Số ngày gia hạn:</span>
                  <span className="font-medium text-green-600">+{extensionData.extension_days} ngày</span>
                </div>
                <div className="flex justify-between">
                  <span>Tổng thời hạn mới:</span>
                  <span className="font-medium text-orange-600">{pawn.loan_period + extensionData.extension_days} ngày</span>
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between">
                    <span>Ngày đáo hạn gốc:</span>
                    <span className="font-medium text-red-600">
                      {calculateOriginalEndDate().toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ngày đáo hạn mới:</span>
                    <span className="font-medium text-green-600">
                      {calculateNewEndDate().toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                </div>
                {extensionData.extension_fee > 0 && (
                  <div className="border-t pt-2 flex justify-between">
                    <span>Phí gia hạn:</span>
                    <span className="font-medium text-orange-600">{formatCurrency(extensionData.extension_fee)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">Lưu ý quan trọng</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Gia hạn sẽ kéo dài thời gian của hợp đồng cầm đồ</li>
              <li>• Lãi suất vẫn được tính theo mức ban đầu</li>
              <li>• Có thể áp dụng phí gia hạn theo quy định</li>
              <li>• Khách hàng cần ký xác nhận gia hạn</li>
              <li>• Giao dịch này sẽ được ghi nhận vào lịch sử</li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Điều kiện gia hạn</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Hợp đồng phải đang trong tình trạng hoạt động</li>
              <li>• Khách hàng đã thanh toán đầy đủ lãi phí đến thời điểm hiện tại</li>
              <li>• Tuân thủ quy định về số lần gia hạn tối đa</li>
              <li>• Tài sản thế chấp vẫn còn giá trị đảm bảo</li>
            </ul>
          </div>

          <div className="flex justify-center space-x-4">
            <Button
              onClick={handleExtension}
              className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-2"
              disabled={loading || extensionData.extension_days <= 0 || pawn.status === PawnStatus.CLOSED || pawn.status === PawnStatus.DELETED}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận gia hạn'}
            </Button>
            <Button
              onClick={() => setExtensionData({
                extension_days: 30,
                extension_fee: 0,
                date: new Date().toISOString().split('T')[0],
                notes: ''
              })}
              variant="outline"
              className="px-8 py-2"
              disabled={pawn.status === PawnStatus.CLOSED || pawn.status === PawnStatus.DELETED}
            >
              Đặt lại
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 