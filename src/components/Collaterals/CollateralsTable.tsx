import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CollateralWithStore, CollateralStatus } from '@/models/collateral';
import { MoreVertical, EditIcon, Trash2Icon } from 'lucide-react';
import { getDisplayLabelByBuild } from '@/utils/nav-display-labels';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface CollateralsTableProps {
  collaterals: CollateralWithStore[];
  onEdit: (id: string) => void;
  onDelete: (collateral: CollateralWithStore) => void;
}

const statusMap: StatusMapType = {
  active: { 
    label: 'Hoạt động', 
    color: 'bg-green-100 text-green-800' 
  },
  inactive: { 
    label: 'Không hoạt động', 
    color: 'bg-red-100 text-red-800' 
  }
};

const categoryMap = {
  pawn: 'Cầm đồ',
  unsecured: 'Tín chấp'
};

const interestTypeMap = {
  per_million: 'k/1 triệu',
  total: 'Tổng tiền'
};

export function CollateralsTable({ 
  collaterals, 
  onEdit, 
  onDelete 
}: CollateralsTableProps) {
  
  // Format currency helper
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="rounded-md border overflow-hidden mb-4">
      <Table className="border-collapse">
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="py-2 px-3 text-center font-medium w-12 border-b border-r border-gray-200">#</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Lĩnh vực</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Tên</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Mã</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">{getDisplayLabelByBuild('tien_cam')}</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Lãi phí</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Kỳ lãi phí</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Thanh lý sau</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Trạng thái</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bg-white divide-y divide-gray-200">
          {collaterals.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="py-8 text-center text-gray-500 border-b border-gray-200">
                Không tìm thấy tài sản thế chấp nào
              </TableCell>
            </TableRow>
          ) : (
            collaterals.map((collateral, index) => (
              <TableRow key={collateral.id} className="hover:bg-gray-50 transition-colors">
                <TableCell className="py-3 px-3 text-gray-500 text-center border-b border-r border-gray-200">{index + 1}</TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {categoryMap[collateral.category as keyof typeof categoryMap] || collateral.category}
                </TableCell>
                <TableCell 
                  className="py-3 px-3 font-medium text-blue-600 cursor-pointer text-center border-b border-r border-gray-200" 
                  onClick={() => onEdit(collateral.id)}
                >
                  {collateral.name}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {collateral.code}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {formatCurrency(collateral.default_amount)}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    <span>{collateral.interest_per_day}</span>
                    <div className="text-xs text-gray-500 mt-1">
                      {interestTypeMap[collateral.interest_type as keyof typeof interestTypeMap] || collateral.interest_type}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {collateral.interest_period} ngày
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {collateral.liquidation_after ? `${collateral.liquidation_after} ngày quá hạn` : '-'}
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                  <div className="flex justify-center">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs",
                      statusMap[collateral.status || CollateralStatus.ACTIVE]?.color || "bg-gray-100 text-gray-800"
                    )}>
                      {statusMap[collateral.status || CollateralStatus.ACTIVE]?.label || "Không xác định"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-gray-200">
                  <div className="flex justify-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Mở menu</span>
                          <MoreVertical className="h-4 w-4 text-gray-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onEdit(collateral.id)}>
                          <EditIcon className="mr-2 h-4 w-4" />
                          Chỉnh sửa
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(collateral)} className="text-red-600">
                          <Trash2Icon className="mr-2 h-4 w-4" />
                          Xóa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
} 