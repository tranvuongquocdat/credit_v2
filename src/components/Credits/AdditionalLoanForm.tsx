import { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';

interface AdditionalLoanFormProps {
  onSubmit: (data: {
    loanDate: string;
    amount: number;
    notes?: string;
  }) => void;
}

export function AdditionalLoanForm({ onSubmit }: AdditionalLoanFormProps) {
  const [loanDate, setLoanDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (amount <= 0) {
      alert('Vui lòng nhập số tiền vay thêm');
      return;
    }

    onSubmit({
      loanDate,
      amount,
      notes
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded-md mb-4">
      <h3 className="text-lg font-medium mb-4">Vay thêm tiền</h3>
      
      <div className="grid grid-cols-1 gap-4">
        {/* Ngày vay thêm gốc */}
        <div className="flex items-center">
          <label htmlFor="loanDate" className="w-48 text-right mr-4">Ngày vay thêm gốc</label>
          <DatePicker
            id="loanDate"
            value={loanDate}
            onChange={setLoanDate}
            className="w-64"
          />
        </div>
        
        {/* Số tiền vay thêm */}
        <div className="flex items-center">
          <label htmlFor="amount" className="w-48 text-right mr-4">
            Số tiền vay thêm
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
