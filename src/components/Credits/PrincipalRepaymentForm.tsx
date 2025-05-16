import { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';

interface PrincipalRepaymentFormProps {
  onSubmit: (data: {
    repaymentDate: string;
    amount: number;
    notes?: string;
  }) => void;
}

export function PrincipalRepaymentForm({ onSubmit }: PrincipalRepaymentFormProps) {
  const [repaymentDate, setRepaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (amount <= 0) {
      alert('Vui lòng nhập số tiền gốc trả trước');
      return;
    }

    onSubmit({
      repaymentDate,
      amount,
      notes
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded-md mb-4">
      <h3 className="text-lg font-medium mb-4">Trả gốc</h3>
      
      <div className="grid grid-cols-1 gap-4">
        {/* Ngày trả trước gốc */}
        <div className="flex items-center">
          <label htmlFor="repaymentDate" className="w-48 text-right mr-4">Ngày trả trước gốc</label>
          <DatePicker
            id="repaymentDate"
            value={repaymentDate}
            onChange={setRepaymentDate}
            className="w-64"
          />
        </div>
        
        {/* Số tiền gốc trả trước */}
        <div className="flex items-center">
          <label htmlFor="amount" className="w-48 text-right mr-4">
            Số tiền gốc trả trước
            <span className="text-red-500 ml-1">*</span>
          </label>
          <input
            id="amount"
            type="number"
            className="border rounded px-2 py-1 w-64"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
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
