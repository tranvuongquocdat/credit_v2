import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { RefreshCw } from 'lucide-react';

interface CapitalTableProps {
  storeId: string | undefined;
  startDate: string;
  endDate: string;
}

interface CapitalTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  transactionType: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN').format(value);
};

// Function to fetch all data from a query with pagination
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

export default function CapitalTable({ storeId, startDate, endDate }: CapitalTableProps) {
  const [transactions, setTransactions] = useState<CapitalTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchCapitalTransactions = async () => {
    if (!storeId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      const data = await fetchAllData(
        supabase
          .from('store_fund_history')
          .select('id, created_at, transaction_type, fund_amount, note, store_id')
          .eq('store_id', storeId)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false })
      );
      
      const formattedData: CapitalTransaction[] = data.map((item) => {
        // Calculate amount based on transaction type
        const amount = item.transaction_type === 'withdrawal' 
          ? -Number(item.fund_amount || 0) 
          : Number(item.fund_amount || 0);
        
        // Created_at might be null in some cases, provide a fallback
        const createdAt = item.created_at ? parseISO(item.created_at) : new Date();
        
        return {
          id: item.id,
          date: format(createdAt, 'dd/MM/yyyy HH:mm'),
          description: item.note || 'Giao dịch nguồn vốn',
          amount,
          transactionType: item.transaction_type || ''
        };
      });
      
      setTransactions(formattedData);
    } catch (err) {
      console.error('Error fetching capital transactions:', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchCapitalTransactions();
  }, [storeId, startDate, endDate]);
  
  // Calculate totals
  const totalPositive = transactions.reduce((sum, item) => 
    sum + (item.amount > 0 ? item.amount : 0), 0);
  const totalNegative = transactions.reduce((sum, item) => 
    sum + (item.amount < 0 ? -item.amount : 0), 0);
  const netAmount = totalPositive - totalNegative;
  
  return (
    <Card className="mt-4">
      <CardHeader className="py-3">
        <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">Nguồn vốn</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Đang tải dữ liệu...</span>
          </div>
        ) : error ? (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            Không có giao dịch nào trong khoảng thời gian này
          </div>
        ) : (
          <div className="rounded-md border border-gray-200 overflow-hidden">
            <Table className="border-collapse">
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-12">#</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Ngày GD</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Mô tả</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Số tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((item, index) => (
                  <TableRow key={item.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {index + 1}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {item.date}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {item.description}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-b border-gray-200">
                      {item.amount !== 0 && (
                        <span className={item.amount > 0 ? "text-green-600" : "text-red-600"}>
                          {item.amount > 0 ? "+" : ""}{formatCurrency(item.amount)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-gray-50">
                <TableRow>
                  <TableCell colSpan={3} className="py-2 px-3 text-right font-bold border-r border-t border-gray-200">
                    Tổng nguồn vốn
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold border-t border-gray-200">
                    <span className={netAmount >= 0 ? "text-green-600" : "text-red-600"}>
                      {netAmount >= 0 ? "+" : ""}{formatCurrency(netAmount)}
                    </span>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 