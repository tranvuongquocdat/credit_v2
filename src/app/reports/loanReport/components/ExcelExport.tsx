import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface LoanReportItem {
  id: string;
  contractId: string;
  contractCode: string;
  customerName: string;
  itemName: string;
  loanAmount: number;
  loanDate: string;
  status: string;
  statusCode: string;
  type: 'Cầm đồ' | 'Tín chấp' | 'Trả góp';
}

interface ExcelExportProps {
  data: LoanReportItem[];
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
        'Ngày vay': item.loanDate,
        'Tiền vay (VND)': item.loanAmount,
        'Trạng thái': item.status
      }));

      // Calculate total loan amount
      const totalLoanAmount = data.reduce((sum, item) => sum + item.loanAmount, 0);

      // Add summary row as any to avoid type issues
      (excelData as any[]).push({
        'STT': '',
        'Loại hình': '',
        'Mã HĐ': '',
        'Khách hàng': '',
        'Tên hàng': '',
        'Ngày vay': 'TỔNG TIỀN',
        'Tiền vay (VND)': totalLoanAmount,
        'Trạng thái': ''
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
        { width: 12 }, // Ngày vay
        { width: 18 }, // Tiền vay
        { width: 15 }  // Trạng thái
      ];

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Hợp Đồng Đang Cho Vay');

      // Create summary sheet
      const summaryData = [
        ['BÁO CÁO HỢP ĐỒNG ĐANG CHO VAY', '', '', ''],
        ['Cửa hàng:', storeName, '', ''],
        ['Từ ngày:', startDate || 'Tất cả', 'Đến ngày:', endDate || 'Tất cả'],
        ['Loại hình:', selectedContractType === 'all' ? 'Tất cả' : selectedContractType, '', ''],
        ['Ngày xuất:', format(new Date(), 'dd/MM/yyyy HH:mm:ss'), '', ''],
        ['', '', '', ''],
        ['TỔNG KẾT:', '', '', ''],
        ['Tổng tiền vay:', totalLoanAmount, 'VND', ''],
        ['Tổng số hợp đồng:', data.length, 'hợp đồng', ''],
        ['', '', '', ''],
        ['PHÂN TÍCH THEO TRẠNG THÁI:', '', '', ''],
      ];

      // Count by status
      const statusCounts = data.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Add status breakdown
      Object.entries(statusCounts).forEach(([status, count]) => {
        summaryData.push([status + ':', count, 'hợp đồng', '']);
      });

      // Count by type
      const typeCounts = data.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      summaryData.push(['', '', '', '']);
      summaryData.push(['PHÂN TÍCH THEO LOẠI HÌNH:', '', '', '']);
      Object.entries(typeCounts).forEach(([type, count]) => {
        summaryData.push([type + ':', count, 'hợp đồng', '']);
      });

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      summaryWs['!cols'] = [
        { width: 25 },
        { width: 20 },
        { width: 15 },
        { width: 10 }
      ];

      XLSX.utils.book_append_sheet(wb, summaryWs, 'Tổng Kết');

      // Generate filename
      const contractTypeText = selectedContractType === 'all' ? 'TatCa' : selectedContractType.replace(/\s+/g, '');
      const dateRange = (startDate && endDate) ? `${startDate}_${endDate}` : 'ToanBo';
      const filename = `HopDongDangChoVay_${contractTypeText}_${dateRange}.xlsx`;

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