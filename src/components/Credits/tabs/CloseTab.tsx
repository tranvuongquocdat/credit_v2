'use client';

import { useEffect, useState } from 'react';
import { CreditStatus, CreditWithCustomer } from '@/models/credit';
import { Button } from '@/components/ui/button';
import { calculateDailyRateForCredit, calculateInterestAmount } from '@/lib/interest-calculator';
import { formatCurrency } from '@/lib/utils';
import { getCreditPaymentPeriods } from '@/lib/credit-payment';
import { updateCredit } from '@/lib/credit';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';

interface CloseTabProps {
  credit: CreditWithCustomer;
  onClose: () => void;
}

export function CloseTab({ credit, onClose }: CloseTabProps) {
  const { toast } = useToast();
  const [remainingAmount, setRemainingAmount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const loanAmount = credit?.loan_amount || 0;
  
  const handleCloseCredit = async (creditId: string) => {
    console.log('Closing credit:', creditId);
    
    try {
      // Thêm lịch sử đóng hợp đồng
      try {
        const { recordContractClosure } = await import('@/lib/credit-amount-history');
        
        // Tách thành ba phần riêng biệt
        // 1. Phần đóng hợp đồng (tiền vay gốc + lãi phí)
        const contractCloseAmount = loanAmount + remainingAmount;
        
        // Ghi nhận việc đóng hợp đồng vào lịch sử
        await recordContractClosure(
          creditId,
          contractCloseAmount,
          new Date().toISOString(),
          'Đóng hợp đồng tất toán'
        );
        
        // 2. Phần thanh toán nợ cũ (nếu có) - chỉ ghi lịch sử
        if (credit.debt_amount !== 0) {
          // Chỉ ghi lịch sử mà không cập nhật loan_amount
          const description = credit.debt_amount > 0 
            ? 'Thanh toán nợ cũ khi đóng hợp đồng' 
            : 'Hoàn trả tiền thừa khi đóng hợp đồng';
            
          await supabase
            .from('credit_amount_history')
            .insert({
              credit_id: creditId,
              transaction_type: credit.debt_amount > 0 ? 'payment' : 'payment_cancel',
              credit_amount: credit.debt_amount > 0 ? Math.abs(credit.debt_amount) : 0, 
              debit_amount: credit.debt_amount < 0 ? Math.abs(credit.debt_amount) : 0,
              description: description
            });
        }
      } catch (historyError) {
        console.error('Error recording contract closure:', historyError);
        // Tiếp tục xử lý ngay cả khi ghi lịch sử lỗi
      }

      // Update credit status to closed and debt_amount to 0
      const { error: updateError } = await updateCredit(creditId, { status: 'closed' as CreditStatus, debt_amount: 0 });
      
      if (updateError) {
        console.error('Error updating credit status:', updateError);
        toast({
          title: "Lỗi",
          description: "Không thể cập nhật trạng thái hợp đồng",
          variant: "destructive"
        });
        return;
      }

      // Show success toast
      toast({
        title: "Thành công",
        description: "Đã đóng hợp đồng thành công",
      });

      // Close the modal
      onClose();

      // Reload the page
      window.location.reload();

    } catch (error) {
      console.error('Error in handleCloseCredit:', error);
      toast({
        title: "Lỗi",
        description: "Có lỗi xảy ra khi đóng hợp đồng",
        variant: "destructive"
      });
    }
  };
  useEffect(() => {
    async function fetchPaymentPeriods() {
      if (!credit?.id) return;
      
      try {
        const { data } = await getCreditPaymentPeriods(credit.id);
        const today = new Date();
        // Reset the time component to midnight
        today.setHours(0, 0, 0, 0);
        
        // Format dates for display - moved to top of the function
        const formatDateForLog = (date: Date): string => {
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };
        
        console.log('--- Debug Credit Close Tab ---');
        console.log('Credit ID:', credit.id);
        console.log('Payment periods data:', data);
        
        // Get loan dates
        const loanStartDate = new Date(credit.loan_date);
        // Reset the time component to midnight
        loanStartDate.setHours(0, 0, 0, 0);
        
        const loanPeriodDays = credit.loan_period || 0;
        const loanEndDate = new Date(loanStartDate);
        loanEndDate.setDate(loanStartDate.getDate() + loanPeriodDays - 1); // -1 because loan_period includes the start date
        
        console.log('Loan start date:', formatDateForLog(loanStartDate));
        console.log('Loan end date:', formatDateForLog(loanEndDate));
        console.log('Today:', formatDateForLog(today));
        
        // Determine contract type
        let type: 'past' | 'present' | 'future' = 'present';
        
        if (today.getTime() > loanEndDate.getTime()) {
          type = 'past'; // Contract entirely in the past
        } else if (today.getTime() < loanStartDate.getTime()) {
          type = 'future'; // Contract entirely in the future
        } else {
          type = 'present'; // Contract includes today
        }
        
        // Calculate old debt as the difference between actual and expected amounts for each paid period
        let calculatedOldDebt = 0;
        if (data && data.length > 0) {
          // Filter periods that have been paid
          const paidPeriods = data.filter(p => 
            p.actual_amount > 0
          );
          
          console.log('Paid periods:', paidPeriods.length);
        }
        
        // Calculate A: Total actual amount paid across all periods
        const totalPaid = data ? data.reduce((sum, period) => sum + (period.actual_amount || 0), 0) : 0;
        
        // Calculate B based on contract type
        let amountB = 0;
        
        if (type === 'future') {
          // Case 3: Contract completely in the future
          amountB = 0;
          console.log('Future contract - Amount B set to 0');
        } else if (type === 'past') {
          // Case 1: Contract completely in the past
          // Sum all actual amounts
          if (data && data.length > 0) {
            // Get all actual amounts
            amountB = totalPaid;
            console.log('Past contract with periods - Starting Amount B with totalPaid:', totalPaid);
            
            // Add interest from the day after the last period until today
            const sortedPeriods = [...data].sort((a, b) => {
              const dateA = new Date(b.end_date);
              const dateB = new Date(a.end_date);
              dateA.setHours(0, 0, 0, 0);
              dateB.setHours(0, 0, 0, 0);
              return dateA.getTime() - dateB.getTime();
            });
            
            const lastPeriod = sortedPeriods[0];
            const lastPeriodEndDate = new Date(lastPeriod.end_date);
            lastPeriodEndDate.setHours(0, 0, 0, 0);
            
            const dayAfterLastPeriod = new Date(lastPeriodEndDate);
            dayAfterLastPeriod.setDate(lastPeriodEndDate.getDate() + 1);
            
            console.log('Last period end date:', formatDateForLog(lastPeriodEndDate));
            console.log('Day after last period:', formatDateForLog(dayAfterLastPeriod));
            console.log('Dates equal check:', lastPeriodEndDate.getTime() === dayAfterLastPeriod.getTime());
            
            // Calculate days between the day after last period and today
            const daysAfterLastPeriod = Math.floor(
              (today.getTime() - dayAfterLastPeriod.getTime()) / (1000 * 60 * 60 * 24)
            ) + 1;
            
            console.log('Days after last period:', daysAfterLastPeriod);
            
            if (daysAfterLastPeriod > 0) {
              // Calculate daily interest rate
              const dailyRate = calculateDailyRateForCredit(credit);
              const additionalInterest = Math.round(credit.loan_amount * dailyRate * daysAfterLastPeriod);
              
              console.log('Daily interest rate:', dailyRate);
              console.log('Additional interest:', additionalInterest);
              
              // Add to amount B
              amountB += additionalInterest;
              console.log('Updated Amount B with additional interest:', amountB);
            }
          } else {
            // No periods at all, calculate from loan start to today
            const daysSinceStart = Math.floor(
              (today.getTime() - loanStartDate.getTime()) / (1000 * 60 * 60 * 24)
            ) + 1;
            
            console.log('Past contract with no periods - Days since start:', daysSinceStart);
            
            if (daysSinceStart > 0) {
              const additionalInterest = calculateInterestAmount(credit, daysSinceStart);
              amountB = additionalInterest;
              console.log('Interest since start:', additionalInterest);
            }
          }
        } else if (type === 'present') {
          // Case 2: Contract includes today
          if (data && data.length > 0) {
            let foundTodayPeriod = false;
            let accumulatedTotal = 0;
            
            console.log('Present contract with periods');
            
            // Sort periods by start date
            const sortedPeriods = [...data].sort((a, b) => {
              const dateA = new Date(a.start_date);
              const dateB = new Date(b.start_date);
              dateA.setHours(0, 0, 0, 0);
              dateB.setHours(0, 0, 0, 0);
              return dateA.getTime() - dateB.getTime();
            });
            
            // Process each period
            for (const period of sortedPeriods) {
              const periodStartDate = new Date(period.start_date);
              const periodEndDate = new Date(period.end_date);
              
              // Reset time components
              periodStartDate.setHours(0, 0, 0, 0);
              periodEndDate.setHours(0, 0, 0, 0);
              
              console.log(`Period ${period.period_number}: ${formatDateForLog(periodStartDate)} to ${formatDateForLog(periodEndDate)}, actual: ${period.actual_amount}, expected: ${period.expected_amount}`);
              
              if ((today.getTime() >= periodStartDate.getTime()) && (today.getTime() <= periodEndDate.getTime())) {
                // This period contains today
                foundTodayPeriod = true;
                console.log('This period contains today');
                
                // Calculate days from period start to today
                const daysFromStart = Math.floor(
                  (today.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)
                ) + 1; // +1 to include today
                
                // Calculate total days in period
                const totalDaysInPeriod = Math.floor(
                  (periodEndDate.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)
                ) + 1; // +1 to include both start and end days
                
                console.log('Days from period start to today:', daysFromStart);
                console.log('Total days in period:', totalDaysInPeriod);
                
                // Calculate daily amount and the amount up to today
                const dailyAmount = period.expected_amount / totalDaysInPeriod;
                const amountUpToToday = Math.round(dailyAmount * daysFromStart);
                
                console.log('Daily amount:', dailyAmount);
                console.log('Amount up to today for this period:', amountUpToToday);
                
                // Add to accumulated total
                accumulatedTotal += amountUpToToday;
                console.log('Accumulated total so far:', accumulatedTotal);
                break;
              } else if (periodEndDate.getTime() < today.getTime()) {
                // This period is before today, add full actual amount
                accumulatedTotal += period.actual_amount || 0;
                console.log('Period is before today, adding actual amount:', period.actual_amount);
                console.log('Accumulated total so far:', accumulatedTotal);
              }
            }
            
            // If no period contains today, but we're in present type
            if (!foundTodayPeriod) {
              console.log('No period contains today, calculating from next period start date');
              // calculate next period start date
              const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
              const lastPeriodEndDate = new Date(lastPeriod.end_date);
              lastPeriodEndDate.setHours(0, 0, 0, 0);
              const nextPeriodStartDate = new Date(lastPeriodEndDate);
              nextPeriodStartDate.setDate(lastPeriodEndDate.getDate() + 1);
              nextPeriodStartDate.setHours(0, 0, 0, 0);
              console.log('Next period start date:', formatDateForLog(nextPeriodStartDate));
              
              
              // Calculate interest from next period start date to today
              const daysFromStart = Math.floor(
                (today.getTime() - nextPeriodStartDate.getTime()) / (1000 * 60 * 60 * 24)
              ) + 1; // +1 to include today
              
              console.log('Days from loan start to today:', daysFromStart);
              
              const interestToday = calculateInterestAmount(credit, daysFromStart);
              console.log('Interest from start to today:', interestToday);
              
              accumulatedTotal += interestToday;
              console.log('Updated accumulated total:', accumulatedTotal);
            }
            
            amountB = accumulatedTotal;
          } else {
            // No periods, calculate interest for just today
            // Since today is within contract period, calculate from start to today
            console.log('Present contract with no periods');
            
            const daysFromStart = Math.floor(
              (today.getTime() - loanStartDate.getTime()) / (1000 * 60 * 60 * 24)
            ) + 1; // +1 to include today
            
            console.log('Days from loan start to today:', daysFromStart);
            
            const dailyRate = calculateDailyRateForCredit(credit);
            amountB = Math.round(credit.loan_amount * dailyRate * daysFromStart);
            
            console.log('Daily rate:', dailyRate);
            console.log('Interest from start to today:', amountB);
          }
        }
        
        // Calculate remaining amount based on contract type
        let remaining = 0;
        if (type === 'past') {
          // For past contracts: A - B
          remaining = amountB - totalPaid;
          console.log('Past contract - Remaining Amount (A - B):', remaining);
        } else {
          // For present and future contracts: B - A
          console.log('Present/Future contract - Total Paid:', totalPaid);
          remaining =  amountB - totalPaid;
          console.log('Present/Future contract - Remaining Amount (B - A):', remaining);
        }
        
        setRemainingAmount(remaining);
        console.log('Final Remaining Amount:', remaining);
        
      } catch (error) {
        console.error('Error fetching payment periods:', error);
      }
    }
    
    fetchPaymentPeriods();
  }, [credit?.id, credit?.loan_date, credit?.loan_period, credit?.loan_amount]);
  
  return (
    <div className="p-4">
      <div className="p-4 border rounded-md">
        <h3 className="text-lg font-medium mb-4">Đóng hợp đồng</h3>

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
                  {credit.debt_amount >= 0 
                    ? formatCurrency(credit.debt_amount)
                    : <span className="text-red-600">-{formatCurrency(Math.abs(credit.debt_amount))}</span>
                  }
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 border font-bold">Tiền lãi phí</td>
                <td className="px-4 py-2 text-right border text-red-600">
                  {remainingAmount >= 0 
                    ? formatCurrency(remainingAmount)
                    : <span className="text-green-600">{formatCurrency((remainingAmount))}</span>
                  }
                </td>
              </tr>
              <tr className="bg-red-50">
                <td className="px-4 py-3 font-medium border text-red-700">
                  Còn lại phải đóng để đóng hợp đồng
                </td>
                <td className="px-4 py-3 text-right border font-bold text-red-700 text-lg">
                  {formatCurrency(loanAmount + credit.debt_amount + remainingAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div className="mt-6 flex justify-center">
          <Button onClick={() => setShowConfirm(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-8">
            Đóng HĐ
          </Button>
        </div>
      </div>
      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận đóng hợp đồng</DialogTitle>
          </DialogHeader>
          <div>Bạn có chắc chắn muốn đóng hợp đồng này không? Sau khi đóng, hợp đồng sẽ không thể chỉnh sửa.</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Huỷ</Button>
            <Button className="bg-blue-600 text-white" onClick={() => { setShowConfirm(false); handleCloseCredit(credit.id); }}>Xác nhận</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
