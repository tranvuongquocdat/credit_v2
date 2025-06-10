import { Button } from '@/components/ui/button';
import { DownloadIcon } from 'lucide-react';
import * as XLSX from 'xlsx';

// Import the transaction interfaces
import { 
  PawnTransaction,
  CreditTransaction,
  InstallmentTransaction,
  Transaction,
  CapitalTransaction
} from './types';

interface ExcelExporterProps {
  summaryData: {
    openingBalance: number;
    pawnActivity: number;
    creditActivity: number;
    installmentActivity: number;
    incomeExpense: number;
    capital: number;
    closingBalance: number;
  };
  pawnData: PawnTransaction[];
  creditData: CreditTransaction[];
  installmentData: InstallmentTransaction[];
  transactionData: Transaction[];
  capitalData: CapitalTransaction[];
  startDate: string;
  endDate: string;
  storeName: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN').format(value);
};

export default function ExcelExporter({ 
  summaryData, 
  pawnData, 
  creditData, 
  installmentData, 
  transactionData, 
  capitalData,
  startDate,
  endDate,
  storeName
}: ExcelExporterProps) {
  
  const exportToExcel = () => {
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Format dates for filename
    const formattedStartDate = startDate.replace(/-/g, '');
    const formattedEndDate = endDate.replace(/-/g, '');
    
    // Format summary data for Excel
    const summaryWorksheet = XLSX.utils.aoa_to_sheet([
      ['BÁO CÁO SỔ QUỸ TIỀN MẶT'],
      [`Cửa hàng: ${storeName}`],
      [`Từ ngày: ${startDate} đến ngày: ${endDate}`],
      [''],
      ['BẢNG TỔNG KẾT'],
      ['Quỹ tiền mặt đầu kỳ', 'Cầm đồ', 'Tín chấp', 'Trả góp', 'Thu chi', 'Vốn', 'Quỹ tiền mặt cuối kỳ'],
      [
        formatCurrency(summaryData.openingBalance),
        formatCurrency(summaryData.pawnActivity),
        formatCurrency(summaryData.creditActivity),
        formatCurrency(summaryData.installmentActivity),
        formatCurrency(summaryData.incomeExpense),
        formatCurrency(summaryData.capital),
        formatCurrency(summaryData.closingBalance)
      ]
    ]);
    
    // Format pawn data for Excel
    const pawnRows: (string | number)[][] = [
      ['GIAO DỊCH CẦM ĐỒ'],
      ['STT', 'Ngày GD', 'Mã HĐ', 'Khách hàng', 'Loại GD', 'Tiền cầm', 'Tiền lãi phí']
    ];
    
    pawnData.forEach((item, index) => {
      pawnRows.push([
        index + 1,
        item.date,
        item.contractCode,
        item.customerName,
        item.description,
        item.loanAmount > 0 ? -item.loanAmount : 0,
        item.interestAmount > 0 ? item.interestAmount : 0
      ]);
    });
    
    // Calculate pawn totals
    const pawnTotalLoan = pawnData.reduce((sum, item) => sum + (item.loanAmount || 0), 0);
    const pawnTotalInterest = pawnData.reduce((sum, item) => sum + (item.interestAmount || 0), 0);
    const pawnNetAmount = pawnTotalInterest - pawnTotalLoan;
    
    pawnRows.push([
      '', '', '', '', 'Tổng', -pawnTotalLoan, pawnTotalInterest
    ]);
    
    pawnRows.push([
      '', '', '', '', 'Tổng giao dịch cầm đồ', pawnNetAmount, ''
    ]);
    
    const pawnWorksheet = XLSX.utils.aoa_to_sheet(pawnRows);
    
    // Format credit data for Excel
    const creditRows: (string | number)[][] = [
      ['GIAO DỊCH TÍN CHẤP'],
      ['STT', 'Ngày GD', 'Mã HĐ', 'Khách hàng', 'Loại GD', 'Cho vay', 'Tiền lãi phí']
    ];
    
    creditData.forEach((item, index) => {
      creditRows.push([
        index + 1,
        item.date,
        item.contractCode,
        item.customerName,
        item.description,
        item.loanAmount > 0 ? -item.loanAmount : 0,
        item.interestAmount > 0 ? item.interestAmount : 0
      ]);
    });
    
    // Calculate credit totals
    const creditTotalLoan = creditData.reduce((sum, item) => sum + (item.loanAmount || 0), 0);
    const creditTotalInterest = creditData.reduce((sum, item) => sum + (item.interestAmount || 0), 0);
    const creditNetAmount = creditTotalInterest - creditTotalLoan;
    
    creditRows.push([
      '', '', '', '', 'Tổng', -creditTotalLoan, creditTotalInterest
    ]);
    
    creditRows.push([
      '', '', '', '', 'Tổng giao dịch tín chấp', creditNetAmount, ''
    ]);
    
    const creditWorksheet = XLSX.utils.aoa_to_sheet(creditRows);
    
    // Format installment data for Excel
    const installmentRows: (string | number)[][] = [
      ['GIAO DỊCH TRẢ GÓP'],
      ['STT', 'Ngày GD', 'Mã HĐ', 'Khách hàng', 'Loại GD', 'Cho vay', 'Thu về']
    ];
    
    installmentData.forEach((item, index) => {
      installmentRows.push([
        index + 1,
        item.date,
        item.contractCode,
        item.customerName,
        item.description,
        item.loanAmount > 0 ? -item.loanAmount : 0,
        item.interestAmount > 0 ? item.interestAmount : 0
      ]);
    });
    
    // Calculate installment totals
    const installmentTotalLoan = installmentData.reduce((sum, item) => sum + (item.loanAmount || 0), 0);
    const installmentTotalInterest = installmentData.reduce((sum, item) => sum + (item.interestAmount || 0), 0);
    const installmentNetAmount = installmentTotalInterest - installmentTotalLoan;
    
    installmentRows.push([
      '', '', '', '', 'Tổng', -installmentTotalLoan, installmentTotalInterest
    ]);
    
    installmentRows.push([
      '', '', '', '', 'Tổng giao dịch trả góp', installmentNetAmount, ''
    ]);
    
    const installmentWorksheet = XLSX.utils.aoa_to_sheet(installmentRows);
    
    // Format transaction data for Excel
    const transactionRows: (string | number)[][] = [
      ['THU CHI'],
      ['STT', 'Ngày GD', 'Mô tả', 'Loại GD', 'Chi phí', 'Thu nhập']
    ];
    
    transactionData.forEach((item, index) => {
      transactionRows.push([
        index + 1,
        item.date,
        item.description,
        item.transactionType === 'income' ? 'Thu nhập' : 
        item.transactionType === 'expense' ? 'Chi phí' : 'Giao dịch thu chi',
        item.expense > 0 ? -item.expense : 0,
        item.income > 0 ? item.income : 0
      ]);
    });
    
    // Calculate transaction totals
    const transactionTotalExpense = transactionData.reduce((sum, item) => sum + (item.expense || 0), 0);
    const transactionTotalIncome = transactionData.reduce((sum, item) => sum + (item.income || 0), 0);
    const transactionNetAmount = transactionTotalIncome - transactionTotalExpense;
    
    transactionRows.push([
      '', '', '', 'Tổng', -transactionTotalExpense, transactionTotalIncome
    ]);
    
    transactionRows.push([
      '', '', '', 'Tổng thu chi', transactionNetAmount, ''
    ]);
    
    const transactionWorksheet = XLSX.utils.aoa_to_sheet(transactionRows);
    
    // Format capital data for Excel
    const capitalRows: (string | number)[][] = [
      ['NGUỒN VỐN'],
      ['STT', 'Ngày GD', 'Mô tả', 'Số tiền']
    ];
    
    capitalData.forEach((item, index) => {
      capitalRows.push([
        index + 1,
        item.date,
        item.description,
        item.amount
      ]);
    });
    
    // Calculate capital totals
    const capitalPositive = capitalData.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0);
    const capitalNegative = capitalData.reduce((sum, item) => sum + (item.amount < 0 ? -item.amount : 0), 0);
    const capitalNetAmount = capitalPositive - capitalNegative;
    
    capitalRows.push([
      '', '', 'Tổng nguồn vốn', capitalNetAmount
    ]);
    
    const capitalWorksheet = XLSX.utils.aoa_to_sheet(capitalRows);
    
    // Add all worksheets to workbook
    XLSX.utils.book_append_sheet(wb, summaryWorksheet, "Tổng kết");
    XLSX.utils.book_append_sheet(wb, pawnWorksheet, "Cầm đồ");
    XLSX.utils.book_append_sheet(wb, creditWorksheet, "Tín chấp");
    XLSX.utils.book_append_sheet(wb, installmentWorksheet, "Trả góp");
    XLSX.utils.book_append_sheet(wb, transactionWorksheet, "Thu chi");
    XLSX.utils.book_append_sheet(wb, capitalWorksheet, "Nguồn vốn");
    
    // Generate filename
    const fileName = `SoQuy_${storeName}_${formattedStartDate}_${formattedEndDate}.xlsx`;
    
    // Write and download file
    XLSX.writeFile(wb, fileName);
  };
  
  return (
    <Button 
      variant="default" 
      onClick={exportToExcel}
      className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
    >
      <DownloadIcon className="w-4 h-4" />
      Xuất Excel
    </Button>
  );
} 