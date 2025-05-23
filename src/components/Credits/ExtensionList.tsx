import { useState, useEffect } from 'react';
import { addDays, format } from 'date-fns';
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
import { Extension } from '@/models/extension';
import { getExtensions, deleteExtension } from '@/lib/extension';

interface ExtensionListProps {
  creditId: string;
  onDeleted?: () => void;
}

export function ExtensionList({ 
  creditId,
  onDeleted
}: ExtensionListProps) {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [extensionToDelete, setExtensionToDelete] = useState<Extension | null>(null);

  // Format ngày tháng
  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'dd-MM-yyyy');
    } catch (e) {
      return dateString;
    }
  };

  // Lấy danh sách gia hạn khi component được load
  useEffect(() => {
    const fetchExtensions = async () => {
      try {
        setLoading(true);
        const data = await getExtensions(creditId);
        setExtensions(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching extensions:', err);
        setError('Không thể tải danh sách gia hạn');
      } finally {
        setLoading(false);
      }
    };

    fetchExtensions();
  }, [creditId]);

  // Xử lý xóa khoản gia hạn
  const handleDelete = async () => {
    if (!extensionToDelete?.id) return;
    
    try {
      await deleteExtension(extensionToDelete.id);
      
      // Cập nhật danh sách sau khi xóa
      setExtensions(extensions.filter(e => e.id !== extensionToDelete.id));
      
      // Callback
      if (onDeleted) onDeleted();
      
    } catch (err) {
      console.error('Error deleting extension:', err);
      setError('Không thể xóa khoản gia hạn');
    } finally {
      setDeleteDialogOpen(false);
      setExtensionToDelete(null);
    }
  };
  
  // Hiển thị dialog xác nhận xóa
  const confirmDelete = (extension: Extension) => {
    setExtensionToDelete(extension);
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
        <span className="font-medium ml-2">Danh sách gia hạn</span>
      </div>
      
      <div className="overflow-auto mt-2">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-500 border">STT</th>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-500 border">Gia hạn từ ngày</th>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-500 border">Đến ngày</th>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-500 border">Số ngày</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 border">Nội dung</th>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-500 border w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-gray-500">
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-red-500">
                  {error}
                </td>
              </tr>
            ) : extensions.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-gray-500">
                  Chưa có dữ liệu
                </td>
              </tr>
            ) : (
              // Hiển thị danh sách các khoản gia hạn
              extensions.map((extension, index) => (
                <tr key={extension.id} className="hover:bg-gray-50">
                  <td className="px-2 py-2 text-center border">{index + 1}</td>
                  <td className="px-2 py-2 text-center border">
                    {formatDate(extension.from_date)}
                  </td>
                  <td className="px-2 py-2 text-center border">
                    {formatDate(addDays(new Date(extension.from_date || ''), extension.days).toISOString())}
                  </td>
                  <td className="px-2 py-2 text-center border">
                    {extension.days}
                  </td>
                  <td className="px-2 py-2 text-left border">
                    {extension.notes}
                  </td>
                  <td className="px-2 py-2 text-center border">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => confirmDelete(extension)}
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
              Bạn có chắc chắn muốn xóa khoản gia hạn này không?
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
