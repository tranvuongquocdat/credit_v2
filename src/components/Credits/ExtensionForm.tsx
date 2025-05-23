import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

interface ExtensionFormProps {
  customerName?: string; // Tên khách hàng để hiển thị
  onSubmit: (data: {
    days: number;
    notes?: string;
  }) => void;
}

export function ExtensionForm({ customerName, onSubmit }: ExtensionFormProps) {
  const [days, setDays] = useState<number>(10); // Mặc định gia hạn 10 ngày
  const [notes, setNotes] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (days <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập số ngày gia hạn"
      });
      return;
    }

    onSubmit({
      days,
      notes
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded-md mb-4">
      <h3 className="text-lg font-medium mb-4">Gia hạn hợp đồng</h3>
      
      <div className="grid grid-cols-1 gap-4">
        {/* Thông tin khách hàng */}
        {customerName && (
          <div className="flex items-center">
            <label className="w-48 text-right mr-4">Khách hàng</label>
            <span className="font-medium">{customerName}</span>
          </div>
        )}
        
        {/* Số ngày gia hạn */}
        <div className="flex items-center">
          <label htmlFor="days" className="w-48 text-right mr-4">
            Gia hạn thêm
            <span className="text-red-500 ml-1">*</span>
          </label>
          <input
            id="days"
            type="number"
            className="border rounded px-2 py-1 w-64"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
          <span className="ml-2">Ngày</span>
        </div>
        
        {/* Ghi chú */}
        <div className="flex items-start">
          <label htmlFor="notes" className="w-48 text-right mr-4 pt-1">Ghi chú</label>
          <textarea
            id="notes"
            className="border rounded px-2 py-1 w-64 h-20"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      
      {/* Nút đồng ý */}
      <div className="flex justify-end mt-4">
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
          Đồng ý
        </Button>
      </div>
    </form>
  );
}
