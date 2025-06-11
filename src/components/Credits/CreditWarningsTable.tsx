import { CreditWithCustomer, CreditStatus } from "@/models/credit";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/spinner";
import { AlertTriangleIcon, DollarSignIcon } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { useRouter } from "next/navigation";

interface CreditWarningsTableProps {
  credits: CreditWithCustomer[];
  isLoading: boolean;
  onCustomerClick?: (credit: CreditWithCustomer) => void;
  onShowPaymentHistory?: (credit: CreditWithCustomer) => void;
}

export function CreditWarningsTable({
  credits,
  isLoading,
  onCustomerClick,
  onShowPaymentHistory,
}: CreditWarningsTableProps) {
  const { currentStore } = useStore();
  const router = useRouter();
  
  // Handle customer name click
  const handleCustomerClick = (credit: CreditWithCustomer) => {
    if (onCustomerClick) {
      // Use callback if provided
      onCustomerClick(credit);
    } else {
      // Redirect to credits page with path parameter
      router.push(`/credits/${credit.contract_code}`);
    }
  };

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (credits.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500">
        <AlertTriangleIcon size={40} className="mb-2 text-green-500" />
        <p className="text-lg font-medium">Không có cảnh báo hợp đồng vay{currentStore ? ` tại ${currentStore.name}` : ''}</p>
        <p className="text-sm">Tất cả các hợp đồng đều đang được thanh toán đúng hạn.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-10">#</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Mã hợp đồng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-36">Tên khách hàng</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-28">Số điện thoại</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-48">Địa chỉ</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-24">Tiền gốc</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-32">Lý do</th>
            <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm">Thao tác</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {credits.map((credit, index) => (
            <tr key={credit.id} className="hover:bg-gray-50 transition-colors text-sm">
              <td className="py-3 px-3 border-r border-gray-200 text-center">{index + 1}</td>
              <td className="py-3 px-3 border-r border-gray-200 font-medium text-center">
                {credit.contract_code}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                <span 
                  className="text-blue-600 cursor-pointer hover:underline"
                  onClick={() => handleCustomerClick(credit)}
                >
                  {credit.customer?.name || "N/A"}
                </span>
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {credit.customer?.phone || ""}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {credit.address || ""}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                {formatCurrency(credit.loan_amount || 0)}
              </td>
              <td className="py-3 px-3 border-r border-gray-200 text-center">
                <span className="text-red-600 font-medium">
                  {credit.reason || "Cần kiểm tra"}
                </span>
              </td>
              <td className="py-3 px-3 text-center">
                <div className="flex flex-wrap justify-center gap-1">
                {onShowPaymentHistory && (
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => onShowPaymentHistory(credit)}
                      title="Lịch sử thanh toán"
                    >
                      <DollarSignIcon className="h-4 w-4 text-gray-500" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 