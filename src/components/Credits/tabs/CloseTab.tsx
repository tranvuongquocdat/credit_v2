'use client';

import { useEffect, useState, useMemo } from 'react';
import { CreditStatus, CreditWithCustomer } from '@/models/credit';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { getCreditStatus, updateCredit, updateCreditStatus } from '@/lib/credit';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { calculateDebtToLatestPaidPeriod } from '@/lib/Credits/calculate_remaining_debt';
import { calculateCloseContractInterest } from '@/lib/Credits/calculate_close_contract_interest';
import { getUnpaidStartDate } from '@/lib/Credits/get_unpaid_start_date';
import { recordDailyPayments } from '@/lib/Credits/record_daily_payments';
import { calculateActualLoanAmount } from '@/lib/Credits/calculate_actual_loan_amount';
import { getCurrentUser } from '@/lib/auth';
import { DatePicker } from '@/components/ui/date-picker';
import { format, addDays, isAfter, isBefore } from "date-fns";
import { vi } from 'date-fns/locale';
import { usePermissions } from '@/hooks/usePermissions';
interface CloseTabProps {
  credit: CreditWithCustomer;
  onClose: () => void;
}

export function CloseTab({ credit, onClose }: CloseTabProps) {
  const { toast } = useToast();
  const [remainingAmount, setRemainingAmount] = useState(0);
  const [oldDebt, setOldDebt] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [loanAmount, setLoanAmount] = useState(0);
  const [payDebt, setPayDebt] = useState(true); // Track whether to pay debt or not
  const today = useMemo(() => new Date().toISOString().split('T')[0], []); // Ngày hôm nay
  // Ngày bắt đầu hợp đồng
  const startDate = useMemo(() => {
    if (!credit?.loan_date) return today;
    return credit.loan_date;
  }, [credit?.loan_date, today]);
  const { hasPermission } = usePermissions();
  // Tính toán ngày kết thúc hợp đồng
  const endDate = useMemo(() => {
    if (!credit?.loan_date || !credit?.loan_period) return today;
    
    const loanStartDate = new Date(credit.loan_date);
    const loanEndDate = addDays(loanStartDate, credit.loan_period - 1);
    
    // Format to YYYY-MM-DD
    return loanEndDate.toISOString().split('T')[0];
  }, [credit?.loan_date, credit?.loan_period, today]);

  // Mặc định là ngày hiện tại nếu ngày hiện tại nằm trong khoảng hợp đồng
  // Nếu ngày hiện tại nằm ngoài khoảng, sử dụng ngày cuối cùng của hợp đồng
  const defaultDate = useMemo(() => {
    const currentDate = new Date();
    const contractStartDate = new Date(startDate);
    const contractEndDate = new Date(endDate);
    
    if (currentDate >= contractStartDate && currentDate <= contractEndDate) {
      return today;
    }
    
    return endDate;
  }, [today, startDate, endDate]);
  
  const [closingDate, setClosingDate] = useState<string>(defaultDate);
  
  const isClosed = credit?.status === CreditStatus.CLOSED || credit?.status === CreditStatus.DELETED;
  
  // Xác thực ngày được chọn
  const validateAndSetDate = (date: string) => {
    const selectedDate = new Date(date);
    const contractStartDate = new Date(startDate);
    const contractEndDate = new Date(endDate);
    
    // Reset hours để so sánh chỉ theo ngày
    selectedDate.setHours(0, 0, 0, 0);
    contractStartDate.setHours(0, 0, 0, 0);
    contractEndDate.setHours(0, 0, 0, 0);
    
    // Nếu ngày được chọn trước ngày bắt đầu hợp đồng
    if (isBefore(selectedDate, contractStartDate)) {
      toast({
        title: "Lưu ý",
        description: "Ngày đóng không thể trước ngày bắt đầu hợp đồng. Đã điều chỉnh thành ngày bắt đầu.",
      });
      setClosingDate(startDate);
      return;
    }
    
    // Nếu ngày được chọn sau ngày kết thúc hợp đồng
    if (isAfter(selectedDate, contractEndDate)) {
      toast({
        title: "Lưu ý",
        description: "Ngày đóng không thể sau ngày kết thúc hợp đồng. Đã điều chỉnh thành ngày kết thúc.",
      });
      setClosingDate(endDate);
      return;
    }
    
    setClosingDate(date);
  };
  
  const handleCloseCredit = async (creditId: string, shouldPayDebt: boolean = true) => {
    console.log('Closing credit:', creditId, 'Pay debt:', shouldPayDebt, 'Closing date:', closingDate);
    const { id: userId } = await getCurrentUser();
    
    setIsClosing(true);
    
    try {
      const status = await getCreditStatus(creditId);
      if (status === CreditStatus.CLOSED) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Hợp đồng đã đóng"
        });
        return;
      } else if (status === CreditStatus.DELETED) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Hợp đồng đã bị xóa"
        });
        return;
      }
      const contractCloseAmount = await calculateActualLoanAmount(creditId); // Tiền gốc
      
      // Case 1: Nếu tiền lãi phí <= 0, chỉ cần chuyển trạng thái sang CLOSED
      if (remainingAmount < 0) {
        console.log('No remaining interest, just closing contract...');
        
        // Ghi lịch sử hoàn/trả gốc (contract_close)
        await supabase
          .from('credit_history')
          .insert({
            credit_id: creditId,
            transaction_type: 'contract_close',
            credit_amount: contractCloseAmount + remainingAmount,
            debit_amount: 0,
            description: `Đóng hợp đồng (gốc: ${formatCurrency(loanAmount)} + lãi: ${formatCurrency(remainingAmount)})`,
            is_created_from_contract_closure: true,
            created_by: userId
          } as any);
      } 
      // Case 2: Nếu lãi phí > 0, cần thêm lịch sử từ ngày bắt đầu chưa đóng đến ngày đã chọn
      else if (remainingAmount > 0) {
        console.log('Remaining interest > 0, adding daily payment history...');
        
        // Lấy ngày bắt đầu chưa đóng
        const unpaidStartDate = await getUnpaidStartDate(creditId);
        // Sử dụng ngày đã chọn thay vì today
        const selectedDate = closingDate;
        
        console.log('Unpaid start date:', unpaidStartDate);
        console.log('Selected date:', selectedDate);
        
        if (!unpaidStartDate) {
          throw new Error('Không thể xác định ngày bắt đầu chưa đóng');
        }
        
        // Thêm lịch sử thanh toán từng ngày với date_status phù hợp
        await recordDailyPayments(creditId, unpaidStartDate, selectedDate);
        
        // Ghi lịch sử hoàn/trả gốc (contract_close)
        await supabase
          .from('credit_history')
          .insert({
            credit_id: creditId,
            transaction_type: 'contract_close',
            credit_amount: contractCloseAmount,
            debit_amount: 0,
            description: `Đóng hợp đồng (gốc: ${formatCurrency(loanAmount)} + lãi: ${formatCurrency(remainingAmount)})`,
            is_created_from_contract_closure: true,
            created_by: userId
          } as any);
      }
      // Case 3: Nếu lãi phí = 0, chỉ cần ghi thanh toán gốc vào lịch sử
      else {
        await supabase
          .from('credit_history')
          .insert({
            credit_id: creditId,
            transaction_type: 'contract_close',
            credit_amount: loanAmount,
            debit_amount: 0,
            description: `Đóng hợp đồng (gốc: ${formatCurrency(loanAmount)})`,
            is_created_from_contract_closure: true,
            created_by: userId
          } as any);
      }

      // Ghi lịch sử thanh toán nợ cũ nếu có và được chọn thanh toán
      if (oldDebt !== 0 && shouldPayDebt) {
        await supabase
          .from('credit_history')
          .insert({
            credit_id: creditId,
            transaction_type: 'debt_payment',
            credit_amount: oldDebt > 0 ? Math.abs(oldDebt) : 0,
            debit_amount: oldDebt < 0 ? Math.abs(oldDebt) : 0,
            description: oldDebt > 0 
              ? 'Thanh toán nợ cũ khi đóng hợp đồng' 
              : 'Hoàn trả tiền thừa khi đóng hợp đồng',
            is_created_from_contract_closure: true,
            created_by: userId
          } as any);
      }

      // Update credit status to closed and debt_amount based on whether debt is paid
      const { error: updateError } = await updateCreditStatus(creditId, CreditStatus.CLOSED);

      if (updateError) {
        throw new Error('Không thể cập nhật trạng thái hợp đồng');
      }

      // Show success toast
      toast({
        title: "Thành công",
        description: shouldPayDebt 
          ? "Đã đóng hợp đồng và thanh toán nợ thành công"
          : "Đã đóng hợp đồng thành công (giữ nguyên nợ cũ)",
      });

      // Close the modal
      onClose();

      // Reload the page
      window.location.reload();

    } catch (error) {
      console.error('Error in handleCloseCredit:', error);
      toast({
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Có lỗi xảy ra khi đóng hợp đồng",
        variant: "destructive"
      });
    } finally {
      setIsClosing(false);
    }
  };

  // Hàm tính toán lại các giá trị dựa trên ngày đã chọn
  const calculateAmounts = async () => {
    if (!credit?.id) return;
    
    setIsCalculating(true);
    
    try {
      const debtAmount = await calculateDebtToLatestPaidPeriod(credit.id);
      setOldDebt(debtAmount);
      
      // Sử dụng ngày đã chọn thay vì today
      const selectedDate = closingDate;
      const interestAmount = await calculateCloseContractInterest(credit.id, selectedDate);
      setRemainingAmount(interestAmount);
      
    } catch (error) {
      console.error('Error calculating amounts:', error);
      setOldDebt(credit.debt_amount || 0);
      setRemainingAmount(0);
      
      toast({
        title: "Lỗi",
        description: "Không thể tính toán số tiền. Sử dụng giá trị mặc định.",
        variant: "destructive"
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // Tính toán số tiền khi component được load hoặc khi ngày đóng hợp đồng thay đổi
  useEffect(() => {
    calculateAmounts();
  }, [credit?.id, credit?.debt_amount, closingDate]);

  useEffect(() => {
    async function fetchLoanAmount() {
      try {
        const amount = await calculateActualLoanAmount(credit.id);
        setLoanAmount(amount);
      } catch (error) {
        console.error('Error calculating loan amount:', error);
      }
    }
    
    fetchLoanAmount();
  }, [credit.id]);

  const formattedStartDate = format(new Date(startDate), 'dd/MM/yyyy', { locale: vi });
  const formattedEndDate = format(new Date(endDate), 'dd/MM/yyyy', { locale: vi });
  
  return (
    <div className="p-4">
      <div className="p-4 border rounded-md">
        <h3 className="text-lg font-medium mb-4">Đóng hợp đồng</h3>

        {isCalculating && (
          <div className="flex items-center justify-center p-4 mb-4 bg-blue-50 border border-blue-200 rounded">
            <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mr-2"></div>
            <span className="text-blue-700">Đang tính toán số tiền nợ và lãi phí...</span>
          </div>
        )}

        {isClosing && (
          <div className="flex items-center justify-center p-4 mb-4 bg-orange-50 border border-orange-200 rounded">
            <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-orange-600 animate-spin mr-2"></div>
            <span className="text-orange-700">Đang xử lý đóng hợp đồng...</span>
          </div>
        )}

        {/* Date picker cho ngày đóng hợp đồng */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Ngày đóng hợp đồng (từ {formattedStartDate} đến {formattedEndDate})
          </label>
          <DatePicker
            value={closingDate}
            onChange={(date) => validateAndSetDate(date)}
            placeholder="Chọn ngày đóng hợp đồng"
            className="w-full"
            maxDate={endDate}
            minDate={startDate}
            disabled={isClosed || !hasPermission('sua_ngay_dong_hop_dong_tin_chap')}
          />
        </div>

        <div className="mb-4 border rounded-md overflow-hidden">
          <table className="w-full border-collapse">
            <tbody>
              <tr className="bg-gray-50">
                <td className="px-4 py-2 font-medium border">
                  Tiền vay gốc
                </td>
                <td className="px-4 py-2 text-right font-medium border">
                  {formatCurrency(loanAmount)}
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-2 font-medium border">
                  Nợ cũ
                </td>
                <td className="px-4 py-2 text-right font-medium border">
                  {isCalculating ? (
                    <div className="flex items-center justify-end">
                      <div className="h-3 w-3 rounded-full border border-gray-400 border-t-transparent animate-spin mr-1"></div>
                      <span className="text-gray-500 text-sm">Đang tính...</span>
                    </div>
                  ) : (
                    oldDebt >= 0 
                      ? formatCurrency(oldDebt)
                      : <span className="text-red-600">-{formatCurrency(Math.abs(oldDebt))}</span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 border font-bold">Tiền lãi phí</td>
                <td className="px-4 py-2 text-right border text-red-600">
                  {isCalculating ? (
                    <div className="flex items-center justify-end">
                      <div className="h-3 w-3 rounded-full border border-gray-400 border-t-transparent animate-spin mr-1"></div>
                      <span className="text-gray-500 text-sm">Đang tính...</span>
                    </div>
                  ) : (
                    remainingAmount >= 0 
                    ? formatCurrency(remainingAmount)
                    : <span className="text-green-600">{formatCurrency((remainingAmount))}</span>
                  )}
                </td>
              </tr>
              <tr className="bg-red-50">
                <td className="px-4 py-3 font-medium border text-red-700">
                  Còn lại phải đóng để đóng hợp đồng
                </td>
                <td className="px-4 py-3 text-right border font-bold text-red-700 text-lg">
                  {isCalculating ? (
                    <div className="flex items-center justify-end">
                      <div className="h-4 w-4 rounded-full border-2 border-red-400 border-t-transparent animate-spin mr-2"></div>
                      <span className="text-red-500">Đang tính...</span>
                    </div>
                  ) : (
                    formatCurrency(loanAmount + oldDebt + remainingAmount)
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div className="mt-6 flex justify-center">
          {/* Show single button if no old debt or contract is already closed */}
          {(oldDebt === 0 || isClosed) ? (
            <Button 
              onClick={() => { setPayDebt(true); setShowConfirm(true); }} 
              className="bg-blue-600 hover:bg-blue-700 text-white px-8"
              disabled={isClosed || isCalculating || isClosing}
            >
              {isClosing ? "Đang đóng HĐ..." :
               isCalculating ? "Đang tính toán..." :
               credit?.status === CreditStatus.DELETED ? "Hợp đồng đã xóa" : 
               credit?.status === CreditStatus.CLOSED ? "Hợp đồng đã đóng" : "Đóng HĐ"}
            </Button>
          ) : (
            /* Show two buttons if there's old debt */
            <div className="flex gap-4">
              <Button 
                onClick={() => { setPayDebt(true); setShowConfirm(true); }} 
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                disabled={isCalculating || isClosing}
              >
                {isClosing && payDebt ? "Đang đóng HĐ..." :
                 isCalculating ? "Đang tính toán..." : "Đóng HĐ và trả nợ"}
              </Button>
              <Button 
                onClick={() => { setPayDebt(false); setShowConfirm(true); }} 
                className="bg-orange-600 hover:bg-orange-700 text-white px-6"
                disabled={isCalculating || isClosing}
              >
                {isClosing && !payDebt ? "Đang đóng HĐ..." :
                 isCalculating ? "Đang tính toán..." : "Đóng HĐ và không trả nợ"}
              </Button>
            </div>
          )}
        </div>
      </div>
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận đóng hợp đồng</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p>Bạn có chắc chắn muốn đóng hợp đồng này không? Sau khi đóng, hợp đồng sẽ không thể chỉnh sửa.</p>
            
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm">
                <strong>Ngày đóng hợp đồng:</strong> {format(new Date(closingDate), 'dd/MM/yyyy', { locale: vi })}
              </p>
              <p className="text-sm mt-1">
                <strong>Xử lý:</strong> {remainingAmount <= 0 
                  ? "Chỉ cần đóng hợp đồng (không còn lãi phí)" 
                  : `Sẽ tạo lịch sử thanh toán cho lãi phí ${formatCurrency(remainingAmount)} và xử lý đóng hợp đồng`}
              </p>
              {oldDebt !== 0 && (
                <p className="text-sm mt-1">
                  <strong>Nợ cũ:</strong> {payDebt 
                    ? `Sẽ thanh toán nợ cũ ${formatCurrency(Math.abs(oldDebt))}` 
                    : `Sẽ giữ nguyên nợ cũ ${formatCurrency(Math.abs(oldDebt))}`}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={isClosing}>
              Huỷ
            </Button>
            <Button 
              className="bg-blue-600 text-white" 
              onClick={() => { setShowConfirm(false); handleCloseCredit(credit.id, payDebt); }}
              disabled={isClosing}
            >
              {isClosing ? "Đang xử lý..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
