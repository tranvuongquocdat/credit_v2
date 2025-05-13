"use client";

import { useState, useEffect } from 'react';
import { format, parseISO, isBefore, isAfter, addDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Credit } from '@/models/credit';
import { CreditPaymentPeriod, PaymentPeriodStatus, CreditPaymentSummary } from '@/models/credit-payment';
import { calculatePaymentPeriods, calculatePaymentSummary, recalculatePeriodNumbers } from '@/utils/payment-calculator';
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
  
  // Tạo danh sách kỳ thanh toán ước tính từ thông tin hợp đồng
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
      
      // Lọc ra các kỳ ước tính không trùng với kỳ đã lưu trong DB
      // Một kỳ được coi là trùng nếu thời gian bắt đầu và kết thúc gần tương tự
      const filteredEstimatedPeriods = calculatedPeriods.filter(estPeriod => {
        const estStart = parseISO(estPeriod.start_date);
        const estEnd = parseISO(estPeriod.end_date);
        
        // Kiểm tra xem kỳ này có tương tự với bất kỳ kỳ nào trong DB không
        return !dbPeriods.some(dbPeriod => {
          const dbStart = parseISO(dbPeriod.start_date);
          const dbEnd = parseISO(dbPeriod.end_date);
          
          // Nếu thời gian bắt đầu và kết thúc gần nhau (sai lệch tối đa 2 ngày),
          // coi chúng là cùng một kỳ
          const startDiff = Math.abs(dbStart.getTime() - estStart.getTime());
          const endDiff = Math.abs(dbEnd.getTime() - estEnd.getTime());
          
          return startDiff <= 2 * 24 * 60 * 60 * 1000 && endDiff <= 2 * 24 * 60 * 60 * 1000;
        });
      });
      
      // Nếu có kỳ hiện tại đã được đánh dấu là đã thanh toán, chỉ hiển thị các kỳ tương lai
      const paidPeriods = dbPeriods.filter(p => p.status === PaymentPeriodStatus.PAID);
      const lastPaidDate = paidPeriods.length > 0
        ? Math.max(...paidPeriods.map(p => new Date(p.end_date).getTime()))
        : 0;
      
      // Lọc các kỳ ước tính trong tương lai (sau kỳ đã thanh toán cuối cùng)
      const futurePeriods = filteredEstimatedPeriods.filter(p => {
        return lastPaidDate === 0 || new Date(p.start_date).getTime() > lastPaidDate;
      });
      
      // Kết hợp dữ liệu từ DB và dữ liệu ước tính
      const combinedPeriods = [...dbPeriods, ...futurePeriods];
      
      // Sắp xếp theo thời gian và đánh số thứ tự lại
      const sortedPeriods = combinedPeriods.sort((a, b) => {
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      });
      
      // Đánh số lại các kỳ
      const renumberedPeriods = recalculatePeriodNumbers(sortedPeriods);
      
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
    setIsLoading(true);
    try {
      const { data, error } = await getCreditPaymentPeriods(credit.id);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data && data.length > 0) {
        // Lưu dữ liệu từ DB
        setDbPeriods(data as CreditPaymentPeriod[]);
        
        // Tạo danh sách kỳ kết hợp (DB + ước tính)
        generateEstimatedPeriods(true);
      } else {
        // Nếu không có dữ liệu từ DB, sử dụng hoàn toàn dữ liệu ước tính
        setDbPeriods([]);
        generateEstimatedPeriods(false);
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
      generateEstimatedPeriods(false);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    // Tạo dữ liệu ước tính trước để hiển thị ngay lập tức
    generateEstimatedPeriods(false);
    // Sau đó mới gọi API để lấy dữ liệu thật từ DB (nếu có)
    fetchPaymentPeriods();
  }, [credit.id]);
  
  // Xử lý thêm kỳ thanh toán (kỳ bất thường)
  const handleAddPeriod = async (data: any) => {
    try {
      const newPeriod = {
        credit_id: credit.id,
        period_number: periods.length + 1,
        start_date: format(data.start_date, 'yyyy-MM-dd'),
        end_date: format(data.end_date, 'yyyy-MM-dd'),
        expected_amount: data.expected_amount,
        notes: data.notes || 'Kỳ thanh toán bất thường'
      };
      
      const { data: result, error } = await createPaymentPeriod(newPeriod);
      
      if (error) {
        throw new Error(error.message);
      }
      
      setIsAddDialogOpen(false);
      
      // Tải lại dữ liệu từ DB và tính toán lại
      fetchPaymentPeriods();
      
      toast({
        title: "Thành công",
        description: "Đã thêm kỳ đóng lãi mới"
      });
    } catch (error) {
      console.error('Error adding payment period:', error);
      toast({
        title: "Lỗi",
        description: "Không thể thêm kỳ đóng lãi",
        variant: "destructive"
      });
    }
  };
  
  // Xử lý cập nhật kỳ thanh toán
  const handleEditPeriod = async (data: any) => {
    if (!selectedPeriod) return;
    
    try {
      const updateData = {
        start_date: format(data.start_date, 'yyyy-MM-dd'),
        end_date: format(data.end_date, 'yyyy-MM-dd'),
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
      // Nếu là kỳ ước tính (chưa có trong DB), tạo mới và đánh dấu đã thanh toán
      if (!selectedPeriod.id) {
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
        
        const { data: result, error } = await createPaymentPeriod(newPeriod);
        
        if (error) {
          throw new Error(error.message);
        }
      } else {
        // Nếu đã có trong DB, cập nhật trạng thái
        const { data: result, error } = await markPeriodAsPaid(
          selectedPeriod.id, 
          data.actual_amount, 
          format(data.payment_date, 'yyyy-MM-dd'),
          data.notes || null
        );
        
        if (error) {
          throw new Error(error.message);
        }
      }
      
      setIsPaidDialogOpen(false);
      setSelectedPeriod(null);
      
      // Tải lại dữ liệu từ DB và tính toán lại các kỳ
      fetchPaymentPeriods();
      
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
      
      {/* Danh sách kỳ thanh toán */}
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
      
      {/* Dialog thêm kỳ thanh toán */}
      <PaymentPeriodDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSubmit={handleAddPeriod}
        title="Thêm kỳ đóng lãi bất thường"
        submitLabel="Thêm"
        initialData={{
          start_date: new Date(),
          end_date: new Date(),
          expected_amount: 0,
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
        onSubmit={handleEditPeriod}
        title={selectedPeriod?.id ? "Chỉnh sửa kỳ đóng lãi" : "Lưu kỳ đóng lãi vào DB"}
        submitLabel={selectedPeriod?.id ? "Cập nhật" : "Lưu vào DB"}
        initialData={selectedPeriod ? {
          period_number: selectedPeriod.period_number,
          start_date: selectedPeriod.start_date ? new Date(selectedPeriod.start_date) : new Date(),
          end_date: selectedPeriod.end_date ? new Date(selectedPeriod.end_date) : new Date(),
          expected_amount: selectedPeriod.expected_amount,
          actual_amount: selectedPeriod.actual_amount,
          payment_date: selectedPeriod.payment_date ? new Date(selectedPeriod.payment_date) : null,
          status: selectedPeriod.status,
          notes: selectedPeriod.notes || (selectedPeriod.id ? '' : 'Kỳ thanh toán từ ước tính')
        } : undefined}
        isEdit={true}
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
