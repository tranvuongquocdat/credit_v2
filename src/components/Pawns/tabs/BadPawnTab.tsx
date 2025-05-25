'use client';

import { useState } from 'react';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { AlertTriangle, Shield, FileText } from 'lucide-react';

interface BadPawnTabProps {
  pawn: PawnWithCustomerAndCollateral;
}

export function BadPawnTab({ pawn }: BadPawnTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState({
    reason: '',
    description: '',
    severity: 'medium'
  });

  const reasons = [
    { value: 'overdue', label: 'Quá hạn thanh toán' },
    { value: 'fraud', label: 'Gian lận thông tin' },
    { value: 'fake_collateral', label: 'Tài sản giả mạo' },
    { value: 'aggressive', label: 'Thái độ hung hăng' },
    { value: 'breach_contract', label: 'Vi phạm hợp đồng' },
    { value: 'other', label: 'Lý do khác' }
  ];

  const severityLevels = [
    { value: 'low', label: 'Thấp', color: 'text-yellow-600' },
    { value: 'medium', label: 'Trung bình', color: 'text-orange-600' },
    { value: 'high', label: 'Cao', color: 'text-red-600' },
    { value: 'critical', label: 'Nghiêm trọng', color: 'text-red-800' }
  ];

  const handleSubmitReport = async () => {
    if (!reportData.reason) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn lý do báo xấu",
        variant: "destructive"
      });
      return;
    }

    if (!reportData.description.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng mô tả chi tiết lý do báo xấu",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement bad customer report logic
      // This would involve:
      // 1. Creating a bad customer report record
      // 2. Updating customer's credit score/status
      // 3. Notifying relevant departments
      
      console.log('Bad customer report:', {
        pawnId: pawn.id,
        customerId: pawn.customer_id,
        reason: reportData.reason,
        description: reportData.description,
        severity: reportData.severity
      });

      toast({
        title: "Thành công",
        description: "Đã gửi báo cáo xấu khách hàng"
      });

      // Reset form
      setReportData({
        reason: '',
        description: '',
        severity: 'medium'
      });
    } catch (error) {
      console.error('Error submitting bad customer report:', error);
      toast({
        title: "Lỗi",
        description: "Không thể gửi báo cáo",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <AlertTriangle className="h-6 w-6 text-red-600" />
          <h3 className="text-xl font-bold text-red-800">Báo xấu khách hàng</h3>
        </div>
        
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-lg border">
            <h4 className="font-medium text-gray-700 mb-2">Thông tin khách hàng</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span>Tên khách hàng:</span>
                <span className="font-medium">{pawn.customer?.name || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Mã hợp đồng:</span>
                <span className="font-medium">{pawn.contract_code || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Số điện thoại:</span>
                <span className="font-medium">{pawn.customer?.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Địa chỉ:</span>
                <span className="font-medium">{pawn.customer?.address || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <h4 className="font-medium text-gray-700 mb-4">Thông tin báo cáo</h4>
            <div className="space-y-4">
              <div>
                <Label htmlFor="reason">Lý do báo xấu</Label>
                <Select value={reportData.reason} onValueChange={(value) => 
                  setReportData(prev => ({ ...prev, reason: value }))
                }>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Chọn lý do báo xấu" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasons.map((reason) => (
                      <SelectItem key={reason.value} value={reason.value}>
                        {reason.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="severity">Mức độ nghiêm trọng</Label>
                <Select value={reportData.severity} onValueChange={(value) => 
                  setReportData(prev => ({ ...prev, severity: value }))
                }>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Chọn mức độ nghiêm trọng" />
                  </SelectTrigger>
                  <SelectContent>
                    {severityLevels.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        <span className={level.color}>{level.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description">Mô tả chi tiết</Label>
                <Textarea
                  id="description"
                  value={reportData.description}
                  onChange={(e) => setReportData(prev => ({
                    ...prev,
                    description: e.target.value
                  }))}
                  placeholder="Mô tả chi tiết về hành vi xấu của khách hàng..."
                  className="mt-1"
                  rows={5}
                />
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="h-5 w-5 text-yellow-600" />
              <h4 className="font-medium text-yellow-800">Lưu ý quan trọng</h4>
            </div>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Báo cáo xấu sẽ ảnh hưởng đến điểm tín dụng của khách hàng</li>
              <li>• Thông tin sẽ được chia sẻ với các cơ sở tín dụng khác</li>
              <li>• Cần có bằng chứng cụ thể để hỗ trợ báo cáo</li>
              <li>• Báo cáo sai sự thật có thể gây hậu quả pháp lý</li>
              <li>• Khách hàng có quyền khiếu nại và yêu cầu xem xét lại</li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <h4 className="font-medium text-blue-800">Quy trình xử lý</h4>
            </div>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>Báo cáo sẽ được gửi đến bộ phận quản lý rủi ro</li>
              <li>Thông tin sẽ được xác minh và đánh giá</li>
              <li>Khách hàng sẽ được thông báo về báo cáo (nếu cần)</li>
              <li>Cập nhật hồ sơ tín dụng của khách hàng</li>
              <li>Thông báo cho các cơ sở tín dụng liên quan</li>
            </ol>
          </div>

          <div className="flex justify-center space-x-4">
            <Button
              onClick={handleSubmitReport}
              className="bg-red-600 hover:bg-red-700 text-white px-8 py-2"
              disabled={loading || !reportData.reason || !reportData.description.trim()}
            >
              {loading ? 'Đang xử lý...' : 'Gửi báo cáo'}
            </Button>
            <Button
              onClick={() => setReportData({
                reason: '',
                description: '',
                severity: 'medium'
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