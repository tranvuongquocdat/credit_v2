'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Card,
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Loader2, EditIcon, FilePenLine, XCircle } from 'lucide-react';
import { getCreditById, deleteCredit, updateCredit } from '@/lib/credit';
import { InterestType, CreditStatus, Credit, CreditWithCustomer } from '@/models/credit';
import { calculateCreditInterest } from '@/lib/credit';
import { PaymentPeriodManager } from '@/components/Credit';

export default function ViewCreditPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  
  const [credit, setCredit] = useState<CreditWithCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<CreditStatus | null>(null);
  const [interestInfo, setInterestInfo] = useState({
    interestAmount: 0,
    totalAmount: 0,
    interestPeriods: 0,
    daysElapsed: 0,
    daysRemaining: 0,
    percentageCompleted: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load thông tin hợp đồng
  useEffect(() => {
    async function loadCredit() {
      setIsLoading(true);
      setError(null);
      
      try {
        const { data, error } = await getCreditById(id);
        
        if (error) throw error;
        
        if (!data) {
          throw new Error('Không tìm thấy hợp đồng');
        }
        
        setCredit(data);
        
        // Tính toán thông tin lãi suất
        if (data) {
          const interestCalc = calculateCreditInterest(data as Credit);
          
          // Chuyển đổi kết quả từ calculateCreditInterest để phù hợp với state
          const daysRemaining = Math.max(0, data.loan_period - interestCalc.daysElapsed);
          const percentageCompleted = data.loan_period > 0 ? 
            Math.min(100, (interestCalc.daysElapsed / data.loan_period) * 100) : 0;
            
          setInterestInfo({
            interestAmount: interestCalc.interestAmount,
            totalAmount: interestCalc.totalAmount,
            interestPeriods: interestCalc.interestPeriods,
            daysElapsed: interestCalc.daysElapsed,
            daysRemaining: daysRemaining,
            percentageCompleted: percentageCompleted
          });
        }
      } catch (err) {
        console.error('Error loading credit:', err);
        setError('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadCredit();
  }, [id]);

  // Xử lý khi xóa hợp đồng
  const handleDeleteCredit = async () => {
    if (!credit) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const deleteResult = await deleteCredit(credit.id);
      
      if (deleteResult.error) {
        throw deleteResult.error;
      }
      
      // Chuyển hướng về trang danh sách hợp đồng
      router.push('/credits');
    } catch (err: any) {
      console.error('Error deleting credit:', err);
      setError(err.message || 'Có lỗi xảy ra khi xóa hợp đồng. Vui lòng thử lại sau.');
      setIsDeleteDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý khi thay đổi trạng thái hợp đồng
  const handleStatusChange = async () => {
    if (!credit || !selectedStatus) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const updateResult = await updateCredit(credit.id, { status: selectedStatus });
      
      if (updateResult.error) {
        throw new Error('Không thể cập nhật trạng thái hợp đồng');
      }
      
      // Reload thông tin hợp đồng
      const reloadResult = await getCreditById(id);
      
      if (reloadResult.error) throw reloadResult.error;
      
      setCredit(reloadResult.data);
      setIsStatusDialogOpen(false);
    } catch (err: any) {
      console.error('Error updating credit status:', err);
      setError(err.message || 'Có lỗi xảy ra khi cập nhật trạng thái hợp đồng. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hàm chuyển đổi trạng thái sang tiếng Việt
  const getStatusText = (status: CreditStatus) => {
    switch (status) {
      case CreditStatus.ON_TIME:
        return 'Đúng hẹn';
      case CreditStatus.OVERDUE:
        return 'Quá hạn';
      case CreditStatus.LATE_INTEREST:
        return 'Chậm lãi';
      case CreditStatus.BAD_DEBT:
        return 'Nợ xấu';
      case CreditStatus.CLOSED:
        return 'Đã đóng';
      case CreditStatus.DELETED:
        return 'Đã xóa';
      default:
        return 'Không xác định';
    }
  };

  // Hàm lấy màu cho trạng thái
  const getStatusColor = (status: CreditStatus) => {
    switch (status) {
      case CreditStatus.ON_TIME:
        return 'bg-green-100 text-green-800';
      case CreditStatus.OVERDUE:
        return 'bg-amber-100 text-amber-800';
      case CreditStatus.LATE_INTEREST:
        return 'bg-orange-100 text-orange-800';
      case CreditStatus.BAD_DEBT:
        return 'bg-red-100 text-red-800';
      case CreditStatus.CLOSED:
        return 'bg-blue-100 text-blue-800';
      case CreditStatus.DELETED:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Format số tiền
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="container flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-lg text-gray-500">Đang tải thông tin hợp đồng...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-10">
        <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded" role="alert">
          <p className="font-bold">Lỗi</p>
          <p>{error}</p>
          <div className="mt-4">
            <Button onClick={() => router.push('/credits')} variant="outline">
              Quay lại danh sách hợp đồng
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!credit) {
    return (
      <div className="container py-10">
        <div className="bg-yellow-50 border border-yellow-400 text-yellow-700 px-4 py-3 rounded" role="alert">
          <p className="font-bold">Không tìm thấy hợp đồng</p>
          <p>Hợp đồng bạn đang tìm kiếm không tồn tại hoặc đã bị xóa.</p>
          <div className="mt-4">
            <Button onClick={() => router.push('/credits')} variant="outline">
              Quay lại danh sách hợp đồng
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            onClick={() => router.push('/credits')}
            className="mr-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Quay lại
          </Button>
          <h1 className="text-2xl font-semibold">Chi tiết hợp đồng tín chấp</h1>
        </div>
        <div className="flex space-x-2">
          <Button 
            variant="outline"
            onClick={() => router.push(`/credits/edit/${id}`)}
          >
            <EditIcon className="h-4 w-4 mr-2" />
            Chỉnh sửa
          </Button>
          <Button 
            variant="outline"
            onClick={() => setIsStatusDialogOpen(true)}
          >
            <FilePenLine className="h-4 w-4 mr-2" />
            Thay đổi trạng thái
          </Button>
          <Button 
            variant="destructive"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Xóa hợp đồng
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Thông tin hợp đồng */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Thông tin hợp đồng #{credit.contract_code || credit.id.substring(0, 8)}</CardTitle>
            <CardDescription>
              Hợp đồng được tạo ngày {credit.created_at ? format(new Date(credit.created_at), 'dd/MM/yyyy', { locale: vi }) : '-'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Trạng thái hợp đồng */}
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-500">Trạng thái hợp đồng:</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(credit.status as CreditStatus)}`}>
                {getStatusText(credit.status as CreditStatus)}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Số tiền vay</h3>
                <p className="text-lg font-semibold">{formatCurrency(credit.loan_amount)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Thời gian vay</h3>
                <p className="text-lg font-semibold">{credit.loan_period} ngày</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Hình thức lãi</h3>
                <p className="text-lg font-semibold">
                  {credit.interest_type === InterestType.PERCENTAGE ? 'Theo phần trăm (%)' : 'Số tiền cố định'}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Giá trị lãi</h3>
                <p className="text-lg font-semibold">
                  {credit.interest_type === InterestType.PERCENTAGE 
                    ? `${credit.interest_value}%` 
                    : formatCurrency(credit.interest_value)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Kỳ lãi phí</h3>
                <p className="text-lg font-semibold">{credit.interest_period} ngày/kỳ</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Ngày vay</h3>
                <p className="text-lg font-semibold">
                  {credit.loan_date ? format(new Date(credit.loan_date), 'dd/MM/yyyy', { locale: vi }) : '-'}
                </p>
              </div>
            </div>
            
            {/* Tài sản thế chấp */}
            {credit.collateral && (
              <div>
                <h3 className="text-sm font-medium text-gray-500">Tài sản thế chấp</h3>
                <p className="text-base">{credit.collateral}</p>
              </div>
            )}
            
            {/* Ghi chú */}
            {credit.notes && (
              <div>
                <h3 className="text-sm font-medium text-gray-500">Ghi chú</h3>
                <p className="text-base">{credit.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Thông tin lãi suất */}
        <Card>
          <CardHeader>
            <CardTitle>Thông tin tính toán</CardTitle>
            <CardDescription>
              Dựa trên thời gian vay và kỳ lãi
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Lãi mỗi kỳ</h3>
              <p className="text-lg font-semibold text-primary">
                {formatCurrency(interestInfo.interestAmount / Math.max(1, interestInfo.interestPeriods))}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Tổng số kỳ</h3>
              <p className="text-lg font-semibold">{interestInfo.interestPeriods} kỳ</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Tổng tiền lãi</h3>
              <p className="text-lg font-semibold text-primary">{formatCurrency(interestInfo.interestAmount)}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Số ngày đã qua</h3>
              <p className="text-lg font-semibold">{interestInfo.daysElapsed} ngày</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Số ngày còn lại</h3>
              <p className="text-lg font-semibold">{interestInfo.daysRemaining} ngày</p>
            </div>
            
            {/* Tiến độ khoản vay */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Tiến độ khoản vay</h3>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-primary h-2.5 rounded-full" 
                  style={{ width: `${interestInfo.percentageCompleted}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {interestInfo.percentageCompleted.toFixed(1)}% hoàn thành
              </p>
            </div>
            
            {/* Tổng số tiền phải hoàn trả */}
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-500">Tổng cần thanh toán</h3>
              <p className="text-xl font-bold text-primary">
                {formatCurrency(interestInfo.totalAmount)}
              </p>
              <p className="text-xs text-gray-500">
                Tiền gốc + Tổng lãi
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Thông tin khách hàng */}
      <Card>
        <CardHeader>
          <CardTitle>Thông tin khách hàng</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Khách hàng</h3>
              <p className="text-lg font-semibold">{credit.customer?.name || '-'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Số điện thoại</h3>
              <p className="text-lg font-semibold">{credit.phone || credit.customer?.phone || "-"}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">CCCD/CMND</h3>
              <p className="text-lg font-semibold">{credit.id_number || credit.customer?.id_number || "-"}</p>
            </div>
            <div className="md:col-span-3">
              <h3 className="text-sm font-medium text-gray-500">Địa chỉ</h3>
              <p className="text-base">{credit.address || "-"}</p>
            </div>
          </div>
          <div className="mt-4">
            <Button 
              variant="outline" 
              onClick={() => router.push(`/customers?search=${encodeURIComponent(credit.customer?.name || '')}`)}
            >
              Xem thông tin khách hàng
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Quản lý kỳ đóng lãi */}
      {credit && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Quản lý kỳ đóng lãi</CardTitle>
            <CardDescription>
              Lịch sử đóng lãi và danh sách các kỳ thanh toán
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentPeriodManager credit={credit} />
          </CardContent>
        </Card>
      )}
      
      {/* Dialog xác nhận xóa */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa hợp đồng</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa hợp đồng này? 
              Hành động này sẽ đánh dấu hợp đồng là đã xóa, nhưng dữ liệu vẫn được lưu trữ trong hệ thống.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCredit}
              disabled={isSubmitting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Dialog thay đổi trạng thái */}
      <AlertDialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Thay đổi trạng thái hợp đồng</AlertDialogTitle>
            <AlertDialogDescription>
              Chọn trạng thái mới cho hợp đồng này:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-2 py-4">
            <Button
              variant={selectedStatus === CreditStatus.ON_TIME ? "default" : "outline"}
              className={selectedStatus === CreditStatus.ON_TIME ? "border-2 border-primary" : ""}
              onClick={() => setSelectedStatus(CreditStatus.ON_TIME)}
            >
              Đúng hẹn
            </Button>
            <Button
              variant={selectedStatus === CreditStatus.OVERDUE ? "default" : "outline"}
              className={selectedStatus === CreditStatus.OVERDUE ? "border-2 border-primary" : ""}
              onClick={() => setSelectedStatus(CreditStatus.OVERDUE)}
            >
              Quá hạn
            </Button>
            <Button
              variant={selectedStatus === CreditStatus.LATE_INTEREST ? "default" : "outline"}
              className={selectedStatus === CreditStatus.LATE_INTEREST ? "border-2 border-primary" : ""}
              onClick={() => setSelectedStatus(CreditStatus.LATE_INTEREST)}
            >
              Chậm lãi
            </Button>
            <Button
              variant={selectedStatus === CreditStatus.BAD_DEBT ? "default" : "outline"}
              className={selectedStatus === CreditStatus.BAD_DEBT ? "border-2 border-primary" : ""}
              onClick={() => setSelectedStatus(CreditStatus.BAD_DEBT)}
            >
              Nợ xấu
            </Button>
            <Button
              variant={selectedStatus === CreditStatus.CLOSED ? "default" : "outline"}
              className={`col-span-2 ${selectedStatus === CreditStatus.CLOSED ? "border-2 border-primary" : ""}`}
              onClick={() => setSelectedStatus(CreditStatus.CLOSED)}
            >
              Đóng hợp đồng (Đã thanh toán)
            </Button>
          </div>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsStatusDialogOpen(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStatusChange}
              disabled={isSubmitting || !selectedStatus}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cập nhật
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
