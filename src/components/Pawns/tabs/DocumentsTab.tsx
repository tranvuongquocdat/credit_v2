'use client';

import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { FileText, Download, Upload, Eye } from 'lucide-react';

interface DocumentsTabProps {
  pawn: PawnWithCustomerAndCollateral;
}

export function DocumentsTab({ pawn }: DocumentsTabProps) {
  const documentTypes = [
    { id: 'contract', name: 'Hợp đồng cầm đồ', icon: FileText },
    { id: 'collateral_photos', name: 'Hình ảnh tài sản', icon: Eye },
    { id: 'customer_id', name: 'CMND/CCCD khách hàng', icon: FileText },
    { id: 'payment_receipts', name: 'Biên lai thanh toán', icon: FileText },
    { id: 'extension_docs', name: 'Giấy tờ gia hạn', icon: FileText },
    { id: 'liquidation_docs', name: 'Chứng từ thanh lý', icon: FileText },
  ];

  // Check if pawn is closed or deleted
  const isDisabled = pawn?.status === PawnStatus.CLOSED || pawn?.status === PawnStatus.DELETED;

  return (
    <div className="p-6 space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Quản lý chứng từ</h3>
        
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg border">
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
              <div className="flex justify-between">
                <span>Ngày cầm:</span>
                <span className="font-medium">
                  {new Date(pawn.loan_date).toLocaleDateString('vi-VN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tài sản:</span>
                <span className="font-medium">
                  {pawn.collateral_asset?.name || 
                   (pawn.collateral_detail && typeof pawn.collateral_detail === 'object' 
                     ? pawn.collateral_detail.name 
                     : pawn.collateral_detail) || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documentTypes.map((docType) => {
              const IconComponent = docType.icon;
              return (
                <div key={docType.id} className="bg-white p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <IconComponent className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">{docType.name}</span>
                    </div>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      Chưa có
                    </span>
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={isDisabled}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Tải lên
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Xem
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Tải về
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">Lưu ý về quản lý chứng từ</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Tất cả chứng từ cần được lưu trữ an toàn và bảo mật</li>
              <li>• Hình ảnh tài sản cần chụp rõ nét, đầy đủ các góc độ</li>
              <li>• CMND/CCCD cần chụp cả mặt trước và mặt sau</li>
              <li>• Biên lai thanh toán cần được lưu trữ theo thứ tự thời gian</li>
              <li>• Định kỳ sao lưu dữ liệu để tránh mất mát</li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Chức năng đang phát triển</h4>
            <p className="text-sm text-blue-700">
              Hệ thống quản lý chứng từ điện tử đang được phát triển. 
              Các tính năng sẽ bao gồm:
            </p>
            <ul className="text-sm text-blue-700 mt-2 space-y-1">
              <li>• Upload và lưu trữ file PDF, hình ảnh</li>
              <li>• Xem trước chứng từ trực tiếp trên hệ thống</li>
              <li>• Tạo mã QR cho từng chứng từ</li>
              <li>• Ký số điện tử</li>
              <li>• Tích hợp với máy scan và camera</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 