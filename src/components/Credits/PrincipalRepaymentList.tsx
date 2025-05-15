import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
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
import { PrincipalRepayment } from '@/models/principal-repayment';
import { 
  getPrincipalRepayments, 
  deletePrincipalRepayment 
} from '@/lib/principal-repayment';

interface PrincipalRepaymentListProps {
  creditId: string;
  onDeleted?: () => void;
}

export function PrincipalRepaymentList({ 
  creditId,
  onDeleted
}: PrincipalRepaymentListProps) {
  const [repayments, setRepayments] = useState<PrincipalRepayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [repaymentToDelete, setRepaymentToDelete] = useState<PrincipalRepayment | null>(null);

  // Format tiền Việt Nam
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Format ngày tháng
  const formatDate = (dateString: string): string => {
    try {
      return format(new Date(dateString), 'dd-MM-yyyy');
    } catch (e) {
      return dateString;
    }
  };

  // Lấy danh sách trả bớt gốc khi component được load
  useEffect(() => {
    const fetchRepayments = async () => {
      try {
        setLoading(true);
        const data = await getPrincipalRepayments(creditId);
        setRepayments(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching principal repayments:', err);
        setError('Không thể tải danh sách trả bớt gốc');
      } finally {
        setLoading(false);
      }
    };

    fetchRepayments();
  }, [creditId]);

  // Xử lý xóa khoản trả bớt gốc
  const handleDelete = async () => {
    if (!repaymentToDelete?.id) return;
    
    try {
      await deletePrincipalRepayment(repaymentToDelete.id);
      
      // Cập nhật danh sách sau khi xóa
      setRepayments(repayments.filter(r => r.id !== repaymentToDelete.id));
      
      // Callback
      if (onDeleted) onDeleted();
      
    } catch (err) {
      console.error('Error deleting repayment:', err);
      setError('Không thể xóa khoản trả bớt gốc');
    } finally {
      setDeleteDialogOpen(false);
      setRepaymentToDelete(null);
    }
  };
  
  // Hiển thị dialog xác nhận xóa
  const confirmDelete = (repayment: PrincipalRepayment) => {
    setRepaymentToDelete(repayment);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="mt-4">
      <div className="flex items-center mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M21 5H3"/>
          <path d="M21 12H3"/>
          <path d="M21 19H3"/>
        </svg>
        <span className="font-medium ml-2">Danh sách tiền gốc</span>
      </div>
      
      <div className="overflow-auto mt-2">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-500 border">STT</th>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-500 border">Ngày</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 border">Nội dung</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 border">Số tiền</th>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-500 border w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-red-500">
                  {error}
                </td>
              </tr>
            ) : repayments.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  Chưa có dữ liệu
                </td>
              </tr>
            ) : (
              // Hiển thị danh sách các khoản trả bớt gốc
              repayments.map((repayment, index) => (
                <tr key={repayment.id} className="hover:bg-gray-50">
                  <td className="px-2 py-2 text-center border">{index + 1}</td>
                  <td className="px-2 py-2 text-center border">
                    {formatDate(repayment.repayment_date)}
                  </td>
                  <td className="px-2 py-2 text-left border">
                    {repayment.notes || 'Trả bớt gốc'}
                  </td>
                  <td className="px-2 py-2 text-right border font-medium">
                    {formatCurrency(repayment.amount)}
                  </td>
                  <td className="px-2 py-2 text-center border">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => confirmDelete(repayment)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog xác nhận xóa */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa khoản trả bớt gốc này không?
              Thao tác này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy bỏ</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
