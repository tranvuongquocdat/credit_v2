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
import Link from 'next/link';
import { PawnTransaction } from './types';

interface PawnTableProps {
  storeId: string | undefined;
  startDate: string;
  endDate: string;
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

export default function PawnTable({ storeId, startDate, endDate }: PawnTableProps) {
  const [transactions, setTransactions] = useState<PawnTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchPawnTransactions = async () => {
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
          .from('pawn_history')
          .select(`
            *,
            pawns!inner (
              contract_code,
              store_id
            )
          `)
          .eq('pawns.store_id', storeId)
          .eq('is_deleted', false)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false })
      );
      
      // Use any[] for data to avoid TypeScript issues with the join
      const formattedData: PawnTransaction[] = data.map((item: any) => ({
        id: item.id,
        date: format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm'),
        contractCode: item.pawns?.contract_code || 'N/A',
        customerName: 'N/A', // Customer name is not available in this query
        description: item.description || 'Giao dịch cầm đồ',
        loanAmount: item.debit_amount || 0,
        interestAmount: item.credit_amount || 0,
        transactionType: item.transaction_type || ''
      }));
      
      setTransactions(formattedData);
    } catch (err) {
      console.error('Error fetching pawn transactions:', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchPawnTransactions();
  }, [storeId, startDate, endDate]);
  
  // Calculate totals
  const totalLoan = transactions.reduce((sum, item) => sum + item.loanAmount, 0);
  const totalInterest = transactions.reduce((sum, item) => sum + item.interestAmount, 0);
  const netAmount = totalInterest - totalLoan;
  
  return (
    <Card className="mt-4">
      <CardHeader className="py-3">
        <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">Cầm đồ</CardTitle>
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
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Mã HĐ</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Loại GD</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tiền cầm</TableHead>
                  <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Tiền lãi phí</TableHead>
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
                      {item.contractCode !== 'N/A' ? (
                        <Link href={`/pawns/${item.contractCode}`} className="text-blue-600 hover:underline">
                          {item.contractCode}
                        </Link>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                      {item.description}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-r border-b border-gray-200">
                      {item.loanAmount > 0 ? (
                        <span className="text-red-600">-{formatCurrency(item.loanAmount)}</span>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right border-b border-gray-200">
                      {item.interestAmount > 0 ? (
                        <span className="text-green-600">+{formatCurrency(item.interestAmount)}</span>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-gray-50">
                <TableRow>
                  <TableCell colSpan={4} className="py-2 px-3 text-right font-bold border-r border-t border-gray-200">
                    Tổng
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold border-r border-t border-gray-200">
                    <span className="text-red-600">-{formatCurrency(totalLoan)}</span>
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-bold border-t border-gray-200">
                    <span className="text-green-600">+{formatCurrency(totalInterest)}</span>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4} className="py-2 px-3 text-right font-bold border-r border-t border-gray-200">
                    Tổng giao dịch cầm đồ
                  </TableCell>
                  <TableCell colSpan={2} className="py-2 px-3 text-right font-bold border-t border-gray-200">
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