import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, startOfDay, endOfDay, parse } from 'date-fns';

// Import calculation functions
import { calculateCloseContractInterest as calculatePawnCloseInterest } from '@/lib/Pawns/calculate_close_contract_interest';
import { calculateCloseContractInterest as calculateCreditCloseInterest } from '@/lib/Credits/calculate_close_contract_interest';

interface ContractCloseData {
  id: string;
  contractId: string;
  contractCode: string;
  customerName: string;
  itemName: string;
  loanDate: string;
  closeDate: string;
  closeDateTime: string;
  loanAmount: number;
  interestAmount: number;
  totalAmount: number;
  type: 'Cầm đồ' | 'Tín chấp';
}

interface ExcelExportProps {
  storeId: string | undefined;
  startDate: string;
  endDate: string;
  storeName: string;
  selectedContractType?: string;
}

// Use the same fetchAllData function as other components
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
  storeId, 
  startDate, 
  endDate, 
  storeName,
  selectedContractType = 'all'
}: ExcelExportProps) {
  const [isExporting, setIsExporting] = useState(false);

  // Calculate interest amount for a contract
  const calculateInterestAmount = async (contractId: string, type: 'Cầm đồ' | 'Tín chấp', closeDate: string): Promise<number> => {
    try {
      // Use the close date as the calculation date
      const calculationDate = format(new Date(closeDate), 'yyyy-MM-dd');
      
      if (type === 'Cầm đồ') {
        // Use pawn calculation function
        return await calculatePawnCloseInterest(contractId, calculationDate);
      } else {
        // Use credit calculation function
        return await calculateCreditCloseInterest(contractId, calculationDate);
      }
    } catch (error) {
      console.error(`Error calculating interest for ${type} contract ${contractId}:`, error);
      return 0;
    }
  };

  const fetchContractCloseData = async (): Promise<ContractCloseData[]> => {
    if (!storeId) return [];

    try {
      const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
      const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
      
      // Format dates for query
      const startDateISO = startDateObj.toISOString();
      const endDateISO = endDateObj.toISOString();
      
      const allContracts: ContractCloseData[] = [];

      // Fetch closed pawn contracts
      if (selectedContractType === 'all' || selectedContractType === 'Cầm đồ') {
        const pawnData = await fetchAllData(
          supabase
            .from('pawns')
            .select(`
              id,
              contract_code,
              loan_date,
              updated_at,
              loan_amount,
              customers (name),
              collateral_detail
            `)
            .eq('store_id', storeId)
            .eq('status', 'closed')
            .gte('updated_at', startDateISO)
            .lte('updated_at', endDateISO)
        );

        if (pawnData) {
          for (const item of pawnData) {
            // Get item name from collateral_detail
            let itemName = '';
            try {
              if (item.collateral_detail) {
                if (typeof item.collateral_detail === 'string') {
                  const parsed = JSON.parse(item.collateral_detail);
                  itemName = parsed.name || '';
                } else if (typeof item.collateral_detail === 'object') {
                  itemName = item.collateral_detail.name || '';
                }
              }
            } catch (e) {
              console.error('Error parsing collateral_detail:', e);
            }

            // Calculate interest amount
            const interestAmount = await calculateInterestAmount(item.id, 'Cầm đồ', item.updated_at);
            const loanAmount = item.loan_amount || 0;
            const totalAmount = loanAmount + interestAmount;

            allContracts.push({
              id: `pawn-${item.id}`,
              contractId: item.id,
              contractCode: item.contract_code || '',
              customerName: item.customers?.name || '',
              itemName: itemName || '',
              loanDate: item.loan_date || '',
              closeDate: new Date(item.updated_at).toLocaleDateString('vi-VN'),
              closeDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
              loanAmount,
              interestAmount,
              totalAmount,
              type: 'Cầm đồ'
            });
          }
        }
      }

      // Fetch closed credit contracts
      if (selectedContractType === 'all' || selectedContractType === 'Tín chấp') {
        const creditData = await fetchAllData(
          supabase
            .from('credits')
            .select(`
              id,
              contract_code,
              loan_date,
              updated_at,
              loan_amount,
              customers (name)
            `)
            .eq('store_id', storeId)
            .eq('status', 'closed')
            .gte('updated_at', startDateISO)
            .lte('updated_at', endDateISO)
        );

        if (creditData) {
          for (const item of creditData) {
            // Calculate interest amount
            const interestAmount = await calculateInterestAmount(item.id, 'Tín chấp', item.updated_at);
            const loanAmount = item.loan_amount || 0;
            const totalAmount = loanAmount + interestAmount;

            allContracts.push({
              id: `credit-${item.id}`,
              contractId: item.id,
              contractCode: item.contract_code || '',
              customerName: item.customers?.name || '',
              itemName: 'Tín Chấp',
              loanDate: item.loan_date || '',
              closeDate: new Date(item.updated_at).toLocaleDateString('vi-VN'),
              closeDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
              loanAmount,
              interestAmount,
              totalAmount,
              type: 'Tín chấp'
            });
          }
        }
      }

      // Sort by close date (newest first)
      allContracts.sort((a, b) => new Date(b.closeDateTime).getTime() - new Date(a.closeDateTime).getTime());
      
      return allContracts;
    } catch (error) {
      console.error('Error fetching contract close data:', error);
      return [];
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      // Fetch contract close data
      const contractData = await fetchContractCloseData();

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Contract close sheet data
      const contractSheetData = [
        ['BÁO CÁO CHUỘC ĐỒ, ĐÓNG HỢP ĐỒNG'],
        [`Cửa hàng: ${storeName}`],
        [`Từ ngày: ${new Date(startDate).toLocaleDateString('vi-VN')} - Đến ngày: ${new Date(endDate).toLocaleDateString('vi-VN')}`],
        [''],
        ['STT', 'Loại hình', 'Mã HĐ', 'Khách Hàng', 'Tên Hàng', 'Ngày Vay', 'Ngày Tất Toán', 'Ngày Giao Dịch', 'Tiền Vay (VND)', 'Tiền Lãi Phí (VND)', 'Tổng Tiền (VND)'],
        ...contractData.map((contract, index) => [
          index + 1,
          contract.type,
          contract.contractCode,
          contract.customerName,
          contract.itemName,
          contract.loanDate ? new Date(contract.loanDate).toLocaleDateString('vi-VN') : '-',
          contract.closeDate,
          contract.closeDateTime,
          contract.loanAmount.toLocaleString(),
          contract.interestAmount.toLocaleString(),
          contract.totalAmount.toLocaleString()
        ])
      ];

      // Add summary totals
      const totalLoanAmount = contractData.reduce((sum, contract) => sum + contract.loanAmount, 0);
      const totalInterestAmount = contractData.reduce((sum, contract) => sum + contract.interestAmount, 0);
      const grandTotal = contractData.reduce((sum, contract) => sum + contract.totalAmount, 0);

      contractSheetData.push([
        '', '', '', '', '', '', '', 'TỔNG CỘNG',
        totalLoanAmount.toLocaleString(),
        totalInterestAmount.toLocaleString(),
        grandTotal.toLocaleString()
      ]);

      // Create contract sheet
      const contractSheet = XLSX.utils.aoa_to_sheet(contractSheetData);
      
      // Set column widths for contract sheet
      contractSheet['!cols'] = [
        { width: 5 },   // STT
        { width: 12 },  // Loại hình
        { width: 15 },  // Mã HĐ
        { width: 20 },  // Khách Hàng
        { width: 20 },  // Tên Hàng
        { width: 12 },  // Ngày Vay
        { width: 12 },  // Ngày Tất Toán
        { width: 18 },  // Ngày Giao Dịch
        { width: 15 },  // Tiền Vay
        { width: 15 },  // Tiền Lãi Phí
        { width: 15 }   // Tổng Tiền
      ];

      XLSX.utils.book_append_sheet(wb, contractSheet, 'Báo cáo chuộc đồ');

      // Generate filename
      const startDateFormatted = new Date(startDate).toLocaleDateString('vi-VN').replace(/\//g, '');
      const endDateFormatted = new Date(endDate).toLocaleDateString('vi-VN').replace(/\//g, '');
      const filename = `BaoCaoChuocDo_${startDateFormatted}_${endDateFormatted}.xlsx`;

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