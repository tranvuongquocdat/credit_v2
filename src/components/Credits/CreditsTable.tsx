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
import { CreditWithCustomer, CreditStatus } from '@/models/credit';
import { FileEditIcon, MoreVertical, Trash2Icon, CalendarIcon, ClockIcon, DollarSignIcon } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getInterestDisplayString, calculateDailyRateForCredit } from '@/lib/interest-calculator';
import { useState, useEffect, useCallback } from 'react';
import { getCreditPaymentPeriods } from '@/lib/credit-payment';
import { CreditPaymentPeriod } from '@/models/credit-payment';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface CreditsTableProps {
  credits: CreditWithCustomer[];
  statusMap: StatusMapType;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (credit: CreditWithCustomer) => void;
  onUpdateStatus: (credit: CreditWithCustomer) => void;
  onShowPaymentHistory?: (credit: CreditWithCustomer) => void;
}

// Kết quả truy vấn từ hàm calculateCreditPayment
interface CreditPaymentInfo {
  paidInterest: number;
  oldDebt: number;
  loading: boolean;
}

// Kết quả truy vấn từ hàm calculateNextPaymentDate
interface NextPaymentInfo {
  nextDate: string | null;
  isCompleted: boolean;
  loading: boolean;
}

// Kết quả truy vấn từ hàm calculateInterestToday
interface InterestTodayInfo {
  interestToday: number;
  loading: boolean;
}

