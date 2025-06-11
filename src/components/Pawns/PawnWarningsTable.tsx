'use client';

import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { AlertTriangleIcon, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface PawnWarningsTableProps {
  pawns: PawnWithCustomerAndCollateral[];
  loading: boolean;
  statusMap: Record<string, { label: string; color: string }>;
  onViewDetail: (pawn: PawnWithCustomerAndCollateral) => void;
  onCustomerClick?: (pawn: PawnWithCustomerAndCollateral) => void;
  summary?: {
    totalLoanAmount: number;
    totalDueAmount: number;
  };
}

export function PawnWarningsTable({
  pawns,
  loading,
  statusMap,
  onViewDetail,
  onCustomerClick,
  summary
}: PawnWarningsTableProps) {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
      </div>
    );
  }

  if (pawns.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500">
        <AlertTriangleIcon size={40} className="mb-2 text-green-500" />
        <p className="text-lg font-medium">Không có cảnh báo hợp đồng cầm đồ</p>
        <p className="text-sm">Tất cả các hợp đồng đều đang được thanh toán đúng hạn.</p>
      </div>
    );
  }

  // Calculate summary if not provided
  const calculatedSummary = summary || {
    totalLoanAmount: pawns.reduce((sum, pawn) => sum + (pawn.actualLoanAmount || 0), 0),
    totalDueAmount: pawns.reduce((sum, pawn) => sum + (pawn.totalDueAmount || 0), 0)
  };

  return (
    <div className="overflow-x-auto">
      {/* Summary row */}
      <div className="bg-yellow-50 p-3 border-b mb-4 rounded-t-md">
        <div className="flex justify-between items-center">
          <span className="font-medium">Tổng số hợp đồng cảnh báo: {pawns.length}</span>
          <div className="flex gap-8">
            <span className="text-red-600 font-medium">
              Tổng nợ: {formatCurrency(calculatedSummary.totalDueAmount)}
            </span>
            <span className="text-blue-600 font-medium">
              Tổng gốc: {formatCurrency(calculatedSummary.totalLoanAmount)}
            </span>
          </div>
        </div>
      </div>

      <table className="min-w-full divide-y divide-gray-200 border rounded-md">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-10">#</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Mã HĐ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-36">Tên khách hàng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Số điện thoại</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-48">Địa chỉ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Mã tài sản</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Tên tài sản</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Nợ cũ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền lãi phí</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền gốc</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Tổng tiền</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Lý do</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm w-24">Thao tác</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {pawns.map((pawn, index) => (
            <tr key={pawn.id} className="hover:bg-gray-50 transition-colors text-sm">
              <td className="py-3 px-3 border-r border-gray-200 text-center">{index + 1}</td>
              <td className="py-3 px-3 border-r border-gray-200 font-medium text-center text-blue-600">
                {pawn.contract_code || 'N/A'}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                <span 
                  className="text-red-600 font-medium cursor-pointer hover:text-red-800 hover:underline"
                  onClick={() => onCustomerClick?.(pawn)}
                  title="Click để xem chi tiết hợp đồng"
                >
                  {pawn.customer?.name || 'N/A'}
                </span>
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {pawn.customer?.phone || '-'}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {pawn.address || '-'}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {pawn.collateral_asset?.code || 'N/A'}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {pawn.collateral_asset?.name || 
                 (pawn.collateral_detail && typeof pawn.collateral_detail === 'object' 
                   ? pawn.collateral_detail.name 
                   : pawn.collateral_detail) || 'N/A'}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center text-red-600">
                {formatCurrency(pawn.oldDebt || 0)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center text-red-600">
                {formatCurrency(pawn.interestAmount || 0)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center text-red-600">
                {formatCurrency(pawn.actualLoanAmount || pawn.loan_amount || 0)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center text-red-600 font-medium">
                {formatCurrency((pawn.totalDueAmount || 0) + (pawn.actualLoanAmount || pawn.loan_amount || 0))}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                <span className="text-red-600 font-medium">{pawn.reason || 'Cần kiểm tra'}</span>
              </td>
              <td className="py-3 px-3 text-center">
                <div className="flex justify-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewDetail(pawn)}
                    className="h-8 w-8 p-0"
                    title="Xem chi tiết"
                  >
                    <DollarSign className="h-4 w-4 text-gray-500" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 