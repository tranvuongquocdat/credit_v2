
"use client";
import { useEffect, useState } from 'react';
import { getCurrentUser } from '../../lib/auth';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { Card } from '@/components/ui/card';
import { ArrowUp, ArrowDown, DollarSign, Calendar, Users, CreditCard, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalDebt: 1615000,
    paymentPeriods: 37350,
    paid: 0,
    overdue: 2
  });
  const router = useRouter();

  useEffect(() => {
    async function fetchUser() {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      setLoading(false);
      
      if (!currentUser) {
        router.push('/login');
      }
    }
    fetchUser();
  }, [router]);



  if (loading) {
    return <div style={{ textAlign: 'center', padding: '50px' }}>Đang tải...</div>;
  }

  if (!user) {
    return <div style={{ textAlign: 'center', padding: '50px' }}>Không tìm thấy thông tin người dùng.</div>;
  }

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Tổng quan tín chấp</h1>
          <div className="space-x-2">
            <Button variant="outline" size="sm">Hôm nay</Button>
            <Button variant="outline" size="sm">Tuần này</Button>
            <Button variant="outline" size="sm">Tháng này</Button>
            <Button variant="outline" size="sm">Năm nay</Button>
          </div>
        </div>

        {/* Thông báo */}
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
          <p className="text-amber-800">Thông báo: Đang thực hiện kiểm chứng số liệu tín chấp. Xin vui lòng kiểm tra dữ liệu trước khi thực hiện.</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 - Tổng số tiền */}
          <Card className="p-4 border-l-4 border-green-500 bg-green-50">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-green-700 text-sm font-medium">Tổng dư nợ</p>
                <h3 className="text-2xl font-bold mt-1">{formatCurrency(1615000)}</h3>
                <div className="flex items-center mt-1">
                  <span className="text-green-600 text-xs flex items-center">
                    <ArrowUp className="h-3 w-3 mr-1" />8,000,000
                  </span>
                </div>
              </div>
              <div className="bg-green-200 h-10 w-10 rounded-full flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-700" />
              </div>
            </div>
          </Card>

          {/* Card 2 - Kỳ thanh toán */}
          <Card className="p-4 border-l-4 border-blue-500 bg-blue-50">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-blue-700 text-sm font-medium">Kỳ thanh toán</p>
                <h3 className="text-2xl font-bold mt-1">37,350</h3>
                <div className="flex items-center mt-1">
                  <span className="text-blue-600 text-xs flex items-center">
                    <ArrowUp className="h-3 w-3 mr-1" />Tăng
                  </span>
                </div>
              </div>
              <div className="bg-blue-200 h-10 w-10 rounded-full flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-700" />
              </div>
            </div>
          </Card>

          {/* Card 3 - Đã thanh toán */}
          <Card className="p-4 border-l-4 border-red-500 bg-red-50">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-red-700 text-sm font-medium">Đã thanh toán</p>
                <h3 className="text-2xl font-bold mt-1">0</h3>
                <div className="flex items-center mt-1">
                  <span className="text-red-600 text-xs flex items-center">
                    <ArrowDown className="h-3 w-3 mr-1" />Giảm
                  </span>
                </div>
              </div>
              <div className="bg-red-200 h-10 w-10 rounded-full flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-red-700" />
              </div>
            </div>
          </Card>

          {/* Card 4 - Quá hạn */}
          <Card className="p-4 border-l-4 border-amber-500 bg-amber-50">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-amber-700 text-sm font-medium">Quá hạn</p>
                <h3 className="text-2xl font-bold mt-1">2</h3>
                <div className="flex items-center mt-1">
                  <span className="text-amber-600 text-xs flex items-center">
                    <ArrowUp className="h-3 w-3 mr-1" />Tăng
                  </span>
                </div>
              </div>
              <div className="bg-amber-200 h-10 w-10 rounded-full flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-amber-700" />
              </div>
            </div>
          </Card>
        </div>

        {/* Chart */}
        <Card className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium">Biểu đồ khách hàng</h2>
            <div className="space-x-2">
              <Badge variant="outline" className="text-blue-600 bg-blue-50">Tín chấp</Badge>
              <Badge variant="outline" className="text-red-600 bg-red-50">Thu hồi</Badge>
            </div>
          </div>
          <div className="h-64 w-full text-center py-16 text-gray-500">
            {/* Placeholder cho biểu đồ */}
            <p>Biểu đồ sẽ được hiển thị ở đây</p>
            <p className="text-sm mt-2">Cần tích hợp thư viện biểu đồ như Chart.js hoặc Recharts</p>
          </div>
        </Card>

        {/* Table */}
        <Card className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium">Danh sách khách hàng</h2>
            <Button size="sm" variant="outline">Xem tất cả</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-3 px-2 font-medium">STT</th>
                  <th className="py-3 px-2 font-medium">Tên</th>
                  <th className="py-3 px-2 font-medium">Ngày</th>
                  <th className="py-3 px-2 font-medium">Số tiền</th>
                  <th className="py-3 px-2 font-medium">Khoản vay</th>
                  <th className="py-3 px-2 font-medium">Ngày thanh toán</th>
                  <th className="py-3 px-2 font-medium">Trạng thái</th>
                  <th className="py-3 px-2 font-medium">Còn nợ</th>
                  <th className="py-3 px-2 font-medium">Tổng</th>
                  <th className="py-3 px-2 font-medium">Chi</th>
                </tr>
              </thead>
              <tbody>
                {/* Row 1 */}
                <tr className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2">1</td>
                  <td className="py-2 px-2">Trần Văn A</td>
                  <td className="py-2 px-2">14/05/2025</td>
                  <td className="py-2 px-2 font-medium text-right">350,000</td>
                  <td className="py-2 px-2 text-center">...</td>
                  <td className="py-2 px-2">14/05/2025</td>
                  <td className="py-2 px-2">
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Đã TT</Badge>
                  </td>
                  <td className="py-2 px-2 text-right">0</td>
                  <td className="py-2 px-2 text-right">350,000</td>
                  <td className="py-2 px-2 text-right">0</td>
                </tr>
                {/* Row 2 */}
                <tr className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2">2</td>
                  <td className="py-2 px-2">Nguyễn Thị B</td>
                  <td className="py-2 px-2">13/05/2025</td>
                  <td className="py-2 px-2 font-medium text-right">500,000</td>
                  <td className="py-2 px-2 text-center">...</td>
                  <td className="py-2 px-2">15/05/2025</td>
                  <td className="py-2 px-2">
                    <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Chưa TT</Badge>
                  </td>
                  <td className="py-2 px-2 text-right">500,000</td>
                  <td className="py-2 px-2 text-right">550,000</td>
                  <td className="py-2 px-2 text-right">50,000</td>
                </tr>
                {/* Row 3 */}
                <tr className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2">3</td>
                  <td className="py-2 px-2">Lê Thị C</td>
                  <td className="py-2 px-2">12/05/2025</td>
                  <td className="py-2 px-2 font-medium text-right">800,000</td>
                  <td className="py-2 px-2 text-center">...</td>
                  <td className="py-2 px-2">16/05/2025</td>
                  <td className="py-2 px-2">
                    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Sắp hết hạn</Badge>
                  </td>
                  <td className="py-2 px-2 text-right">800,000</td>
                  <td className="py-2 px-2 text-right">850,000</td>
                  <td className="py-2 px-2 text-right">50,000</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td colSpan={7} className="py-3 text-right">Tổng cộng:</td>
                  <td className="py-3 px-2 text-right">1,300,000</td>
                  <td className="py-3 px-2 text-right">1,750,000</td>
                  <td className="py-3 px-2 text-right">100,000</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
