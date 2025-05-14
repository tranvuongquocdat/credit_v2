"use client";

import { useState, useEffect } from 'react';
import { format, parseISO, isBefore, isAfter, addDays, differenceInDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Credit } from '@/models/credit';
import { CreditPaymentPeriod, PaymentPeriodStatus, CreditPaymentSummary } from '@/models/credit-payment';
import { calculatePaymentPeriods, calculatePaymentSummary, calculateExpectedAmountForDateRange, recalculatePeriodNumbers, calculateLastPeriodAmount, recalculateRemainingPeriodsAfterIrregular } from '@/utils/payment-calculator';
import { getCreditPaymentPeriods, createManyPaymentPeriods, deletePaymentPeriod, markPeriodAsPaid, updatePaymentPeriod, createPaymentPeriod } from '@/lib/credit-payment';
import { PaymentPeriodList, PaymentSummary, PaymentPeriodDialog, MarkAsPaidDialog } from '@/components/Credit';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Plus, Calculator } from 'lucide-react';

interface PaymentPeriodManagerProps {
  credit: Credit;
}

export function PaymentPeriodManager({ credit }: PaymentPeriodManagerProps) {
  const [periods, setPeriods] = useState<CreditPaymentPeriod[]>([]);
  const [dbPeriods, setDbPeriods] = useState<CreditPaymentPeriod[]>([]); // Lưu trữ các kỳ từ DB
  const [estimatedPeriods, setEstimatedPeriods] = useState<CreditPaymentPeriod[]>([]); // Lưu trữ các kỳ ước tính
  const [summary, setSummary] = useState<CreditPaymentSummary>({
    total_expected: 0,
    total_paid: 0,
    next_payment_date: null,
    remaining_periods: 0,
    completed_periods: 0
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPaidDialogOpen, setIsPaidDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<CreditPaymentPeriod | null>(null);
  
  // Tạo danh sách kỳ thanh toán ước tính từ thông tin hợp đồng và đối chiếu với dữ liệu thực tế
  const generateEstimatedPeriods = (considerDbPeriods = true) => {
    try {
      // Tính toán các kỳ ước tính dựa trên thông tin hợp đồng
      const calculatedPeriods = calculatePaymentPeriods(credit);
      
      if (!considerDbPeriods || dbPeriods.length === 0) {
        // Nếu không có dữ liệu từ DB hoặc không cần xem xét, sử dụng toàn bộ dữ liệu ước tính
        setEstimatedPeriods(calculatedPeriods);
        setPeriods(calculatedPeriods);
        setSummary(calculatePaymentSummary(calculatedPeriods));
        return;
      }
      
      // Sắp xếp các kỳ từ DB theo thời gian
      const sortedDbPeriods = [...dbPeriods].sort((a, b) => {
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      });
      
      // Sắp xếp các kỳ ước tính theo thời gian
      const sortedEstPeriods = [...calculatedPeriods].sort((a, b) => {
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      });
      
      // Thờ iđiểm kết thúc của kỳ đã thanh toán cuối cùng trong DB
      const paidPeriods = sortedDbPeriods.filter(p => p.status === PaymentPeriodStatus.PAID);
      const lastPaidPeriod = paidPeriods.length > 0 ? paidPeriods[paidPeriods.length - 1] : null;
      const lastPaidDate = lastPaidPeriod ? new Date(lastPaidPeriod.end_date).getTime() : 0;
      
      // Các kỳ đã có trong DB
      let existingPeriods = [...sortedDbPeriods];
      
      // Xác định các kỳ cần thêm (các kỳ ước tính chưa có trong DB và sau kỳ đã thanh toán cuối cùng)
      let futurePeriods = sortedEstPeriods.filter(estPeriod => {
        const estStart = parseISO(estPeriod.start_date);
        
        // Chỉ xem xét các kỳ trong tương lai
        if (lastPaidDate > 0 && estStart.getTime() <= lastPaidDate) {
          return false;
        }
        
        // Kiểm tra xem kỳ này có tương tự với bất kỳ kỳ nào trong DB không
        return !existingPeriods.some(dbPeriod => {
          const dbStart = parseISO(dbPeriod.start_date);
          const dbEnd = parseISO(dbPeriod.end_date);
          const estEnd = parseISO(estPeriod.end_date);
          
          // Nếu thời gian bắt đầu và kết thúc gần nhau (sai lệch tối đa 3 ngày),
          // coi chúng là cùng một kỳ
          const startDiff = Math.abs(dbStart.getTime() - estStart.getTime());
          const endDiff = Math.abs(dbEnd.getTime() - estEnd.getTime());
          
          return startDiff <= 3 * 24 * 60 * 60 * 1000 && endDiff <= 3 * 24 * 60 * 60 * 1000;
        });
      });
      
      // Các bước phải thực hiện:
      // 1. Tạo danh sách kết hợp gồm các kỳ DB và các kỳ ước tính trong tương lai
      // 2. Các kỳ ước tính mới nếu cần sẽ được điều chỉnh từ dưới lên (kỳ cuối cùng trước)
      
      let combinedPeriods: CreditPaymentPeriod[];
      
      // Nếu có kỳ đã thanh toán và có các kỳ ước tính mới cần thêm vào
      if (lastPaidPeriod && futurePeriods.length > 0) {
        combinedPeriods = [...existingPeriods];
        
        // Thừ điều chỉnh từ dưới lên (kỳ cuối cùng trước)
        // Đảo ngược các kỳ ước tính để xử lý từ cuối lên trên
        const reversedFuturePeriods = [...futurePeriods].reverse();
        
        for (const estPeriod of reversedFuturePeriods) {
          combinedPeriods.push(estPeriod);
        }
      } else {
        // Nếu không có kỳ đã thanh toán, hoặc không có kỳ ước tính mới
        combinedPeriods = [...existingPeriods, ...futurePeriods];
      }
      
      // Sắp xếp lại theo thời gian
      const sortedCombinedPeriods = combinedPeriods.sort((a, b) => {
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      });
      
      // Đánh số lại các kỳ
      const renumberedPeriods = recalculatePeriodNumbers(sortedCombinedPeriods);
      
      setEstimatedPeriods(futurePeriods);
      setPeriods(renumberedPeriods);
      setSummary(calculatePaymentSummary(renumberedPeriods));
    } catch (error) {
      console.error('Error generating estimated payment periods:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tạo danh sách kỳ đóng lãi ước tính",
        variant: "destructive"
      });
    }
  };
  
  // Fetch danh sách kỳ thanh toán từ database
  const fetchPaymentPeriods = async () => {
    console.log('Fetching payment periods for credit:', credit.id);
    setIsLoading(true);
    try {
      const { data, error } = await getCreditPaymentPeriods(credit.id);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data && data.length > 0) {
        // Lưu dữ liệu từ DB
        const typedData = data as CreditPaymentPeriod[];
        setDbPeriods(typedData);
        
        // Tính toán các kỳ ước tính chuẩn dựa trên thông tin hợp đồng
        const calculatedPeriods = calculatePaymentPeriods(credit);
        
        // Log thông tin kỳ từ DB với số tiền thực tế và tỷ lệ bù trừ
        console.log('Periods from DB:', typedData.map(p => ({
          number: p.period_number,
          start: p.start_date,
          end: p.end_date,
          expected: p.expected_amount,
          actual: p.actual_amount,
          // Tính toán phần trăm bù trừ (nếu có số tiền thêm)
          compensation: p.actual_amount > p.expected_amount ? 
            ((p.actual_amount - p.expected_amount) / p.expected_amount * 100).toFixed(2) + '%' : 
            '0%'
        })));
        
        // Sử dụng phương pháp xử lý các kỳ mới
        const processedPeriods = processPeriodsWithData(calculatedPeriods, typedData);
        
        // Kiểm tra sự khác biệt giữa các kỳ đã xử lý và các kỳ tại DB
        const hasIrregularPeriods = typedData.some(p => p.actual_amount > p.expected_amount);
        
        if (hasIrregularPeriods) {
          console.log('Phát hiện các kỳ bất thường với số tiền thêm - Điều chỉnh kế hoạch thanh toán');
        }
        
        // Cập nhật danh sách kỳ đã xử lý
        setPeriods(processedPeriods);
        setEstimatedPeriods(calculatedPeriods);
        
        // Tính toán thông tin tổng hợp về các kỳ
        setSummary(calculatePaymentSummary(processedPeriods));
      } else {
        // Nếu không có dữ liệu từ DB, sử dụng hoàn toàn dữ liệu ước tính
        setDbPeriods([]);
        
        // Tính toán các kỳ ước tính chuẩn
        const calculatedPeriods = calculatePaymentPeriods(credit);
        
        // Cập nhật các state
        setEstimatedPeriods(calculatedPeriods);
        setPeriods(calculatedPeriods);
        setSummary(calculatePaymentSummary(calculatedPeriods));
      }
    } catch (error) {
      console.error('Error fetching payment periods:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách kỳ đóng lãi",
        variant: "destructive"
      });
      
      // Nếu có lỗi khi truy vấn DB, sử dụng dữ liệu ước tính thay thế
      setDbPeriods([]);
      
      // Tính toán các kỳ ước tính chuẩn trong trường hợp lỗi
      const calculatedPeriods = calculatePaymentPeriods(credit);
      setEstimatedPeriods(calculatedPeriods);
      setPeriods(calculatedPeriods);
      setSummary(calculatePaymentSummary(calculatedPeriods));
    } finally {
      setIsLoading(false);
    }
  };
  
  // Process periods directly without relying on state updates
  const processPeriodsWithData = (calculatedPeriods: CreditPaymentPeriod[], dbData: CreditPaymentPeriod[]) => {
    try {
      if (!dbData || dbData.length === 0) {
        // Nếu không có dữ liệu từ DB, trả về các kỳ ước tính
        return calculatedPeriods;
      }
      
      // Sắp xếp các kỳ từ DB theo thời gian (start_date và end_date)
      const sortedDbPeriods = [...dbData].sort((a, b) => {
        const dateA = new Date(a.start_date).getTime();
        const dateB = new Date(b.start_date).getTime();
        
        if (dateA !== dateB) {
          return dateA - dateB;
        }
        
        return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      });
      
      console.log('Sorted DB periods:', sortedDbPeriods.map(p => 
        ({ number: p.period_number, start: p.start_date, end: p.end_date })));
      
      // Tìm kỳ DB cuối cùng theo thời gian (không phải theo period_number)
      const lastDbPeriod = sortedDbPeriods.reduce((latest, current) => {
        const latestEndDate = new Date(latest.end_date).getTime();
        const currentEndDate = new Date(current.end_date).getTime();
        return currentEndDate > latestEndDate ? current : latest;
      }, sortedDbPeriods[0]);
      
      console.log('Latest period by end date:', { 
        number: lastDbPeriod.period_number, 
        end: lastDbPeriod.end_date 
      });
      
      // Tạo danh sách kỳ mới kết hợp cả DB và ước tính
      const combinedPeriods: CreditPaymentPeriod[] = [...sortedDbPeriods];
      
      // Nếu không có kỳ nào trong DB, chỉ sử dụng kỳ ước tính
      if (sortedDbPeriods.length === 0) {
        return calculatedPeriods;
      }
      
      // Tính toán ngày kết thúc hợp đồng dựa trên thông tin credit
      const loanEndDate = addDays(parseISO(credit.loan_date), credit.loan_period);
      
      // Kiểm tra xem kỳ cuối cùng có đã đến ngày kết thúc hợp đồng chưa
      const lastPeriodEndDate = new Date(lastDbPeriod.end_date);
      
      // Nếu kỳ cuối cùng đã kéo dài đến hoặc vượt quá ngày kết thúc hợp đồng
      if (lastPeriodEndDate >= loanEndDate) {
        console.log('Last period already extends to or beyond loan end date - no additional periods needed');
        return recalculatePeriodNumbers(combinedPeriods);
      }
      
      // Còn ngày sau kỳ cuối cùng, cần tạo thêm các kỳ mới
      // Ngày bắt đầu cho kỳ tiếp theo phải là ngày sau ngày kết thúc của kỳ cuối cùng
      const nextStartDate = addDays(lastPeriodEndDate, 1);
      
      // Nếu còn ngày sau kỳ cuối cùng và trước ngày kết thúc hợp đồng
      if (nextStartDate < loanEndDate) {
        console.log('Tính toán lại các kỳ còn lại sau kỳ bất thường hoặc có số tiền thêm');
        
        // Sử dụng phương pháp mới tính toán các kỳ còn lại
        // Cách tính mới này xử lý việc phân bổ lại cả thời gian và số tiền
        // dựa trên tổng số tiền lãi và số tiền đã tính cho các kỳ trước đó
        const remainingPeriods = recalculateRemainingPeriodsAfterIrregular(
          credit,
          combinedPeriods, // Các kỳ đã tồn tại
          nextStartDate,    // Ngày bắt đầu kỳ tiếp theo
          loanEndDate       // Ngày kết thúc khoản vay
        );
        
        // Thêm các kỳ mới tính toán vào danh sách
        combinedPeriods.push(...remainingPeriods);
        
        console.log(`Đã tính toán ${remainingPeriods.length} kỳ còn lại sau điều chỉnh`);
      }
      
      // Sắp xếp lại toàn bộ các kỳ theo thời gian
      const sortedCombinedPeriods = combinedPeriods.sort((a, b) => {
        const startA = new Date(a.start_date).getTime();
        const startB = new Date(b.start_date).getTime();
        
        if (startA !== startB) {
          return startA - startB;
        }
        
        return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      });
      
      // Đánh số lại các kỳ để đảm bảo tuần tự
      return recalculatePeriodNumbers(sortedCombinedPeriods);
    } catch (error) {
      console.error('Error processing periods:', error);
      // Trường hợp lỗi, trả về kết quả từ các kỳ ước tính gốc
      return calculatedPeriods;
    }
  };

  useEffect(() => {
    // Đặt trạng thái loading khi component mount
    setIsLoading(true);
    
    // Gọi hàm async để tải dữ liệu
    const loadData = async () => {
      try {
        // Gọi API để lấy dữ liệu từ Supabase
        const { data, error } = await getCreditPaymentPeriods(credit.id);
        
        if (error) {
          throw new Error(error.message);
        }
        
        // Tính toán các kỳ ước tính dựa trên thông tin hợp đồng
        const calculatedPeriods = calculatePaymentPeriods(credit);
        
        if (data && data.length > 0) {
          // Lưu dữ liệu từ DB
          setDbPeriods(data as CreditPaymentPeriod[]);
          setEstimatedPeriods(calculatedPeriods);
          
          // Xử lý dữ liệu trực tiếp thay vì dựa vào state updates
          const processedPeriods = processPeriodsWithData(calculatedPeriods, data as CreditPaymentPeriod[]);
          setPeriods(processedPeriods);
          
          // Tính toán tổng kết dựa trên dữ liệu đã xử lý
          setSummary(calculatePaymentSummary(processedPeriods));
        } else {
          // Nếu không có dữ liệu từ DB, sử dụng hoàn toàn dữ liệu ước tính
          setDbPeriods([]);
          setEstimatedPeriods(calculatedPeriods);
          setPeriods(calculatedPeriods);
          setSummary(calculatePaymentSummary(calculatedPeriods));
        }
      } catch (error) {
        console.error('Error fetching payment periods:', error);
        toast({
          title: "Lỗi",
          description: "Không thể tải danh sách kỳ đóng lãi",
          variant: "destructive"
        });
        
        // Nếu có lỗi khi truy vấn DB, sử dụng dữ liệu ước tính thay thế
        const calculatedPeriods = calculatePaymentPeriods(credit);
        setDbPeriods([]);
        setEstimatedPeriods(calculatedPeriods);
        setPeriods(calculatedPeriods);
        setSummary(calculatePaymentSummary(calculatedPeriods));
      } finally {
        setIsLoading(false);
      }
    };
    
    // Gọi hàm async để tải dữ liệu
    loadData();
    
    // Clean up function
    return () => {
      // Có thể thêm logic xử lý khi component unmount
    };
  }, [credit.id]);
  
  // Xử lý thêm kỳ thanh toán (kỳ bất thường)
  const handleAddPeriod = async (data: any) => {
    try {
      setIsLoading(true);
      
      // Đảm bảo ngày kết thúc >= ngày bắt đầu
      const startDate = new Date(data.start_date);
      let endDate = new Date(data.end_date);
      
      if (endDate < startDate) {
        endDate = new Date(startDate);
      }
      
      // Tính toán period_number dựa trên ngày bắt đầu của kỳ mới
      // Sắp xếp tất cả các kỳ theo thời gian và đặt kỳ mới vào vị trí đúng
      const allPeriodsWithNew = [...periods, {
        credit_id: credit.id,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        // Các trường khác không quan trọng cho việc sắp xếp
      }];
      
      // Sắp xếp tất cả các kỳ theo thời gian (start_date trước rồi đến end_date)
      const sortedPeriods = allPeriodsWithNew.sort((a, b) => {
        const dateA = new Date(a.start_date).getTime();
        const dateB = new Date(b.start_date).getTime();
        const endDateA = new Date(a.end_date).getTime();
        const endDateB = new Date(b.end_date).getTime();
        
        // Đầu tiên so sánh start_date
        if (dateA !== dateB) {
          return dateA - dateB;
        }
        
        // Nếu start_date bằng nhau, so sánh end_date
        return endDateA - endDateB;
      });
      
      // Tìm vị trí của kỳ mới trong danh sách đã sắp xếp
      const newPeriodIndex = sortedPeriods.findIndex(
        p => p.start_date === format(startDate, 'yyyy-MM-dd') && 
             p.end_date === format(endDate, 'yyyy-MM-dd')
      );
      console.log(newPeriodIndex)
      // Tính period_number dựa trên vị trí trong danh sách đã sắp xếp
      const periodNumber = newPeriodIndex + 1;
      
      const newPeriod = {
        credit_id: credit.id,
        period_number: periodNumber,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        expected_amount: data.expected_amount,
        notes: data.notes || 'Kỳ thanh toán bất thường',
        payment_date: format(endDate, 'yyyy-MM-dd'),
        actual_amount: data.expected_amount,
        status: PaymentPeriodStatus.PAID,
      };
      
      console.log('Adding new custom period with number:', periodNumber);
      
      const { data: result, error } = await createPaymentPeriod(newPeriod);
      
      if (error) {
        throw new Error(error.message);
      }
      
      setIsAddDialogOpen(false);
      
      // Giai đoạn quan trọng: tạo lại tất cả các kỳ để đảm bảo tham chiếu chính xác
      // và không có khoảng cách thời gian bất thường giữa các kỳ
      const { data: dbPeriodsAfterAdd, error: fetchError } = await getCreditPaymentPeriods(credit.id);
      
      if (fetchError) {
        throw new Error(fetchError.message);
      }
      
      // Cập nhật trạng thái component với dữ liệu mới nhất
      if (dbPeriodsAfterAdd && dbPeriodsAfterAdd.length > 0) {
        setDbPeriods(dbPeriodsAfterAdd as CreditPaymentPeriod[]);
        // Tính toán lại các kỳ ước tính dựa trên dữ liệu mới
        const calculatedPeriods = calculatePaymentPeriods(credit);
        const processedPeriods = processPeriodsWithData(calculatedPeriods, dbPeriodsAfterAdd as CreditPaymentPeriod[]);
        setPeriods(processedPeriods);
        setSummary(calculatePaymentSummary(processedPeriods));
      }
      
      toast({
        title: "Thành công",
        description: "Đã thêm kỳ đóng lãi mới"
      });
    } catch (error) {
      console.error('Error adding payment period:', error);
      toast({
        title: "Lỗi",
        description: "Không thể thêm kỳ đóng lãi mới",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Xử lý cập nhật kỳ thanh toán
  const handleEditPeriod = async (data: any) => {
    if (!selectedPeriod) return;
    
    try {
      // Đảm bảo ngày kết thúc >= ngày bắt đầu
      const startDate = new Date(data.start_date);
      let endDate = new Date(data.end_date);
      
      if (endDate < startDate) {
        endDate = new Date(startDate);
      }
      
      const updateData = {
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        expected_amount: data.expected_amount,
        actual_amount: data.actual_amount,
        payment_date: data.payment_date ? format(data.payment_date, 'yyyy-MM-dd') : null,
        notes: data.notes || null
      };
      
      // Cập nhật trạng thái dựa vào số tiền đã đóng
      if (data.actual_amount > 0) {
        if (data.actual_amount >= data.expected_amount) {
          (updateData as any).status = PaymentPeriodStatus.PAID;
        } else {
          (updateData as any).status = PaymentPeriodStatus.PARTIALLY_PAID;
        }
      }
      
      // Nếu đây là kỳ ước tính (chưa có trong DB), tạo mới thay vì cập nhật
      if (!selectedPeriod.id) {
        const newPeriod = {
          credit_id: credit.id,
          period_number: selectedPeriod.period_number,
          start_date: updateData.start_date,
          end_date: updateData.end_date,
          expected_amount: updateData.expected_amount,
          actual_amount: updateData.actual_amount || 0,
          payment_date: updateData.payment_date,
          notes: updateData.notes || 'Kỳ thanh toán được đánh dấu từ ước tính',
          status: (updateData as any).status || PaymentPeriodStatus.PENDING
        };
        
        const { data: result, error } = await createPaymentPeriod(newPeriod);
        
        if (error) {
          throw new Error(error.message);
        }
      } else {
        // Nếu đã có trong DB, cập nhật
        const { data: result, error } = await updatePaymentPeriod(selectedPeriod.id, updateData);
        
        if (error) {
          throw new Error(error.message);
        }
      }
      
      setIsEditDialogOpen(false);
      setSelectedPeriod(null);
      
      // Tải lại dữ liệu từ DB và tính toán lại
      fetchPaymentPeriods();
      
      toast({
        title: "Thành công",
        description: "Đã cập nhật kỳ đóng lãi"
      });
    } catch (error) {
      console.error('Error updating payment period:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật kỳ đóng lãi",
        variant: "destructive"
      });
    }
  };
  
  // Xử lý xóa kỳ thanh toán
  const handleDeletePeriod = async () => {
    if (!selectedPeriod) return;
    
    try {
      // Chỉ có thể xóa kỳ đã lưu trong DB
      if (selectedPeriod.id) {
        const { error } = await deletePaymentPeriod(selectedPeriod.id);
        
        if (error) {
          throw new Error(error.message);
        }
        
        setIsDeleteDialogOpen(false);
        setSelectedPeriod(null);
        
        // Tải lại dữ liệu từ DB và tính toán lại
        fetchPaymentPeriods();
        
        toast({
          title: "Thành công",
          description: "Đã xóa kỳ đóng lãi"
        });
      } else {
        // Nếu là kỳ ước tính, không thể xóa
        toast({
          title: "Thông báo",
          description: "Không thể xóa kỳ đóng lãi ước tính. Kỳ này chưa được lưu vào cơ sở dữ liệu."
        });
        setIsDeleteDialogOpen(false);
        setSelectedPeriod(null);
      }
    } catch (error) {
      console.error('Error deleting payment period:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa kỳ đóng lãi",
        variant: "destructive"
      });
    }
  };
  
  // Xử lý đánh dấu đã đóng (lưu vào DB nếu là kỳ ước tính)
  const handleMarkAsPaid = async (data: any) => {
    if (!selectedPeriod) return;
    
    try {
      console.log('Xử lý đánh dấu đã thanh toán cho kỳ:', selectedPeriod.period_number);
      console.log('Dữ liệu submit:', data);
      
      // Nếu là kỳ ước tính (chưa có trong DB), tạo mới và đánh dấu đã thanh toán
      if (!selectedPeriod.id) {
        console.log('Kỳ này là ước tính, cần tạo mới trong DB');
        const newPeriod = {
          credit_id: credit.id,
          period_number: selectedPeriod.period_number,
          start_date: selectedPeriod.start_date,
          end_date: selectedPeriod.end_date,
          expected_amount: selectedPeriod.expected_amount,
          actual_amount: data.actual_amount,
          payment_date: format(data.payment_date, 'yyyy-MM-dd'),
          notes: data.notes || 'Kỳ thanh toán từ ước tính được đánh dấu đã thanh toán',
          status: PaymentPeriodStatus.PAID
        };
        
        console.log('Tạo kỳ mới:', newPeriod);
        const { data: result, error } = await createPaymentPeriod(newPeriod);
        
        if (error) {
          throw new Error(error.message);
        }
        console.log('Kết quả:', result);
      } else {
        // Nếu đã có trong DB, cập nhật trạng thái
        console.log(`Cập nhật kỳ ${selectedPeriod.id} đã có trong DB`);
        const { data: result, error } = await markPeriodAsPaid(
          selectedPeriod.id, 
          data.actual_amount, 
          format(data.payment_date, 'yyyy-MM-dd'),
          data.notes || null
        );
        
        if (error) {
          throw new Error(error.message);
        }
        console.log('Kết quả cập nhật:', result);
      }
      
      // Đóng dialog trước khi tải lại dữ liệu để tránh xung đột
      setIsPaidDialogOpen(false);
      setSelectedPeriod(null);
      
      // Để chắc chắn UI đã cập nhật trước khi fetch dữ liệu mới
      setTimeout(() => {
        // Tải lại dữ liệu từ DB và tính toán lại các kỳ
        console.log('Bắt đầu fetch lại dữ liệu...');
        fetchPaymentPeriods().then(() => {
          console.log('Fetch dữ liệu hoàn tất');
        });
      }, 300);
      
      toast({
        title: "Thành công",
        description: "Đã đánh dấu kỳ đóng lãi đã thanh toán"
      });
    } catch (error) {
      console.error('Error marking payment period as paid:', error);
      toast({
        title: "Lỗi",
        description: "Không thể đánh dấu kỳ đóng lãi đã thanh toán",
        variant: "destructive"
      });
    }
  };
  
  // Xử lý tạo tất cả các kỳ thanh toán và lưu vào DB
  const handleGenerateAllPaymentPeriods = async () => {
    try {
      // Tính toán các kỳ thanh toán dựa trên thông tin hợp đồng
      const calculatedPeriods = calculatePaymentPeriods(credit);
      
      // Tạo các kỳ thanh toán trong cơ sở dữ liệu
      const periodsToCreate = calculatedPeriods.map(period => ({
        credit_id: period.credit_id,
        period_number: period.period_number,
        start_date: period.start_date,
        end_date: period.end_date,
        expected_amount: period.expected_amount,
        notes: 'Tạo tự động từ thông tin hợp đồng'
      }));
      
      const { data, error } = await createManyPaymentPeriods(periodsToCreate);
      
      if (error) {
        throw new Error(error.message);
      }
      
      setIsGenerateDialogOpen(false);
      
      // Tải lại dữ liệu từ DB
      fetchPaymentPeriods();
      
      toast({
        title: "Thành công",
        description: `Đã tạo ${periodsToCreate.length} kỳ đóng lãi vào cơ sở dữ liệu`
      });
    } catch (error) {
      console.error('Error generating payment periods:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tạo kỳ đóng lãi tự động",
        variant: "destructive"
      });
    }
  };
  
  // Xác định loại kỳ (từ DB hay ước tính)
  const isPeriodFromDb = (period: CreditPaymentPeriod) => {
    return !!period.id;
  };
  
  // Xác định trạng thái hiển thị của kỳ
  const getPeriodStatus = (period: CreditPaymentPeriod) => {
    // Nếu là kỳ từ DB với trạng thái xác định, sử dụng
    if (isPeriodFromDb(period)) {
      return period.status;
    }
    
    // Nếu là kỳ ước tính
    return PaymentPeriodStatus.PENDING;
  };
  
  return (
    <div className="space-y-6">
      {/* Thông tin tổng hợp */}
      <PaymentSummary summary={summary} />
      
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">
          Quản lý kỳ đóng lãi
          {periods.some(p => !p.id) && <span className="text-sm font-normal text-gray-500 ml-2">(Bao gồm kỳ ước tính)</span>}
        </h3>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fetchPaymentPeriods()}
            disabled={isLoading}
          >
            {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Tải lại dữ liệu</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsGenerateDialogOpen(true)}
            disabled={isLoading}
          >
            <Calculator className="h-4 w-4 mr-2" />
            Lưu tất cả kỳ vào DB
          </Button>
        </div>
      </div>
      
      <Separator />
      
      {/* Hiển thị trạng thái đang tải */}
      {isLoading ? (
        <div className="p-8 flex flex-col items-center justify-center space-y-4 border rounded-lg bg-muted/10">
          <RefreshCw className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg font-medium">Đang tải dữ liệu...</p>
          <p className="text-sm text-muted-foreground">Vui lòng đợi trong giây lát</p>
        </div>
      ) : (
        /* Danh sách kỳ thanh toán */
        <PaymentPeriodList 
          periods={periods.map(period => ({
            ...period,
            // Thêm thông tin trạng thái cho UI
            isFromDb: isPeriodFromDb(period),
            status: getPeriodStatus(period)
          }))}
          onMarkAsPaid={(period) => {
            setSelectedPeriod(period);
            setIsPaidDialogOpen(true);
          }}
          onEdit={(period) => {
            setSelectedPeriod(period);
            setIsEditDialogOpen(true);
          }}
          onDelete={(period) => {
            setSelectedPeriod(period);
            setIsDeleteDialogOpen(true);
          }}
          onAddCustomPeriod={() => setIsAddDialogOpen(true)}
        />
      )}
      
      {/* Dialog thêm kỳ thanh toán */}
      <PaymentPeriodDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSave={handleAddPeriod}
        mode="add"
        title="Thêm kỳ đóng lãi bất thường"
        credit={credit}
        allPeriods={periods}
        period={{
          id: '',
          credit_id: credit.id,
          period_number: 0,
          start_date: format(new Date(), 'yyyy-MM-dd'),
          end_date: format(new Date(), 'yyyy-MM-dd'),
          expected_amount: 0,
          actual_amount: 0,
          payment_date: null,
          status: PaymentPeriodStatus.PENDING,
          notes: 'Kỳ thanh toán bất thường'
        }}
      />
      
      {/* Dialog sửa kỳ thanh toán */}
      <PaymentPeriodDialog
        isOpen={isEditDialogOpen && !!selectedPeriod}
        onClose={() => {
          setIsEditDialogOpen(false);
          setSelectedPeriod(null);
        }}
        onSave={handleEditPeriod}
        mode={selectedPeriod?.id ? 'edit' : 'add'}
        title={selectedPeriod?.id ? "Chỉnh sửa kỳ đóng lãi" : "Lưu kỳ đóng lãi vào DB"}
        credit={credit}
        allPeriods={periods}
        period={selectedPeriod || undefined}
      />
      
      {/* Dialog đánh dấu đã đóng */}
      <MarkAsPaidDialog
        isOpen={isPaidDialogOpen && !!selectedPeriod}
        onClose={() => {
          setIsPaidDialogOpen(false);
          setSelectedPeriod(null);
        }}
        onSubmit={handleMarkAsPaid}
        period={selectedPeriod}
      />
      
      {/* Dialog xác nhận xóa */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedPeriod && !selectedPeriod.id ? (
                "Không thể xóa kỳ đóng lãi ước tính. Kỳ này chưa được lưu vào cơ sở dữ liệu."
              ) : (
                "Bạn có chắc chắn muốn xóa kỳ đóng lãi này? Hành động này không thể hoàn tác."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsDeleteDialogOpen(false);
              setSelectedPeriod(null);
            }}>Hủy</AlertDialogCancel>
            {selectedPeriod && selectedPeriod.id && (
              <AlertDialogAction onClick={handleDeletePeriod}>Xóa</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Dialog xác nhận tạo tự động */}
      <AlertDialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lưu tất cả kỳ đóng lãi vào DB</AlertDialogTitle>
            <AlertDialogDescription>
              Hệ thống sẽ tạo tất cả các kỳ đóng lãi dựa trên thông tin hợp đồng và lưu vào cơ sở dữ liệu.
              {dbPeriods.length > 0 && " Các kỳ hiện có trong cơ sở dữ liệu sẽ được giữ nguyên."}
              <br /><br />
              Bạn có chắc chắn muốn tiếp tục?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsGenerateDialogOpen(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateAllPaymentPeriods}>Lưu tất cả</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
