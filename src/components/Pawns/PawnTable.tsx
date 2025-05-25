import { useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { formatCurrency } from '@/lib/utils';
import { Edit, Eye, MoreHorizontal, Calendar, DollarSign } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface PawnTableProps {
  pawns: PawnWithCustomerAndCollateral[];
  loading: boolean;
  statusMap: StatusMapType;
  onEdit: (pawnId: string) => void;
  onViewDetail?: (pawn: PawnWithCustomerAndCollateral) => void;
}

export function PawnTable({ pawns, loading, statusMap, onEdit, onViewDetail }: PawnTableProps) {
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleViewDetail = (pawn: PawnWithCustomerAndCollateral) => {
    onViewDetail?.(pawn);
  };

  const handleExtend = (pawnId: string) => {
    // Handle extend pawn
    console.log('Extend pawn:', pawnId);
  };

  const handleRedeem = (pawnId: string) => {
    // Handle redeem pawn
    console.log('Redeem pawn:', pawnId);
  };

  const getStatusBadge = (status: PawnStatus) => {
    const config = statusMap[status];
    if (!config) return null;
    
    return (
      <Badge className={`${config.color} border-0`}>
        {config.label}
      </Badge>
    );
  };

  const calculateMaturityDate = (loanDate: string, loanPeriod: number) => {
    const loan = new Date(loanDate);
    const maturity = new Date(loan);
    maturity.setDate(loan.getDate() + loanPeriod);
    return maturity;
  };

  const calculateDaysRemaining = (loanDate: string, loanPeriod: number) => {
    const today = new Date();
    const maturity = calculateMaturityDate(loanDate, loanPeriod);
    const diffTime = maturity.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="border rounded-lg">
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-2 text-gray-500">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (pawns.length === 0) {
    return (
      <div className="border rounded-lg">
        <div className="p-8 text-center">
          <p className="text-gray-500">Không có dữ liệu hợp đồng cầm đồ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('contract_code')}
                  className="flex items-center space-x-1 hover:text-gray-700"
                >
                  <span>Mã HĐ</span>
                  {sortField === 'contract_code' && (
                    <span className="text-blue-500">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('customer_name')}
                  className="flex items-center space-x-1 hover:text-gray-700"
                >
                  <span>Khách hàng</span>
                  {sortField === 'customer_name' && (
                    <span className="text-blue-500">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tài sản
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('loan_amount')}
                  className="flex items-center space-x-1 hover:text-gray-700"
                >
                  <span>Số tiền vay</span>
                  {sortField === 'loan_amount' && (
                    <span className="text-blue-500">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('loan_date')}
                  className="flex items-center space-x-1 hover:text-gray-700"
                >
                  <span>Ngày vay</span>
                  {sortField === 'loan_date' && (
                    <span className="text-blue-500">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('loan_period')}
                  className="flex items-center space-x-1 hover:text-gray-700"
                >
                  <span>Ngày đáo hạn</span>
                  {sortField === 'loan_period' && (
                    <span className="text-blue-500">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Còn lại
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trạng thái
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {pawns.map((pawn) => {
              const daysRemaining = calculateDaysRemaining(pawn.loan_date, pawn.loan_period);
              const maturityDate = calculateMaturityDate(pawn.loan_date, pawn.loan_period);
              const isOverdue = daysRemaining < 0;
              const isNearMaturity = daysRemaining <= 7 && daysRemaining >= 0;
              
              return (
                <tr key={pawn.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {pawn.contract_code}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{pawn.customer?.name}</div>
                    <div className="text-sm text-gray-500">{pawn.customer?.phone}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">
                      {pawn.collateral_asset?.name || pawn.collateral_detail || 'N/A'}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(pawn.loan_amount)}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {format(new Date(pawn.loan_date), 'dd/MM/yyyy', { locale: vi })}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {format(maturityDate, 'dd/MM/yyyy', { locale: vi })}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${
                      isOverdue ? 'text-red-600' : 
                      isNearMaturity ? 'text-yellow-600' : 
                      'text-green-600'
                    }`}>
                      {isOverdue ? `Quá ${Math.abs(daysRemaining)} ngày` : `${daysRemaining} ngày`}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {pawn.status && getStatusBadge(pawn.status)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetail(pawn)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Xem chi tiết
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEdit(pawn.id)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Chỉnh sửa
                        </DropdownMenuItem>
                        {pawn.status === PawnStatus.ON_TIME && (
                          <>
                            <DropdownMenuItem onClick={() => handleExtend(pawn.id)}>
                              <Calendar className="mr-2 h-4 w-4" />
                              Gia hạn
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRedeem(pawn.id)}>
                              <DollarSign className="mr-2 h-4 w-4" />
                              Chuộc đồ
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
} 