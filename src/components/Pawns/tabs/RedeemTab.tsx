'use client';

import { useEffect, useState } from 'react';
import { PawnStatus, PawnWithCustomerAndCollateral } from '@/models/pawn';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { updatePawn } from '@/lib/pawn';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { calculateCloseContractInterest } from '@/lib/Pawns/calculate_close_contract_interest';
import { processPawnRedemption } from '@/lib/Pawns/process_redeem';
import { calculateDebtToLatestPaidPeriod } from '@/lib/Pawns/calculate_remaining_debt';
import { recordDailyPayments } from '@/lib/Pawns/record_daily_payments';
import { getUnpaidStartDate } from '@/lib/Pawns/get_unpaid_start_date';
import { calculateActualLoanAmount } from '@/lib/Pawns/calculate_actual_loan_amount';

interface RedeemTabProps {
  pawn: PawnWithCustomerAndCollateral;
  onClose: () => void;
}

export function RedeemTab({ pawn, onClose }: RedeemTabProps) {
  const { toast } = useToast();
  const [remainingAmount, setRemainingAmount] = useState(0);
  const [oldDebt, setOldDebt] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [actualLoanAmount, setActualLoanAmount] = useState(0);
  const [payDebt, setPayDebt] = useState(true); // Track whether to pay debt or not
  
  const isClosed = pawn?.status === PawnStatus.CLOSED || pawn?.status === PawnStatus.DELETED;

  const handleRedeemPawn = async (pawnId: string, shouldPayDebt: boolean = true) => {
    console.log('Redeeming pawn:', pawnId, 'Pay debt:', shouldPayDebt);
    
    setIsRedeeming(true);
    
    try {
      const contractRedeemAmount = actualLoanAmount; // Tiền gốc thực tế
      
      // Case 1: Nếu tiền lãi phí <= 0, chỉ cần chuyển trạng thái sang CLOSED
      if (remainingAmount <= 0) {
        console.log('No remaining interest, just closing contract...');
        
        // Ghi lịch sử hoàn/trả gốc (contract_close)
        await supabase
          .from('pawn_history')
          .insert({
            pawn_id: pawnId,
            transaction_type: 'contract_close',
            credit_amount: contractRedeemAmount + remainingAmount,
            debit_amount: 0,
            description: `Chuộc đồ (gốc: ${formatCurrency(actualLoanAmount)} + lãi: ${formatCurrency(remainingAmount)})`,
            is_created_from_contract_closure: true

          } as any);
      } 
      // Case 2: Nếu lãi phí > 0, cần xử lý thanh toán lãi và chuộc đồ
      else if (remainingAmount > 0) {
        console.log('Remaining interest > 0, processing redemption...');
        // Lấy ngày bắt đầu chưa đóng
        const unpaidStartDate = await getUnpaidStartDate(pawnId);
        const today = new Date().toISOString().split('T')[0];
        
        console.log('Unpaid start date:', unpaidStartDate);
        console.log('Today:', today);

        if (!unpaidStartDate) {
          throw new Error('Không thể xác định ngày bắt đầu chưa đóng');
        }
        // Xử lý chuộc đồ với logic phức tạp (tạo periods, tính toán lãi)
        await recordDailyPayments(pawnId, unpaidStartDate, today);

        
        // Ghi lịch sử hoàn/trả gốc (contract_close)
        await supabase
          .from('pawn_history')
          .insert({
            pawn_id: pawnId,
            transaction_type: 'contract_close',
            credit_amount: contractRedeemAmount,
            debit_amount: 0,
            description: `Chuộc đồ (gốc: ${formatCurrency(actualLoanAmount)} + lãi: ${formatCurrency(remainingAmount)})`,
            is_created_from_contract_closure: true
          } as any);
      }

      // Ghi lịch sử thanh toán nợ cũ nếu có và được chọn thanh toán
      if (oldDebt !== 0 && shouldPayDebt) {
        await supabase
          .from('pawn_history')
          .insert({
            pawn_id: pawnId,
            transaction_type: 'debt_payment',
            credit_amount: oldDebt > 0 ? Math.abs(oldDebt) : 0,
            debit_amount: oldDebt < 0 ? Math.abs(oldDebt) : 0,
            description: oldDebt > 0 
              ? 'Thanh toán nợ cũ khi chuộc đồ' 
              : 'Hoàn trả tiền thừa khi chuộc đồ',
            is_created_from_contract_closure: true
          } as any);
      }

      // Update pawn status to closed
      const { error: updateError } = await updatePawn(pawnId, { 
        status: PawnStatus.CLOSED
      });

      if (updateError) {
        throw new Error('Không thể cập nhật trạng thái hợp đồng');
      }

      // Show success toast
      toast({
        title: "Thành công",
        description: shouldPayDebt 
          ? "Đã chuộc đồ và thanh toán nợ thành công"
          : "Đã chuộc đồ thành công (giữ nguyên nợ cũ)",
      });

      // Close the modal
      onClose();

      // Reload the page
      window.location.reload();

    } catch (error) {
      console.error('Error in handleRedeemPawn:', error);
      toast({
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Có lỗi xảy ra khi chuộc đồ",
        variant: "destructive"
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  useEffect(() => {
    async function fetchCalculatedAmounts() {
      if (!pawn?.id) return;
      
      setIsCalculating(true);
      
      try {
        // Tính số tiền vay thực tế
        const actualAmount = await calculateActualLoanAmount(pawn.id);
        setActualLoanAmount(actualAmount);
        
        const today = new Date().toISOString().split('T')[0];
        const interestAmount = await calculateCloseContractInterest(pawn.id, today);
        setRemainingAmount(interestAmount);

        // Tính nợ cũ bằng hàm có sẵn
        const debtAmount = await calculateDebtToLatestPaidPeriod(pawn.id);
        setOldDebt(debtAmount);
        
      } catch (error) {
        console.error('Error calculating amounts:', error);
        setActualLoanAmount(pawn?.loan_amount || 0);
        setRemainingAmount(0);
        setOldDebt(0);
        
        toast({
          title: "Lỗi",
          description: "Không thể tính toán số tiền. Sử dụng giá trị mặc định.",
          variant: "destructive"
        });
      } finally {
        setIsCalculating(false);
      }
    }
    
    fetchCalculatedAmounts();
  }, [pawn?.id]);

  return (
    <div className="p-4">
      <div className="p-4 border rounded-md">
        <h3 className="text-lg font-medium mb-4">Chuộc đồ</h3>

        {isCalculating && (
          <div className="flex items-center justify-center p-4 mb-4 bg-blue-50 border border-blue-200 rounded">
            <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mr-2"></div>
            <span className="text-blue-700">Đang tính toán số tiền nợ và lãi phí...</span>
          </div>
        )}

        {isRedeeming && (
          <div className="flex items-center justify-center p-4 mb-4 bg-orange-50 border border-orange-200 rounded">
            <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-orange-600 animate-spin mr-2"></div>
            <span className="text-orange-700">Đang xử lý chuộc đồ...</span>
          </div>
        )}
        
        <div className="mb-4 border rounded-md overflow-hidden">
          <table className="w-full border-collapse">
            <tbody>
              <tr className="bg-gray-50">
                <td className="px-4 py-2 font-medium border">
                  Tiền vay gốc
                </td>
                <td className="px-4 py-2 text-right font-medium border">
                  {formatCurrency(actualLoanAmount)}
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
                    : <span className="text-red-600">{formatCurrency((remainingAmount))}</span>
                  )}
                </td>
              </tr>
              <tr className="bg-red-50">
                <td className="px-4 py-3 font-medium border text-red-700">
                  Tổng cần thanh toán để chuộc đồ
                </td>
                <td className="px-4 py-3 text-right border font-bold text-red-700 text-lg">
                  {isCalculating ? (
                    <div className="flex items-center justify-end">
                      <div className="h-4 w-4 rounded-full border-2 border-green-400 border-t-transparent animate-spin mr-2"></div>
                      <span className="text-green-500">Đang tính...</span>
                    </div>
                  ) : (
                    formatCurrency(actualLoanAmount + oldDebt + remainingAmount)
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
              className="bg-green-600 hover:bg-green-700 text-white px-8"
              disabled={isClosed || isCalculating || isRedeeming}
            >
              {isRedeeming ? "Đang chuộc đồ..." :
               isCalculating ? "Đang tính toán..." :
               pawn?.status === PawnStatus.DELETED ? "Hợp đồng đã xóa" : 
               pawn?.status === PawnStatus.CLOSED ? "Đã chuộc đồ" : "Chuộc đồ"}
            </Button>
          ) : (
            /* Show two buttons if there's old debt */
            <div className="flex gap-4">
              <Button 
                onClick={() => { setPayDebt(true); setShowConfirm(true); }} 
                className="bg-green-600 hover:bg-green-700 text-white px-6"
                disabled={isCalculating || isRedeeming}
              >
                {isRedeeming && payDebt ? "Đang chuộc đồ..." :
                 isCalculating ? "Đang tính toán..." : "Chuộc đồ và trả nợ"}
              </Button>
              <Button 
                onClick={() => { setPayDebt(false); setShowConfirm(true); }} 
                className="bg-orange-600 hover:bg-orange-700 text-white px-6"
                disabled={isCalculating || isRedeeming}
              >
                {isRedeeming && !payDebt ? "Đang chuộc đồ..." :
                 isCalculating ? "Đang tính toán..." : "Chuộc đồ và không trả nợ"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận chuộc đồ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p>Bạn có chắc chắn muốn chuộc đồ cho hợp đồng này không? Sau khi chuộc, hợp đồng sẽ không thể chỉnh sửa.</p>
            
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm">
                <strong>Xử lý:</strong> {remainingAmount <= 0 
                  ? "Chỉ cần chuộc đồ (không còn lãi phí)" 
                  : `Sẽ tạo lịch sử thanh toán cho lãi phí ${formatCurrency(remainingAmount)} và xử lý chuộc đồ`}
              </p>
              {oldDebt !== 0 && (
                <p className="text-sm mt-2">
                  <strong>Nợ cũ:</strong> {payDebt 
                    ? `Sẽ thanh toán nợ cũ ${formatCurrency(Math.abs(oldDebt))}` 
                    : `Sẽ giữ nguyên nợ cũ ${formatCurrency(Math.abs(oldDebt))}`}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={isRedeeming}>
              Huỷ
            </Button>
            <Button 
              className="bg-green-600 text-white" 
              onClick={() => { setShowConfirm(false); handleRedeemPawn(pawn.id, payDebt); }}
              disabled={isRedeeming}
            >
              {isRedeeming ? "Đang xử lý..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 