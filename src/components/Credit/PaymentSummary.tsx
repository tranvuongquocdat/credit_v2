"use client";

import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { CreditPaymentSummary } from '@/models/credit-payment';
import { formatCurrency } from '@/lib/utils';
import { CalendarClock, CheckCircle, Coins, Wallet } from 'lucide-react';

interface PaymentSummaryProps {
  summary: CreditPaymentSummary;
}

export function PaymentSummary({ summary }: PaymentSummaryProps) {
  const {
    total_expected,
    total_paid,
    next_payment_date,
    remaining_periods,
    completed_periods
  } = summary;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return format(parseISO(dateString), 'dd/MM/yyyy', { locale: vi });
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-start space-x-3">
            <Wallet className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tổng tiền lãi</p>
              <p className="text-xl font-bold">{formatCurrency(total_expected)}</p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Coins className="h-5 w-5 text-success mt-0.5" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Đã đóng</p>
              <p className="text-xl font-bold">{formatCurrency(total_paid)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((total_paid / total_expected) * 100)}% tổng tiền lãi
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CalendarClock className="h-5 w-5 text-orange-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ngày đóng tiếp theo</p>
              <p className="text-xl font-bold">{formatDate(next_payment_date)}</p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle className="h-5 w-5 text-blue-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tiến độ kỳ đóng lãi</p>
              <p className="text-xl font-bold">{completed_periods}/{completed_periods + remaining_periods}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Hoàn thành {Math.round((completed_periods / (completed_periods + remaining_periods)) * 100)}%
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
