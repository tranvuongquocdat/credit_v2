import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

interface SummaryData {
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  transactionSummary: {
    [key: string]: {
      income: number;
      expense: number;
    };
  };
}

interface TransactionDetail {
  id: string;
  date: string;
  source: string;
  contractCode: string;
  employeeName: string;
  customerName: string;
  itemName: string;
  description: string;
  income: number;
  expense: number;
}

interface ExcelExportProps {
  summaryData: SummaryData;
  storeId: string | undefined;
  startDate: string;
  endDate: string;
  storeName: string;
  selectedTransactionType?: string;
  selectedEmployee?: string;
}

// Use the same fetchAllData function as TransactionDetailsTable
const fetchAllData = async (query: any, pageSize: number = 1000) => {
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    
    if (error) {
      console.error('Error fetching data:', error);
      break;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return allData;
};

export default function ExcelExport({ 
  summaryData, 
  storeId, 
  startDate, 
  endDate, 
  storeName,
  selectedTransactionType = 'all',
  selectedEmployee = 'all'
}: ExcelExportProps) {
  const [isExporting, setIsExporting] = useState(false);

  const fetchDetailedTransactions = async (): Promise<TransactionDetail[]> => {
    if (!storeId) return [];

    try {
      const allTransactions: TransactionDetail[] = [];

      // Process items function (same as TransactionDetailsTable)
      const processItems = (data: any[], source: string) => {
        if (data && data.length > 0) {
          data.forEach((item) => {
            if (!item.created_at) return;

            let amount = 0;
            if(source === 'Nguồn vốn'){
              amount = item.transaction_type === 'withdrawal' ? -Number(item.fund_amount || 0) : Number(item.fund_amount || 0);
            } else if(source === 'Thu chi'){
              amount = (item.credit_amount || 0) - (item.debit_amount || 0);
              if(amount === 0){
                amount = item.transaction_type === 'expense' ? -Number(item.amount || 0) : Number(item.amount || 0);
              }
            }
            else {
              amount = (item.credit_amount || 0) - (item.debit_amount || 0);
            }

            // Get employee name based on source
            let employeeName = '';
            if (source === 'Thu chi') {
              employeeName = item.employee_name || '';
            } else if (source === 'Cầm đồ' || source === 'Tín chấp' || source === 'Trả góp') {
              employeeName = item.profiles?.username || '';
            }

            // Get customer name based on source
            let customerName = '';
            if (source === 'Cầm đồ') {
              customerName = item.pawns?.customers?.name || '';
            } else if (source === 'Tín chấp') {
              customerName = item.credits?.customers?.name || '';
            } else if (source === 'Trả góp') {
              customerName = item.installments?.customers?.name || '';
            } else if (source === 'Nguồn vốn') {
              customerName = (item as any).name || '';
            } else if (source === 'Thu chi') {
              customerName = (item as any).customers?.name || '';
            }

            // Get item name (only for pawn transactions)
            let itemName = '';
            if (source === 'Cầm đồ') {
              itemName = (item.pawns as any)?.['collateral_detail->>name'] || item.pawns?.collateral_detail?.name || '';
            }

            allTransactions.push({
              id: `${source.toLowerCase()}-${item.id}`,
              date: item.created_at,
              source,
              contractCode: item.contract_code || '-',
              employeeName,
              customerName,
              itemName,
              description: item.description || item.note || `Giao dịch ${source}`,
              income: amount > 0 ? amount : 0,
              expense: amount < 0 ? -amount : 0,
            });
          });
        }
      };

      // Fetch all transaction data (same queries as TransactionDetailsTable)
      
      // Credit history with profiles join and customer data
      const creditHistoryData = await fetchAllData(
        supabase
          .from('credit_history')
          .select(`
            *,
            credits!inner (
              contract_code, 
              store_id,
              customers (name)
            ),
            profiles:created_by (username)
          `)
          .eq('credits.store_id', storeId)
      );
      
      if (creditHistoryData) {
        const processedCreditData = creditHistoryData.map(item => ({
          ...item,
          contract_code: item.credits?.contract_code || null
        }));
        processItems(processedCreditData, 'Tín chấp');
      }

      // Pawn history with profiles join and collateral_detail
      const pawnHistoryData = await fetchAllData(
        supabase
          .from('pawn_history')
          .select(`
            *,
            pawns!inner (
              contract_code, 
              store_id,
              customers (name),
              collateral_detail
            ),
            profiles:created_by (username)
          `)
          .eq('pawns.store_id', storeId)
      );
      
      if (pawnHistoryData) {
        const processedPawnData = pawnHistoryData.map(item => ({
          ...item,
          contract_code: item.pawns?.contract_code || null
        }));
        processItems(processedPawnData, 'Cầm đồ');
      }

      // Installment history with profiles join and customer data
      const installmentHistoryData = await fetchAllData(
        supabase
          .from('installment_history')
          .select(`
            *,
            installments!inner (
              contract_code,
              employee_id,
              employees!inner (store_id),
              customers (name)
            ),
            profiles:created_by (username)
          `)
          .eq('installments.employees.store_id', storeId)
      );
      
      if (installmentHistoryData) {
        const processedInstallmentData = installmentHistoryData.map(item => ({
          ...item,
          contract_code: item.installments?.contract_code || null
        }));
        processItems(processedInstallmentData, 'Trả góp');
      }
      
      // Fund history
      const { data: storeFundData } = await supabase
        .from('store_fund_history')
        .select('*')
        .eq('store_id', storeId)
        .limit(10000);
      
      if (storeFundData) processItems(storeFundData, 'Nguồn vốn');
      
      // Transactions
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*, customers:customer_id(name)')
        .eq('store_id', storeId)
        .limit(10000);
      
      if (transactionsData) processItems(transactionsData, 'Thu chi');

      // Sort by date (newest first)
      allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // Filter by date range
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      let filteredTransactions = allTransactions.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= start && itemDate <= end;
      });

      // Apply transaction type filter
      if (selectedTransactionType !== 'all') {
        filteredTransactions = filteredTransactions.filter(item => 
          item.source === selectedTransactionType
        );
      }

      // Apply employee filter
      if (selectedEmployee !== 'all') {
        filteredTransactions = filteredTransactions.filter(item => 
          item.employeeName === selectedEmployee
        );
      }

      return filteredTransactions;
    } catch (error) {
      console.error('Error fetching detailed transactions:', error);
      return [];
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      // Fetch detailed transaction data
      const detailedTransactions = await fetchDetailedTransactions();

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Summary sheet data
      const summarySheetData = [
        ['TỔNG KẾT GIAO DỊCH'],
        [`Cửa hàng: ${storeName}`],
        [`Từ ngày: ${new Date(startDate).toLocaleDateString('vi-VN')} - Đến ngày: ${new Date(endDate).toLocaleDateString('vi-VN')}`],
        [''],
        ['Bảng Tổng Kết', 'Thu (VND)', 'Chi (VND)'],
        ['Tiền đầu ngày', summaryData.openingBalance.toLocaleString(), ''],
        ...Object.entries(summaryData.transactionSummary).map(([type, values]) => [
          type,
          values.income.toLocaleString(),
          values.expense.toLocaleString()
        ]),
        ['Tiền mặt còn lại', summaryData.closingBalance.toLocaleString(), '']
      ];

      // Create summary sheet
      const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData);
      
      // Set column widths for summary sheet
      summarySheet['!cols'] = [
        { width: 25 },
        { width: 20 },
        { width: 20 }
      ];

      XLSX.utils.book_append_sheet(wb, summarySheet, 'Tổng kết');

      // Detailed transactions sheet data
      const detailSheetData = [
        ['CHI TIẾT GIAO DỊCH'],
        [`Cửa hàng: ${storeName}`],
        [`Từ ngày: ${new Date(startDate).toLocaleDateString('vi-VN')} - Đến ngày: ${new Date(endDate).toLocaleDateString('vi-VN')}`],
        [''],
        ['STT', 'Loại Hình', 'Mã HĐ', 'Người Giao Dịch', 'Khách Hàng', 'Tên Hàng', 'Ngày', 'Diễn Giải', 'Thu (VND)', 'Chi (VND)'],
        ...detailedTransactions.map((transaction, index) => [
          index + 1,
          transaction.source,
          transaction.contractCode,
          transaction.employeeName || '-',
          transaction.customerName || '-',
          transaction.itemName || '-',
          new Date(transaction.date).toLocaleDateString('vi-VN'),
          transaction.description,
          transaction.income > 0 ? transaction.income.toLocaleString() : '',
          transaction.expense > 0 ? transaction.expense.toLocaleString() : ''
        ])
      ];

      // Add subtotals by transaction type
      const transactionTypes = ['Cầm đồ', 'Tín chấp', 'Trả góp', 'Nguồn vốn', 'Thu chi'];
      transactionTypes.forEach(type => {
        const typeTransactions = detailedTransactions.filter(t => t.source === type);
        const totalIncome = typeTransactions.reduce((sum, t) => sum + t.income, 0);
        const totalExpense = typeTransactions.reduce((sum, t) => sum + t.expense, 0);
        
        detailSheetData.push([
          '', '', '', '', '', '', '', `Tổng ${type}`,
          totalIncome > 0 ? totalIncome.toLocaleString() : '',
          totalExpense > 0 ? totalExpense.toLocaleString() : ''
        ]);
      });

      // Add grand total
      const grandTotalIncome = detailedTransactions.reduce((sum, t) => sum + t.income, 0);
      const grandTotalExpense = detailedTransactions.reduce((sum, t) => sum + t.expense, 0);
      detailSheetData.push([
        '', '', '', '', '', '', '', 'TỔNG BIẾN ĐỘNG',
        grandTotalIncome.toLocaleString(),
        grandTotalExpense.toLocaleString()
      ]);

      // Create detailed sheet
      const detailSheet = XLSX.utils.aoa_to_sheet(detailSheetData);
      
      // Set column widths for detail sheet
      detailSheet['!cols'] = [
        { width: 5 },   // STT
        { width: 12 },  // Loại Hình
        { width: 15 },  // Mã HĐ
        { width: 15 },  // Người Giao Dịch
        { width: 20 },  // Khách Hàng
        { width: 20 },  // Tên Hàng
        { width: 12 },  // Ngày
        { width: 25 },  // Diễn Giải
        { width: 15 },  // Thu
        { width: 15 }   // Chi
      ];

      XLSX.utils.book_append_sheet(wb, detailSheet, 'Chi tiết giao dịch');

      // Generate filename
      const startDateFormatted = new Date(startDate).toLocaleDateString('vi-VN').replace(/\//g, '');
      const endDateFormatted = new Date(endDate).toLocaleDateString('vi-VN').replace(/\//g, '');
      const filename = `TongKetGiaoDich_${startDateFormatted}_${endDateFormatted}.xlsx`;

      // Save file
      XLSX.writeFile(wb, filename);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Có lỗi xảy ra khi xuất file Excel');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button 
      onClick={handleExport} 
      disabled={isExporting}
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