export function CreditsTable({ 
  credits, 
  statusMap, 
  onView, 
  onEdit, 
  onDelete, 
  onUpdateStatus,
  onShowPaymentHistory 
}: CreditsTableProps) {
  // State để lưu trữ thông tin thanh toán cho mỗi credit
  const [paymentInfo, setPaymentInfo] = useState<Record<string, CreditPaymentInfo>>({});
  
  // State để lưu trữ thông tin ngày thanh toán tiếp theo
  const [nextPaymentInfo, setNextPaymentInfo] = useState<Record<string, NextPaymentInfo>>({});
  
  // State để lưu trữ thông tin lãi phí đến hôm nay
  const [interestTodayInfo, setInterestTodayInfo] = useState<Record<string, InterestTodayInfo>>({});
  
  // Format tiền tệ
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Format ngày tháng
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: vi });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '-';
    }
  };
  
  // Hàm tái sử dụng để tính toán lãi phí đã đóng và nợ cũ
  const calculateCreditPayment = useCallback(async (creditId: string): Promise<CreditPaymentInfo> => {
    try {
      // Truy vấn các kỳ thanh toán từ cơ sở dữ liệu
      const { data } = await getCreditPaymentPeriods(creditId);
      
      // Nếu không có dữ liệu, trả về giá trị mặc định
      if (!data || data.length === 0) {
        return { paidInterest: 0, oldDebt: 0, loading: false };
      }
      
      // Tính tổng lãi phí đã đóng
      const paidInterest = data.reduce((sum, period) => sum + (period.actual_amount || 0), 0);
      
      // Tính nợ cũ (chênh lệch giữa số tiền dự kiến và thực tế)
      let oldDebt = 0;
      data.forEach(period => {
        const expected = period.expected_amount || 0;
        const actual = period.actual_amount || 0;
        if (expected > actual) {
          oldDebt += expected - actual;
        }
      });
      
      return { paidInterest, oldDebt, loading: false };
    } catch (error) {
      console.error(`Error calculating payment info for credit ${creditId}:`, error);
      return { paidInterest: 0, oldDebt: 0, loading: false };
    }
  }, []);
  
  // Hàm tính toán ngày phải đóng lãi phí tiếp theo
  const calculateNextPaymentDate = useCallback(async (creditId: string, credit: CreditWithCustomer): Promise<NextPaymentInfo> => {
    try {
      // Truy vấn các kỳ thanh toán từ cơ sở dữ liệu
      const { data } = await getCreditPaymentPeriods(creditId);
      
      // Lấy ngày bắt đầu khoản vay
      const loanStartDate = new Date(credit.loan_date);
      
      // Tính ngày kết thúc hợp đồng
      const loanEndDate = new Date(loanStartDate);
      let loanPeriodDays = credit.loan_period;
      
      loanEndDate.setDate(loanStartDate.getDate() + loanPeriodDays - 1);
      
      // Lấy kỳ lãi (số ngày)
      const interestPeriod = credit.interest_period || 30; // Mặc định là 30 ngày
      
      // Nếu không có dữ liệu về các kỳ thanh toán
      if (!data || data.length === 0) {
        // Tính ngày kết thúc của kỳ đầu tiên
        const firstPeriodEndDate = new Date(loanStartDate);
        firstPeriodEndDate.setDate(loanStartDate.getDate() + interestPeriod - 1);
        
        // Kiểm tra xem ngày kết thúc kỳ đầu tiên có vượt quá ngày kết thúc hợp đồng không
        if (firstPeriodEndDate > loanEndDate) {
          return { nextDate: null, isCompleted: true, loading: false };
        }
        
        return { nextDate: firstPeriodEndDate.toISOString(), isCompleted: false, loading: false };
      }
      
      // Nếu có dữ liệu về các kỳ thanh toán, tìm kỳ cuối cùng đã thanh toán
      // Sắp xếp các kỳ theo số thứ tự
      const sortedPeriods = [...data].sort((a, b) => a.period_number - b.period_number);
      
      // Lấy kỳ cuối cùng (có period_number lớn nhất)
      const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
      
      // Nếu tất cả các kỳ đã thanh toán đủ, tính kỳ tiếp theo
      if (lastPeriod && lastPeriod.end_date) {
        const lastPeriodEndDate = new Date(lastPeriod.end_date);
        const nextPeriodEndDate = new Date(lastPeriodEndDate);
        nextPeriodEndDate.setDate(lastPeriodEndDate.getDate() + interestPeriod);
        
        // Nếu ngày kết thúc kỳ tiếp theo vượt quá ngày kết thúc hợp đồng
        if (nextPeriodEndDate > loanEndDate) {
          console.log('nextPeriodEndDate', nextPeriodEndDate);
          console.log('loanEndDate', loanEndDate);
          return { nextDate: null, isCompleted: true, loading: false };
        }
        
        return { nextDate: nextPeriodEndDate.toISOString(), isCompleted: false, loading: false };
      }
      
      return { nextDate: null, isCompleted: false, loading: false };
    } catch (error) {
      console.error(`Error calculating next payment date for credit ${creditId}:`, error);
      return { nextDate: null, isCompleted: false, loading: false };
    }
  }, []);
  
  // Hàm tính toán số tiền lãi phí phải nhận đến ngày hôm nay
  const calculateInterestToday = useCallback(async (creditId: string, credit: CreditWithCustomer): Promise<InterestTodayInfo> => {
    try {
      // Truy vấn các kỳ thanh toán từ cơ sở dữ liệu
      const { data } = await getCreditPaymentPeriods(creditId);
      
      // Lấy ngày hiện tại và đặt về đầu ngày để đảm bảo so sánh chính xác
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Lấy ngày bắt đầu khoản vay
      const loanStartDate = new Date(credit.loan_date);
      loanStartDate.setHours(0, 0, 0, 0);
      
      // Tính ngày kết thúc hợp đồng
      const loanEndDate = new Date(loanStartDate);
      loanEndDate.setDate(loanStartDate.getDate() + credit.loan_period - 1);
      loanEndDate.setHours(0, 0, 0, 0);
      
      // Xác định loại hợp đồng dựa trên ngày hiện tại
      let contractType: 'past' | 'present' | 'future' = 'present';
      
      if (today > loanEndDate) {
        contractType = 'past'; // Hợp đồng đã kết thúc
      } else if (today < loanStartDate) {
        contractType = 'future'; // Hợp đồng chưa bắt đầu
      }
      
      // Nếu hợp đồng chưa bắt đầu, không có lãi
      if (contractType === 'future') {
        return { interestToday: 0, loading: false };
      }
      
      // Nếu không có dữ liệu về các kỳ thanh toán
      if (!data || data.length === 0) {
        // Tính lãi phí từ ngày bắt đầu đến hôm nay hoặc ngày kết thúc (lấy ngày sớm hơn)
        const endDate = contractType === 'past' ? loanEndDate : today;
        const daysSinceLoanStart = Math.floor(
          (endDate.getTime() - loanStartDate.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1; // +1 để tính cả ngày hôm nay
        
        // Tính lãi phí dựa trên hình thức lãi
        let interestAmount = 0;
        
        // Kiểm tra loại lãi suất (tuần/tháng/ngày)
        if (credit.interest_ui_type?.startsWith('weekly')) {
          // Lãi suất theo tuần
          const weeksCount = Math.ceil(daysSinceLoanStart / 7);
          interestAmount = Math.round(credit.loan_amount * (credit.interest_value / 100) * weeksCount);
        } else if (credit.interest_ui_type?.startsWith('monthly')) {
          // Lãi suất theo tháng
          const monthsCount = Math.ceil(daysSinceLoanStart / 30);
          interestAmount = Math.round(credit.loan_amount * (credit.interest_value / 100) * monthsCount);
        } else {
          // Lãi suất theo ngày (mặc định)
          const dailyRate = calculateDailyRateForCredit(credit);
          interestAmount = Math.round(credit.loan_amount * dailyRate * daysSinceLoanStart);
        }
        
        return { interestToday: interestAmount, loading: false };
      }
      
      // Sắp xếp các kỳ theo thứ tự tăng dần của period_number
      const sortedPeriods = [...data].sort((a, b) => a.period_number - b.period_number);
      
      // Tổng lãi phí đến hôm nay
      let totalInterestToday = 0;
      
      // Xử lý từng kỳ thanh toán
      for (const period of sortedPeriods) {
        const periodStartDate = new Date(period.start_date);
        const periodEndDate = new Date(period.end_date);
        
        // Đặt giờ về 0 để so sánh chính xác
        periodStartDate.setHours(0, 0, 0, 0);
        periodEndDate.setHours(0, 0, 0, 0);
        
        // Kiểm tra xem kỳ này đã qua hay chưa
        if (periodEndDate < today) {
          // Kỳ đã qua, tính toàn bộ lãi của kỳ
          totalInterestToday += period.expected_amount || 0;
        } else if (periodStartDate <= today && today <= periodEndDate) {
          // Kỳ hiện tại chứa hôm nay, tính lãi tỷ lệ
          const daysInPeriod = Math.floor(
            (periodEndDate.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1;
          
          const daysFromStart = Math.floor(
            (today.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1;
          
          // Tính lãi tỷ lệ dựa vào loại lãi suất
          if (credit.interest_ui_type?.startsWith('weekly')) {
            // Lãi suất theo tuần
            const weeksInPeriod = Math.ceil(daysInPeriod / 7);
            const weeksFromStart = Math.ceil(daysFromStart / 7);
            
            const expectedAmount = period.expected_amount || 0;
            const weeklyAmount = expectedAmount / weeksInPeriod;
            const amountToday = Math.round(weeklyAmount * weeksFromStart);
            
            totalInterestToday += amountToday;
          } else if (credit.interest_ui_type?.startsWith('monthly')) {
            // Lãi suất theo tháng
            const monthsInPeriod = Math.ceil(daysInPeriod / 30);
            const monthsFromStart = Math.ceil(daysFromStart / 30);
            
            const expectedAmount = period.expected_amount || 0;
            const monthlyAmount = expectedAmount / monthsInPeriod;
            const amountToday = Math.round(monthlyAmount * monthsFromStart);
            
            totalInterestToday += amountToday;
          } else {
            // Lãi suất theo ngày (mặc định)
            const expectedAmount = period.expected_amount || 0;
            const dailyAmount = expectedAmount / daysInPeriod;
            const amountToday = Math.round(dailyAmount * daysFromStart);
            
            totalInterestToday += amountToday;
          }
          
          break; // Dừng sau kỳ hiện tại
        }
        // Bỏ qua các kỳ trong tương lai
      }
      
      // Nếu hợp đồng đã kết thúc (past) và ngày hôm nay vượt quá ngày kết thúc của kỳ cuối cùng
      if (contractType === 'past' && sortedPeriods.length > 0) {
        const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
        const lastPeriodEndDate = new Date(lastPeriod.end_date);
        lastPeriodEndDate.setHours(0, 0, 0, 0);
        
        if (today > lastPeriodEndDate && today <= loanEndDate) {
          // Tính lãi phí bổ sung từ ngày kết thúc kỳ cuối đến hôm nay
          const daysAfterLastPeriod = Math.floor(
            (today.getTime() - lastPeriodEndDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          if (daysAfterLastPeriod > 0) {
            // Tính lãi dựa vào loại lãi suất
            if (credit.interest_ui_type?.startsWith('weekly')) {
              // Lãi suất theo tuần
              const weeksAfterLastPeriod = Math.ceil(daysAfterLastPeriod / 7);
              const additionalInterest = Math.round(credit.loan_amount * (credit.interest_value / 100) * weeksAfterLastPeriod);
              totalInterestToday += additionalInterest;
            } else if (credit.interest_ui_type?.startsWith('monthly')) {
              // Lãi suất theo tháng
              const monthsAfterLastPeriod = Math.ceil(daysAfterLastPeriod / 30);
              const additionalInterest = Math.round(credit.loan_amount * (credit.interest_value / 100) * monthsAfterLastPeriod);
              totalInterestToday += additionalInterest;
            } else {
              // Lãi suất theo ngày (mặc định)
              const dailyRate = calculateDailyRateForCredit(credit);
              const additionalInterest = Math.round(credit.loan_amount * dailyRate * daysAfterLastPeriod);
              totalInterestToday += additionalInterest;
            }
          }
        }
      }
      
      return { interestToday: totalInterestToday, loading: false };
    } catch (error) {
      console.error(`Error calculating interest to today for credit ${creditId}:`, error);
      return { interestToday: 0, loading: false };
    }
  }, []);
  
  // Tải dữ liệu thanh toán cho tất cả các credit
  useEffect(() => {
    // Khởi tạo trạng thái loading cho tất cả credit
    const initialLoadingState: Record<string, CreditPaymentInfo> = {};
    const initialNextPaymentState: Record<string, NextPaymentInfo> = {};
    const initialInterestTodayState: Record<string, InterestTodayInfo> = {};
    
    credits.forEach(credit => {
      initialLoadingState[credit.id] = { paidInterest: 0, oldDebt: 0, loading: true };
      initialNextPaymentState[credit.id] = { nextDate: null, isCompleted: false, loading: true };
      initialInterestTodayState[credit.id] = { interestToday: 0, loading: true };
    });
    
    setPaymentInfo(initialLoadingState);
    setNextPaymentInfo(initialNextPaymentState);
    setInterestTodayInfo(initialInterestTodayState);
    
    // Tải dữ liệu cho từng credit
    const loadData = async () => {
      for (const credit of credits) {
        const info = await calculateCreditPayment(credit.id);
        const nextPayment = await calculateNextPaymentDate(credit.id, credit);
        const interestToday = await calculateInterestToday(credit.id, credit);
        
        setPaymentInfo(prev => ({
          ...prev,
          [credit.id]: info
        }));
        
        setNextPaymentInfo(prev => ({
          ...prev,
          [credit.id]: nextPayment
        }));
        
        setInterestTodayInfo(prev => ({
          ...prev,
          [credit.id]: interestToday
        }));
      }
    };
    
    loadData();
  }, [credits, calculateCreditPayment, calculateNextPaymentDate, calculateInterestToday]);

  return (
    <div className="rounded-md border overflow-hidden mb-4">
      <Table className="border-collapse">
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="py-2 px-3 text-center font-medium w-12 border-b border-r border-gray-200">#</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Mã HĐ</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Tên KH</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Tài sản</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Số tiền</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Ngày vay</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Lãi phí đã đóng</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Nợ cũ</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Lãi phí đến hôm nay</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Ngày phải đóng lãi phí</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Tình trạng</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bg-white divide-y divide-gray-200">
          {credits.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="py-8 text-center text-gray-500 border-b border-gray-200">
                Không tìm thấy hợp đồng nào
              </TableCell>
            </TableRow>
          ) : (
            credits.map((credit, index) => (
              <TableRow key={credit.id} className="hover:bg-gray-50 transition-colors">
                <TableCell className="py-3 px-3 text-gray-500 text-center border-b border-r border-gray-200">{index + 1}</TableCell>
                <TableCell 
                  className="py-3 px-3 font-medium text-blue-600 cursor-pointer text-center border-b border-r border-gray-200" 
                  onClick={() => onEdit(credit.id)}
                >
                  {credit.contract_code || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {credit.customer?.name || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {credit.collateral || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    {formatCurrency(credit.loan_amount)}
                    <div className="text-xs text-red-800 mt-1">
                      {getInterestDisplayString(credit)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-gray-600 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    <span className="text-base">{formatDate(credit.loan_date)}</span>
                    <div className="text-xs text-gray-400 mt-1">
                      Kỳ lãi: {credit.interest_period} {
                        credit.interest_ui_type?.startsWith('weekly') 
                          ? 'ngày (tuần)' 
                          : credit.interest_ui_type?.startsWith('monthly') 
                            ? 'ngày (tháng)' 
                            : 'ngày'
                      }
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {paymentInfo[credit.id]?.loading ? (
                    <span className="text-gray-400">Đang tải...</span>
                  ) : (
                    formatCurrency(paymentInfo[credit.id]?.paidInterest || 0)
                  )}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {paymentInfo[credit.id]?.loading ? (
                    <span className="text-gray-400">Đang tải...</span>
                  ) : (
                    formatCurrency(paymentInfo[credit.id]?.oldDebt || 0)
                  )}
                </TableCell>
                <TableCell className="py-3 px-3 text-center text-rose-600 font-medium border-b border-r border-gray-200">
                  {interestTodayInfo[credit.id]?.loading ? (
                    <span className="text-gray-400">Đang tải...</span>
                  ) : (
                    formatCurrency(interestTodayInfo[credit.id]?.interestToday || 0)
                  )}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {nextPaymentInfo[credit.id]?.loading ? (
                    <span className="text-gray-400">Đang tải...</span>
                  ) : nextPaymentInfo[credit.id]?.isCompleted ? (
                    <span className="text-green-600 font-medium">Hoàn thành</span>
                  ) : nextPaymentInfo[credit.id]?.nextDate ? (
                    <span className={
                      // Thêm màu đỏ nếu ngày thanh toán đã qua
                      new Date(nextPaymentInfo[credit.id].nextDate as string) < new Date() 
                        ? "text-red-600 font-medium" 
                        : ""
                    }>
                      {formatDate(nextPaymentInfo[credit.id].nextDate)}
                    </span>
                  ) : (
                    <span>-</span>
                  )}
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                  <div className="flex justify-center">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs",
                      statusMap[credit.status || CreditStatus.ON_TIME]?.color || "bg-gray-100 text-gray-800"
                    )}>
                      {statusMap[credit.status || CreditStatus.ON_TIME]?.label || "Không xác định"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-gray-200">
                  <div className="flex justify-center space-x-1">
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Mở menu</span>
                          <MoreVertical className="h-4 w-4 text-gray-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onView(credit.id)}>
                          Xem chi tiết
                        </DropdownMenuItem>
                        {onShowPaymentHistory && (
                          <DropdownMenuItem onClick={() => onShowPaymentHistory(credit)}>
                            Lịch sử thanh toán
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onUpdateStatus(credit)}>
                          Cập nhật trạng thái
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(credit)} className="text-red-600">
                          Xóa hợp đồng
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
