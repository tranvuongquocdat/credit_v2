'use client';

import React from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface ProfitSummaryRow {
  category: string;
  categoryKey: string;
  total: number;
  new: number;
  old: number;
  closed: number;
  active: number;
  lateInterest: number;
  overdue: number;
  deleted: number;
  totalLoanAmount: number;
  currentLoanAmount: number;
  profit: number;
  customerDebt: number;
}

interface TransactionSummary {
  income: number;
  expense: number;
}

interface ExcelExportProps {
  profitData: ProfitSummaryRow[];
  transactionData: TransactionSummary;
  startDate: string;
  endDate: string;
  storeName?: string;
}

const ExcelExport: React.FC<ExcelExportProps> = ({
  profitData,
  transactionData,
  startDate,
  endDate,
  storeName = 'Cửa hàng'
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN').format(amount);
  };

  const exportToExcel = () => {
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();

      // Calculate totals
      const totals = profitData.reduce((acc, row) => ({
        total: acc.total + row.total,
        new: acc.new + row.new,
        old: acc.old + row.old,
        closed: acc.closed + row.closed,
        active: acc.active + row.active,
        lateInterest: acc.lateInterest + row.lateInterest,
        overdue: acc.overdue + row.overdue,
        deleted: acc.deleted + row.deleted,
        totalLoanAmount: acc.totalLoanAmount + row.totalLoanAmount,
        currentLoanAmount: acc.currentLoanAmount + row.currentLoanAmount,
        profit: acc.profit + row.profit,
        customerDebt: acc.customerDebt + row.customerDebt
      }), {
        total: 0, new: 0, old: 0, closed: 0, active: 0, lateInterest: 0,
        overdue: 0, deleted: 0, totalLoanAmount: 0, currentLoanAmount: 0,
        profit: 0, customerDebt: 0
      });

      // Prepare data for Excel
      const excelData = [
        // Header information
        [`BÁO CÁO TỔNG KẾT LỢI NHUẬN - ${storeName}`],
        [`Từ ngày: ${startDate} - Đến ngày: ${endDate}`],
        [`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`],
        [],
        // Table headers
        [
          'Hợp đồng',
          'Tổng',
          'Mới', 
          'Cũ',
          'Đóng',
          'Trả lãi phí',
          'Nợ lãi',
          'Quá hạn',
          'T.Lý',
          'Tổng tiền cho vay',
          'Đang cho vay',
          'Lợi nhuận',
          'Khách nợ'
        ],
        // Data rows
        ...profitData.map(row => [
          row.category,
          row.total,
          row.new,
          row.old,
          row.closed,
          row.active,
          row.lateInterest,
          row.overdue,
          row.deleted,
          formatCurrency(row.totalLoanAmount),
          formatCurrency(row.currentLoanAmount),
          formatCurrency(row.profit),
          formatCurrency(row.customerDebt)
        ]),
        // Additional activity rows
        [
          'Thu hoạt động',
          0, 0, 0, 0, 0, 0, 0, 0,
          '0',
          '0',
          formatCurrency(transactionData.income),
          '0'
        ],
        [
          'Chi hoạt động',
          0, 0, 0, 0, 0, 0, 0, 0,
          '0',
          '0',
          formatCurrency(-transactionData.expense),
          '0'
        ],
        [
          'Trả lãi vốn vay',
          0, 0, 0, 0, 0, 0, 0, 0,
          '0',
          '0',
          '0',
          '0'
        ],
        // Total row
        [
          'TỔNG CỘNG',
          totals.total,
          totals.new,
          totals.old,
          totals.closed,
          totals.active,
          totals.lateInterest,
          totals.overdue,
          totals.deleted,
          formatCurrency(totals.totalLoanAmount),
          formatCurrency(totals.currentLoanAmount),
          formatCurrency(totals.profit + transactionData.income - transactionData.expense),
          formatCurrency(totals.customerDebt)
        ]
      ];

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(excelData);

      // Set column widths
      const colWidths = [
        { wch: 15 }, // Hợp đồng
        { wch: 8 },  // Tổng
        { wch: 8 },  // Mới
        { wch: 8 },  // Cũ
        { wch: 8 },  // Đóng
        { wch: 10 }, // Trả lãi phí
        { wch: 8 },  // Nợ lãi
        { wch: 10 }, // Quá hạn
        { wch: 8 },  // T.Lý
        { wch: 18 }, // Tổng tiền cho vay
        { wch: 15 }, // Đang cho vay
        { wch: 15 }, // Lợi nhuận
        { wch: 15 }  // Khách nợ
      ];
      worksheet['!cols'] = colWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Tổng kết lợi nhuận');

      // Generate filename
      const filename = `TongKetLoiNhuan_${startDate}_${endDate}_${new Date().getTime()}.xlsx`;

      // Save file
      XLSX.writeFile(workbook, filename);

    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Có lỗi xảy ra khi xuất file Excel');
    }
  };

  return (
    <Button
      onClick={exportToExcel}
      className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
    >
      <Download className="h-4 w-4" />
      Xuất Excel
    </Button>
  );
};

export default ExcelExport; 