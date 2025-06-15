import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

// Import calculation functions
import { calculateCloseContractInterest as calculatePawnCloseInterest } from '@/lib/Pawns/calculate_close_contract_interest';
import { calculateCloseContractInterest as calculateCreditCloseInterest } from '@/lib/Credits/calculate_close_contract_interest';

interface InterestDetailItem {
  id: string;
  contractId: string;
  contractCode: string;
  customerName: string;
  itemName: string;
  loanAmount: number;
  transactionDate: string;
  transactionDateTime: string;
  interestAmount: number;
  otherAmount: number;
  totalAmount: number;
  transactionType: string;
  type: 'Cầm đồ' | 'Tín chấp' | 'Trả góp';
}

interface ExcelExportProps {
  data: InterestDetailItem[];
  storeId: string | undefined;
  startDate: string;
  endDate: string;
  storeName: string;
  selectedContractType?: string;
}

export default function ExcelExport({ 
  data, 
  storeId, 
  startDate, 
  endDate, 
  storeName,
  selectedContractType = 'all'
}: ExcelExportProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!storeId || data.length === 0) {
      alert('Không có dữ liệu để xuất Excel');
      return;
    }

    setIsExporting(true);

    try {
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();

      // Prepare data for Excel with proper formatting
      const excelData = data.map((item, index) => ({
        'STT': index + 1,
        'Loại hình': item.type,
        'Mã HĐ': item.contractCode,
        'Khách hàng': item.customerName,
        'Tên hàng': item.itemName,
        'Tiền vay (VND)': item.loanAmount,
        'Ngày GD': item.transactionDate,
        'Tiền lãi phí (VND)': item.interestAmount,
        'Tiền khác (VND)': item.otherAmount,
        'Tổng lãi phí (VND)': item.totalAmount,
        'Loại GD': item.transactionType
      }));

      // Calculate totals
      const totalInterestAmount = data.reduce((sum, item) => sum + item.interestAmount, 0);
      const totalOtherAmount = data.reduce((sum, item) => sum + item.otherAmount, 0);
      const totalTotalAmount = data.reduce((sum, item) => sum + item.totalAmount, 0);

      // Add summary row as any to avoid type issues
      (excelData as any[]).push({
        'STT': '',
        'Loại hình': '',
        'Mã HĐ': '',
        'Khách hàng': '',
        'Tên hàng': '',
        'Tiền vay (VND)': 'TỔNG CỘNG',
        'Ngày GD': '',
        'Tiền lãi phí (VND)': totalInterestAmount,
        'Tiền khác (VND)': totalOtherAmount,
        'Tổng lãi phí (VND)': totalTotalAmount,
        'Loại GD': ''
      });

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      ws['!cols'] = [
        { width: 6 },  // STT
        { width: 12 }, // Loại hình
        { width: 15 }, // Mã HĐ
        { width: 25 }, // Khách hàng
        { width: 25 }, // Tên hàng
        { width: 15 }, // Tiền vay
        { width: 18 }, // Ngày GD
        { width: 15 }, // Tiền lãi phí
        { width: 15 }, // Tiền khác
        { width: 15 }, // Tổng lãi phí
        { width: 15 }  // Loại GD
      ];

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Chi Tiết Tiền Lãi');

      // Create summary sheet
      const summaryData = [
        ['BÁO CÁO CHI TIẾT TIỀN LÃI PHÍ', '', '', ''],
        ['Cửa hàng:', storeName, '', ''],
        ['Từ ngày:', startDate, 'Đến ngày:', endDate],
        ['Loại hình:', selectedContractType === 'all' ? 'Tất cả' : selectedContractType, '', ''],
        ['Ngày xuất:', format(new Date(), 'dd/MM/yyyy HH:mm:ss'), '', ''],
        ['', '', '', ''],
        ['TỔNG KẾT:', '', '', ''],
        ['Tổng tiền lãi phí:', totalInterestAmount, 'VND', ''],
        ['Tổng tiền khác:', totalOtherAmount, 'VND', ''],
        ['Tổng cộng:', totalTotalAmount, 'VND', ''],
        ['Tổng số giao dịch:', data.length, 'giao dịch', '']
      ];

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      summaryWs['!cols'] = [
        { width: 20 },
        { width: 20 },
        { width: 10 },
        { width: 10 }
      ];

      XLSX.utils.book_append_sheet(wb, summaryWs, 'Tổng Kết');

      // Generate filename
      const contractTypeText = selectedContractType === 'all' ? 'TatCa' : selectedContractType.replace(/\s+/g, '');
      const filename = `ChiTietTienLai_${contractTypeText}_${startDate}_${endDate}.xlsx`;

      // Save file
      XLSX.writeFile(wb, filename);

    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Có lỗi xảy ra khi xuất Excel. Vui lòng thử lại.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button 
      onClick={handleExport} 
      disabled={isExporting || data.length === 0}
      className="bg-green-600 hover:bg-green-700 text-white"
    >
      {isExporting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Đang xuất...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          Xuất Excel
        </>
      )}
    </Button>
  );
} 