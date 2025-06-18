import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { formatCurrency } from '@/lib/utils';
import { Edit, Eye, MoreHorizontal, Calendar, DollarSign, Trash2, UnlockIcon, AlertTriangle } from 'lucide-react';
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
import { supabase } from '@/lib/supabase';
import { reopenContract } from '@/lib/Pawns/reopen_contract';
import { useToast } from '@/components/ui/use-toast';
import { calculateMultiplePawnStatus, PawnStatusResult } from '@/lib/Pawns/calculate_pawn_status';
import { calculateActualLoanAmount } from '@/lib/Pawns/calculate_actual_loan_amount';
import { usePermissions } from '@/hooks/usePermissions';

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
  onRefresh?: () => void;
}

export function PawnTable({ 
  pawns, 
  loading, 
  statusMap, 
  onEdit, 
  onViewDetail,
  onDelete,
  onExtend,
  onRedeem,
  onRefresh
}: PawnTableProps) {
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const { toast } = useToast();
  
  // Sử dụng hook kiểm tra quyền
  const { hasPermission } = usePermissions();
  
  // Kiểm tra quyền sửa hợp đồng cầm đồ
  const canEditPawn = hasPermission('sua_hop_dong_cam_do');
  
  // Kiểm tra quyền xóa hợp đồng cầm đồ
  const canDeletePawn = hasPermission('xoa_hop_dong_cam_do');
  
  // State để lưu trữ thông tin có kỳ thanh toán đã được thanh toán hay không cho mỗi pawn
  const [hasPaidPaymentPeriods, setHasPaidPaymentPeriods] = useState<Record<string, boolean>>({});
  
  // State để lưu trữ status tính toán cho mỗi pawn
  const [pawnStatuses, setPawnStatuses] = useState<Record<string, PawnStatusResult>>({});
  
  // State để lưu trữ số tiền thực tế cho mỗi pawn
  const [actualLoanAmounts, setActualLoanAmounts] = useState<Record<string, number>>({});
  
  // Hàm kiểm tra xem pawn có kỳ thanh toán nào đã được thanh toán không
  const checkHasPaidPaymentPeriods = useCallback(async (pawnId: string): Promise<boolean> => {
    try {
      // Use pawn_history table instead of pawn_payment_periods
      const { data, error } = await supabase
        .from('pawn_history')
        .select('credit_amount')
        .eq('pawn_id', pawnId)
        .eq('transaction_type', 'payment')
        .eq('is_deleted', false)
        .gt('credit_amount', 0)
        .limit(1);
      
      if (error) {
        console.error('Error checking paid payment periods:', error);
        return false;
      }
      
      return data && data.length > 0;
    } catch (error) {
      console.error('Error in checkHasPaidPaymentPeriods:', error);
      return false;
    }
  }, []);
  
  // Load thông tin về payment periods đã thanh toán và status khi pawns thay đổi
  useEffect(() => {
    const loadPawnInfo = async () => {
      if (pawns.length === 0) return;
      
      // Load payment periods info
      const newHasPaidPaymentPeriodsInfo: Record<string, boolean> = {};
      const paymentResults = await Promise.all(
        pawns.map(async (pawn) => {
          const hasPaidPayments = await checkHasPaidPaymentPeriods(pawn.id);
          return { pawnId: pawn.id, hasPaidPayments };
        })
      );
      
      paymentResults.forEach(({ pawnId, hasPaidPayments }) => {
        newHasPaidPaymentPeriodsInfo[pawnId] = hasPaidPayments;
      });
      
      setHasPaidPaymentPeriods(newHasPaidPaymentPeriodsInfo);
      
      // Load pawn statuses and actual loan amounts
      try {
        const pawnIds = pawns.map(pawn => pawn.id);
        
        // Calculate statuses
        const statuses = await calculateMultiplePawnStatus(pawnIds);
        setPawnStatuses(statuses);
        
        // Calculate actual loan amounts
        const actualAmounts: Record<string, number> = {};
        const amountPromises = pawnIds.map(async (pawnId) => {
          try {
            const amount = await calculateActualLoanAmount(pawnId);
            return { pawnId, amount };
          } catch (error) {
            console.error(`Error calculating actual loan amount for pawn ${pawnId}:`, error);
            return { pawnId, amount: 0 };
          }
        });
        
        const amountResults = await Promise.all(amountPromises);
        amountResults.forEach(({ pawnId, amount }) => {
          actualAmounts[pawnId] = amount;
        });
        
        setActualLoanAmounts(actualAmounts);
      } catch (error) {
        console.error('Error calculating pawn data:', error);
      }
    };
    
    loadPawnInfo();
  }, [pawns, checkHasPaidPaymentPeriods]);

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

  const handleReopen = async (pawnId: string) => {
    try {
      await reopenContract(pawnId);
      
      toast({
        title: "Thành công",
        description: "Đã mở lại hợp đồng thành công",
      });
      
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error reopening contract:', error);
      
      toast({
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Có lỗi xảy ra khi mở lại hợp đồng",
        variant: "destructive",
      });
    }
  };

  // Hàm xử lý khi click vào mã hợp đồng
  const handleContractCodeClick = (pawnId: string) => {
    // Chỉ kích hoạt callback khi có quyền sửa hợp đồng
    if (canEditPawn) {
      onEdit(pawnId);
    }
  };

  const getStatusBadge = (pawn: PawnWithCustomerAndCollateral) => {
    // Sử dụng status đã tính toán từ calculatePawnStatus
    const calculatedStatus = pawnStatuses[pawn.id];
    
    if (!calculatedStatus) {
      // Fallback nếu chưa tính được status
      return (
        <Badge className="bg-gray-100 text-gray-800 border-gray-200">
          Đang tải...
        </Badge>
      );
    }
    
    // Áp dụng màu sắc dựa trên statusCode
    switch (calculatedStatus.statusCode) {
      case 'CLOSED':
        return (
          <Badge className="bg-gray-100 text-gray-800 border-gray-200">
            {calculatedStatus.status}
          </Badge>
        );
      case 'DELETED':
        return (
          <Badge className="bg-gray-100 text-gray-800 border-gray-200">
            {calculatedStatus.status}
          </Badge>
        );
      case 'OVERDUE':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            {calculatedStatus.status}
          </Badge>
        );
      case 'LATE_INTEREST':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            {calculatedStatus.status}
          </Badge>
        );
      case 'ACTIVE':
      default:
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            {calculatedStatus.status}
          </Badge>
        );
    }
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
                  className={`py-3 px-3 font-medium text-blue-600 text-center border-b border-r border-gray-200 ${canEditPawn ? 'cursor-pointer hover:text-blue-800 hover:underline' : ''}`}
                  onClick={() => handleContractCodeClick(pawn.id)}
                  title={canEditPawn ? 'Nhấn để chỉnh sửa hợp đồng' : 'Bạn không có quyền chỉnh sửa hợp đồng'}
                >
                  {pawn.contract_code}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1">
                      <span>{pawn.customer?.name}</span>
                      {(pawn.customer as any)?.blacklist_reason && (
                        <div className="relative group">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                            Khách hàng bị báo xấu
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 mt-1">{pawn.customer?.phone}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  <div className="max-w-xs truncate">
                    {pawn.collateral_asset?.name || 
                     (pawn.collateral_detail && typeof pawn.collateral_detail === 'object' 
                       ? pawn.collateral_detail.name 
                       : pawn.collateral_detail) || 'N/A'}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {formatCurrency(actualLoanAmounts[pawn.id] ?? pawn.loan_amount)}
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
                    {pawnStatuses[pawn.id]?.description || 
                     (isOverdue ? `Quá ${Math.abs(daysRemaining)} ngày` : `${daysRemaining} ngày`)}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                  <div className="flex justify-center">
                    {getStatusBadge(pawn)}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-gray-200">
                  <div className="flex justify-center space-x-1">
                    {/* Hiển thị nút dựa trên trạng thái */}
                    {pawn.status === PawnStatus.CLOSED && hasPermission('huy_chuoc_do_cam_do') ? (
                      <>
                        {/* Nút mở lại hợp đồng cho hợp đồng đã đóng */}
                        <Button 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-green-700" 
                          onClick={() => handleReopen(pawn.id)}
                          title="Mở lại hợp đồng"
                        >
                          <UnlockIcon className="h-4 w-4 text-amber-500" />
                        </Button>
                      </>
                    ) : pawn.status === PawnStatus.DELETED ? (
                      /* Hợp đồng đã xóa - chỉ hiển thị nút xem chi tiết */
                      <Button 
                        variant="ghost" 
                        className="h-8 w-8 p-0" 
                        onClick={() => handleViewDetail(pawn)}
                        title="Xem chi tiết"
                      >
                        <DollarSign className="h-4 w-4 text-gray-400" />
                      </Button>
                    ) : (
                      <>
                        {/* Nút xem lịch sử thanh toán cho hợp đồng đang hoạt động */}
                        <Button 
                          variant="ghost" 
                          className="h-8 w-8 p-0" 
                          onClick={() => handleViewDetail(pawn)}
                          title="Lịch sử thanh toán"
                        >
                          <DollarSign className="h-4 w-4 text-gray-500" />
                        </Button>
                        
                      </>
                    )}
                    
                    {/* Hiển thị dropdown menu cho hợp đồng đã đóng hoặc chưa có thanh toán */}
                    {(pawn.status === PawnStatus.CLOSED || !hasPaidPaymentPeriods[pawn.id]) && pawn.status !== PawnStatus.DELETED && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Mở menu</span>
                            <MoreHorizontal className="h-4 w-4 text-gray-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {/* Hiển thị "Lịch sử thanh toán" cho hợp đồng đã đóng */}
                          {pawn.status === PawnStatus.CLOSED && (
                            <DropdownMenuItem onClick={() => handleViewDetail(pawn)} className="cursor-pointer">
                              <DollarSign className="mr-2 h-4 w-4" />
                              <span>Lịch sử thanh toán</span>
                            </DropdownMenuItem>
                          )}
                          {/* Hiển thị "Xóa hợp đồng" cho hợp đồng chưa có kỳ thanh toán đã được thanh toán */}
                          {!hasPaidPaymentPeriods[pawn.id] && pawn.status !== PawnStatus.CLOSED && canDeletePawn && (
                            <DropdownMenuItem onClick={() => handleDelete(pawn.id)} className="cursor-pointer text-red-600 focus:text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Xóa hợp đồng</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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