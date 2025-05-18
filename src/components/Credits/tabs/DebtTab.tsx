'use client';

import { CreditWithCustomer } from '@/models/credit';
import { Button } from '@/components/ui/button';

interface DebtTabProps {
  credit: CreditWithCustomer;
}

export function DebtTab({ credit }: DebtTabProps) {
  return (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Khách hàng nợ lãi phí */}
        <div className="border rounded-md">
          <div className="bg-gray-100 p-3 border-b flex items-center">
            <span className="text-amber-600 mr-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </span>
            <span className="font-medium">Khách hàng nợ lãi phí</span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-[150px_1fr] gap-4 items-center mb-4">
              <div className="text-right">
                <label htmlFor="debt-amount" className="font-medium">
                  Số tiền nợ lại lần này <span className="text-red-500">*</span>
                </label>
              </div>
              <div>
                <input
                  id="debt-amount"
                  type="text"
                  className="border rounded px-2 py-1 w-full"
                  defaultValue="0"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                Ghi nợ
              </Button>
            </div>
          </div>
        </div>

        {/* Khách hàng trả nợ */}
        <div className="border rounded-md">
          <div className="bg-gray-100 p-3 border-b flex items-center">
            <span className="text-green-600 mr-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 9v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9"></path>
                <polyline points="7 14 12 9 17 14"></polyline>
                <line x1="12" y1="9" x2="12" y2="21"></line>
              </svg>
            </span>
            <span className="font-medium">Khách hàng trả nợ</span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-[150px_1fr] gap-4 items-center mb-4">
              <div className="text-right">
                <label htmlFor="pay-debt-amount" className="font-medium">
                  Số tiền trả nợ <span className="text-red-500">*</span>
                </label>
              </div>
              <div>
                <input
                  id="pay-debt-amount"
                  type="text"
                  className="border rounded px-2 py-1 w-full"
                  defaultValue="0"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                Thanh toán
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
