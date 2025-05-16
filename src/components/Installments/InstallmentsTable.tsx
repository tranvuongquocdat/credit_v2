import { InstallmentWithCustomer } from "@/models/installment";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Edit2Icon, EyeIcon, MoreVerticalIcon, TrashIcon, AlertTriangleIcon, CalendarIcon, ClockIcon, FileTextIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";

interface InstallmentsTableProps {
  installments: InstallmentWithCustomer[];
  statusMap: Record<string, { label: string; color: string }>;
  isLoading: boolean;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onUpdateStatus: (installment: InstallmentWithCustomer) => void;
  onDelete: (installment: InstallmentWithCustomer) => void;
}

export function InstallmentsTable({
  installments,
  statusMap,
  isLoading,
  onView,
  onEdit,
  onUpdateStatus,
  onDelete,
}: InstallmentsTableProps) {
  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (installments.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500">
        <AlertTriangleIcon size={40} className="mb-2 text-amber-500" />
        <p className="text-lg font-medium">Không tìm thấy hợp đồng nào</p>
        <p className="text-sm">Vui lòng thử lại với bộ lọc khác hoặc tạo hợp đồng mới.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 table-fixed">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-10">#</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Mã HĐ</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-36">Tên KH</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Tiền giao khách</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-16">Tỷ lệ</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-20">Thời gian</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Tiền đã đóng</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Nợ cũ</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền 1 ngày</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Còn phải đóng</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Tình trạng</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Ngày phải đóng</th>
            <th className="py-3 px-3 text-left font-medium text-gray-500 text-sm w-20">Thao tác</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {installments.map((installment, index) => {
            const statusInfo = statusMap[installment.status] || {
              label: "Không xác định",
              color: "bg-gray-100 text-gray-800",
            };

            return (
              <tr 
                key={installment.id} 
                className="hover:bg-gray-50 transition-colors text-sm"
              >
                <td className="py-3 px-3 border-r border-gray-200">{index + 1}</td>
                <td className="py-3 px-3 border-r border-gray-200 font-medium">{installment.contract_code}</td>
                <td className="py-3 px-3 border-r border-gray-200">{installment.customer?.name || "N/A"}</td>
                <td className="py-3 px-3 border-r border-gray-200 text-right">
                  {formatCurrency(installment.amount_given)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200">{installment.interest_rate}%</td>
                <td className="py-3 px-3 border-r border-gray-200">{installment.duration} ngày</td>
                <td className="py-3 px-3 border-r border-gray-200 text-right">
                  {formatCurrency(installment.amount_paid || 0)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-right">
                  {formatCurrency(installment.old_debt || 0)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-right">
                  {formatCurrency(installment.daily_amount)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200 text-right">
                  {formatCurrency(installment.remaining_amount)}
                </td>
                <td className="py-3 px-3 border-r border-gray-200">
                  <Badge
                    variant="outline"
                    className={statusInfo.color}
                  >
                    {statusInfo.label}
                  </Badge>
                </td>
                <td className="py-3 px-3 border-r border-gray-200">
                  {new Date(installment.due_date).toLocaleDateString('vi-VN')}
                </td>
                <td className="py-3 px-3">
                  <div className="flex justify-center space-x-1">
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => onEdit(installment.id)}
                      title="Chỉnh sửa"
                    >
                      <Edit2Icon className="h-4 w-4 text-gray-500" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => onView(installment.id)}
                      title="Xem chi tiết"
                    >
                      <EyeIcon className="h-4 w-4 text-gray-500" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => onDelete(installment)}
                      title="Xóa hợp đồng"
                    >
                      <TrashIcon className="h-4 w-4 text-gray-500" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Mở menu</span>
                          <MoreVerticalIcon className="h-4 w-4 text-gray-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onView(installment.id)}>
                          Xem chi tiết
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onUpdateStatus(installment)}>
                          Cập nhật trạng thái
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(installment)} className="text-red-600">
                          Xóa hợp đồng
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
