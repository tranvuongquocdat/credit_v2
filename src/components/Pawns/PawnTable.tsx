import { useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { formatCurrency } from '@/lib/utils';
import { Edit, Eye, MoreHorizontal, Calendar, DollarSign, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

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
  onDelete?: (pawnId: string) => void;
  onExtend?: (pawnId: string) => void;
  onRedeem?: (pawnId: string) => void;
}

export function PawnTable({ 
  pawns, 
  loading, 
  statusMap, 
  onEdit, 
  onViewDetail,
  onDelete,
  onExtend,
  onRedeem 
}: PawnTableProps) {
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
    if (onExtend) {
      onExtend(pawnId);
    } else {
      console.log('Extend pawn:', pawnId);
    }
  };

  const handleRedeem = (pawnId: string) => {
    if (onRedeem) {
      onRedeem(pawnId);
    } else {
      console.log('Redeem pawn:', pawnId);
    }
  };

  const handleDelete = (pawnId: string) => {
    if (onDelete) {
      onDelete(pawnId);
    } else {
      console.log('Delete pawn:', pawnId);
    }
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
    <div className="rounded-md border overflow-hidden mb-4">
      <Table className="border-collapse">
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="py-2 px-3 text-center font-medium w-12 border-b border-r border-gray-200">#</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">
              <button
                onClick={() => handleSort('contract_code')}
                className="flex items-center justify-center space-x-1 hover:text-gray-700 w-full"
              >
                <span>Mã HĐ</span>
                {sortField === 'contract_code' && (
                  <span className="text-blue-500">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            </TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">
              <button
                onClick={() => handleSort('customer_name')}
                className="flex items-center justify-center space-x-1 hover:text-gray-700 w-full"
              >
                <span>Khách hàng</span>
                {sortField === 'customer_name' && (
                  <span className="text-blue-500">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            </TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Tài sản</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">
              <button
                onClick={() => handleSort('loan_amount')}
                className="flex items-center justify-center space-x-1 hover:text-gray-700 w-full"
              >
                <span>Số tiền vay</span>
                {sortField === 'loan_amount' && (
                  <span className="text-blue-500">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            </TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">
              <button
                onClick={() => handleSort('loan_date')}
                className="flex items-center justify-center space-x-1 hover:text-gray-700 w-full"
              >
                <span>Ngày vay</span>
                {sortField === 'loan_date' && (
                  <span className="text-blue-500">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            </TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">
              <button
                onClick={() => handleSort('loan_period')}
                className="flex items-center justify-center space-x-1 hover:text-gray-700 w-full"
              >
                <span>Ngày đáo hạn</span>
                {sortField === 'loan_period' && (
                  <span className="text-blue-500">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            </TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Còn lại</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Trạng thái</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bg-white divide-y divide-gray-200">
          {pawns.map((pawn, index) => {
            const daysRemaining = calculateDaysRemaining(pawn.loan_date, pawn.loan_period);
            const maturityDate = calculateMaturityDate(pawn.loan_date, pawn.loan_period);
            const isOverdue = daysRemaining < 0;
            const isNearMaturity = daysRemaining <= 7 && daysRemaining >= 0;
            
            return (
              <TableRow key={pawn.id} className="hover:bg-gray-50 transition-colors">
                <TableCell className="py-3 px-3 text-gray-500 text-center border-b border-r border-gray-200">{index + 1}</TableCell>
                <TableCell 
                  className="py-3 px-3 font-medium text-blue-600 cursor-pointer text-center border-b border-r border-gray-200" 
                  onClick={() => onEdit(pawn.id)}
                >
                  {pawn.contract_code}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    <span>{pawn.customer?.name}</span>
                    <span className="text-xs text-gray-400 mt-1">{pawn.customer?.phone}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  <div className="max-w-xs truncate">
                    {pawn.collateral_asset?.name || pawn.collateral_detail || 'N/A'}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {formatCurrency(pawn.loan_amount)}
                </TableCell>
                <TableCell className="py-3 px-3 text-gray-600 text-center border-b border-r border-gray-200">
                  {format(new Date(pawn.loan_date), 'dd/MM/yyyy', { locale: vi })}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {format(maturityDate, 'dd/MM/yyyy', { locale: vi })}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  <div className={`text-sm font-medium ${
                    isOverdue ? 'text-red-600' : 
                    isNearMaturity ? 'text-yellow-600' : 
                    'text-green-600'
                  }`}>
                    {isOverdue ? `Quá ${Math.abs(daysRemaining)} ngày` : `${daysRemaining} ngày`}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                  <div className="flex justify-center">
                    {pawn.status && getStatusBadge(pawn.status)}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-gray-200">
                  <div className="flex justify-center space-x-1">
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => handleViewDetail(pawn)}
                      title="Lịch sử thanh toán"
                    >
                      <DollarSign className="h-4 w-4 text-gray-500" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <span className="sr-only">Mở menu</span>
                          <MoreHorizontal className="h-4 w-4 text-gray-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => handleViewDetail(pawn)} className="cursor-pointer">
                          <Eye className="mr-2 h-4 w-4" />
                          <span>Xem chi tiết</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEdit(pawn.id)} className="cursor-pointer">
                          <Edit className="mr-2 h-4 w-4" />
                          <span>Chỉnh sửa</span>
                        </DropdownMenuItem>
                        
                        {pawn.status === PawnStatus.ON_TIME && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleExtend(pawn.id)} className="cursor-pointer">
                              <Calendar className="mr-2 h-4 w-4" />
                              <span>Gia hạn</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRedeem(pawn.id)} className="cursor-pointer">
                              <DollarSign className="mr-2 h-4 w-4" />
                              <span>Chuộc đồ</span>
                            </DropdownMenuItem>
                          </>
                        )}
                        
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleDelete(pawn.id)} 
                          className="cursor-pointer text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Xóa</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
} 