"use client";

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription 
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, DollarSign, Edit, Plus, Trash2, Database, Calculator, AlertCircle } from 'lucide-react';
import { CreditPaymentPeriod, PaymentPeriodStatus } from '@/models/credit-payment';
import { formatCurrency } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ExtendedCreditPaymentPeriod extends CreditPaymentPeriod {
  isFromDb?: boolean; // Thêm trường để phân biệt kỳ từ DB và kỳ ước tính
}

interface PaymentPeriodListProps {
  periods: ExtendedCreditPaymentPeriod[];
  onMarkAsPaid: (period: CreditPaymentPeriod) => void;
  onEdit: (period: CreditPaymentPeriod) => void;
  onDelete: (period: CreditPaymentPeriod) => void;
  onAddCustomPeriod: () => void;
}

// Map trạng thái kỳ thanh toán sang variant của Badge
const statusVariantMap: Record<PaymentPeriodStatus, "default" | "success" | "destructive" | "secondary"> = {
  [PaymentPeriodStatus.PENDING]: "default",
  [PaymentPeriodStatus.PAID]: "success",
  [PaymentPeriodStatus.OVERDUE]: "destructive",
  [PaymentPeriodStatus.PARTIALLY_PAID]: "secondary"
};

// Map trạng thái kỳ thanh toán sang text tiếng Việt
const statusTextMap: Record<PaymentPeriodStatus, string> = {
  [PaymentPeriodStatus.PENDING]: "Chưa đóng",
  [PaymentPeriodStatus.PAID]: "Đã đóng",
  [PaymentPeriodStatus.OVERDUE]: "Quá hạn",
  [PaymentPeriodStatus.PARTIALLY_PAID]: "Đóng một phần"
};

export function PaymentPeriodList({
  periods,
  onMarkAsPaid,
  onEdit,
  onDelete,
  onAddCustomPeriod
}: PaymentPeriodListProps) {
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  
  const toggleExpand = (periodId: string) => {
    if (expandedPeriod === periodId) {
      setExpandedPeriod(null);
    } else {
      setExpandedPeriod(periodId);
    }
  };
  
  // Kiểm tra xem một kỳ có thể đánh dấu là đã thanh toán hay không
  const canMarkAsPaid = (periodIndex: number): boolean => {
    // Kỳ đầu tiên luôn có thể đánh dấu
    if (periodIndex === 0) return true;
    
    // Kiểm tra các kỳ trước đó đã thanh toán chưa
    for (let i = 0; i < periodIndex; i++) {
      const previousPeriod = periods[i];
      if (previousPeriod.status !== PaymentPeriodStatus.PAID) {
        return false; // Có ít nhất một kỳ trước chưa thanh toán
      }
    }
    
    return true; // Tất cả các kỳ trước đều đã thanh toán
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">
          <span className="inline-flex items-center mr-4">
            <Database className="h-4 w-4 mr-1 text-blue-500" /> 
            <span>Lưu trong DB</span>
          </span>
          <span className="inline-flex items-center">
            <Calculator className="h-4 w-4 mr-1 text-orange-500" /> 
            <span>Dữ liệu ước tính</span>
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={onAddCustomPeriod}>
          <Plus className="h-4 w-4 mr-2" />
          Thêm kỳ
        </Button>
      </div>
      
      {periods.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-500">Chưa có kỳ đóng lãi nào.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {periods.map((period, index) => {
            const isExpanded = expandedPeriod === (period.id || `estimated-${period.period_number}`);
            const periodId = period.id || `estimated-${period.period_number}`;
            const isPaid = period.status === PaymentPeriodStatus.PAID;
            const isPartiallyPaid = period.status === PaymentPeriodStatus.PARTIALLY_PAID;
            const isOverdue = period.status === PaymentPeriodStatus.OVERDUE;
            const isPending = period.status === PaymentPeriodStatus.PENDING;
            const canBePaid = canMarkAsPaid(index);
            
            return (
              <Card 
                key={periodId} 
                className={`border-l-4 ${
                  isPaid 
                    ? 'border-l-green-500' 
                    : isPartiallyPaid 
                    ? 'border-l-blue-500' 
                    : isOverdue 
                    ? 'border-l-red-500' 
                    : 'border-l-gray-300'
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <div className="flex items-center">
                        <CardTitle className="text-base mr-2">
                          Kỳ {period.period_number}
                        </CardTitle>
                        {period.isFromDb ? (
                          <Database className="h-4 w-4 text-blue-500" title="Đã lưu trong DB" />
                        ) : (
                          <Calculator className="h-4 w-4 text-orange-500" title="Dữ liệu ước tính" />
                        )}
                        <Badge 
                          variant={statusVariantMap[period.status]} 
                          className="ml-2"
                        >
                          {statusTextMap[period.status]}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs mt-1">
                        {format(parseISO(period.start_date), 'dd/MM/yyyy', { locale: vi })} - {format(parseISO(period.end_date), 'dd/MM/yyyy', { locale: vi })}
                      </CardDescription>
                    </div>
                    <div className="flex items-center">
                      <span className="font-semibold mr-4">
                        {formatCurrency(period.expected_amount)}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => toggleExpand(periodId)}
                      >
                        {isExpanded ? "Thu gọn" : "Chi tiết"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="p-4 pt-0">
                    <div className="py-2">
                      <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                        <div>
                          <p className="text-gray-500">Số tiền dự kiến</p>
                          <p className="font-semibold">{formatCurrency(period.expected_amount)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Số tiền đã đóng</p>
                          <p className="font-semibold">{formatCurrency(period.actual_amount || 0)}</p>
                        </div>
                        {period.payment_date && (
                          <div>
                            <p className="text-gray-500">Ngày thanh toán</p>
                            <p className="font-semibold">{format(parseISO(period.payment_date), 'dd/MM/yyyy', { locale: vi })}</p>
                          </div>
                        )}
                        {period.notes && (
                          <div className="col-span-2">
                            <p className="text-gray-500">Ghi chú</p>
                            <p>{period.notes}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex space-x-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => onMarkAsPaid(period)}
                                  disabled={isPaid || !canBePaid}
                                >
                                  <DollarSign className="h-4 w-4 mr-1" />
                                  {period.isFromDb ? "Đánh dấu đã đóng" : "Lưu và đánh dấu đã đóng"}
                                  {!canBePaid && !isPaid && (
                                    <AlertCircle className="h-3 w-3 ml-1 text-yellow-500" />
                                  )}
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!canBePaid && !isPaid && (
                              <TooltipContent>
                                <p>Kỳ trước chưa được thanh toán</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => onEdit(period)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          {period.isFromDb ? "Sửa" : "Lưu vào DB"}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => onDelete(period)}
                          disabled={!period.isFromDb}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Xóa
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
