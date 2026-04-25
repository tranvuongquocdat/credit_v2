"use client";

export const dynamic = 'force-dynamic';

import { useState, Suspense } from 'react';
import { signIn, getCurrentUser } from '../../lib/auth';
import { buildAuthEmail } from '../../lib/auth-email';
import { useRouter } from 'next/navigation';

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await signIn(buildAuthEmail(username), password);
      if (error) {
        // Kiểm tra nếu là lỗi banned
        if (error.message.includes('banned') || error.message.includes('deactivated')) {
          setError('Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên để biết thêm chi tiết.');
        } else {
          setError(error.message || 'Đã có lỗi xảy ra khi đăng nhập');
        }
      } else {
        const currentUser = await getCurrentUser(true);
        const role = currentUser?.role;
        const isV2 = process.env.NEXT_PUBLIC_BUILD_NAME === 'nuvoras_v2';
        if (role === 'superadmin') {
          router.push('/admins');
        } else if (isV2) {
          router.push('/pawns');
        } else {
          router.push('/installments');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '30px', backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)', fontFamily: 'Arial, sans-serif' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '20px', color: '#007bff' }}>Đăng Nhập</h1>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="username" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>Tên người dùng</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên người dùng"
              required
              style={{ width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: '5px', fontSize: '16px' }}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>Mật khẩu</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              required
              style={{ width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: '5px', fontSize: '16px' }}
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              width: '100%', 
              padding: '12px', 
              backgroundColor: loading ? '#ccc' : '#007bff', 
              color: 'white', 
              border: 'none', 
              borderRadius: '5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              transition: 'background-color 0.3s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = loading ? '#ccc' : '#0056b3'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = loading ? '#ccc' : '#007bff'}
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng Nhập'}
          </button>
        </form>
        {error && (
          <div style={{ 
            backgroundColor: '#ffeded', 
            border: '1px solid #f5c6cb', 
            color: '#721c24', 
            padding: '10px', 
            borderRadius: '5px', 
            marginTop: '15px', 
            textAlign: 'center' 
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
