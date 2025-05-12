
"use client";
import { useEffect, useState } from 'react';
import { getCurrentUser, signOut } from '../../lib/auth';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '50px' }}>Đang tải...</div>;
  }

  if (!user) {
    return <div style={{ textAlign: 'center', padding: '50px' }}>Không tìm thấy thông tin người dùng.</div>;
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Trang Dashboard</h1>
        <div className="border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Thông tin người dùng</h2>
          <div className="space-y-3">
            <p><strong>Tên người dùng:</strong> {user.username || 'Chưa thiết lập'}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Vai trò:</strong> {user.role || 'user'}</p>
            <p><strong>ID Người dùng:</strong> {user.id}</p>
          </div>
        </div>
      </div>
      <button 
        onClick={handleLogout}
        className="px-6 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
      >
        Đăng xuất
      </button>
    </Layout>
  );
}
