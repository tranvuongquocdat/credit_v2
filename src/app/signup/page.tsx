"use client";
import { useState } from 'react';
import { signUp } from '../../lib/auth';
import { useRouter } from 'next/navigation';

export default function SignUp() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await signUp(username, password, role);

      if (error) {
        setError(error.message || 'Đã có lỗi xảy ra khi đăng ký');
      } else {
        setSuccess(true);
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ width: '100%', maxWidth: '450px', padding: '30px', backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)', fontFamily: 'Arial, sans-serif' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '20px', color: '#007bff' }}>Đăng Ký Tài Khoản</h1>
        {success ? (
          <p style={{ color: 'green', textAlign: 'center', marginBottom: '20px' }}>Đăng ký thành công! Bạn sẽ được chuyển hướng đến trang đăng nhập...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="username" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>Tên người dùng</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Chọn tên người dùng"
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
                placeholder="Tạo mật khẩu"
                required
                minLength={6}
                style={{ width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: '5px', fontSize: '16px' }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="role" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>Vai trò</label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: '5px', fontSize: '16px', backgroundColor: 'white' }}
              >
                <option value="user">Người dùng (User)</option>
                <option value="owner">Chủ sở hữu (Owner)</option>
                <option value="admin">Quản trị viên (Admin)</option>
              </select>
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
              {loading ? 'Đang đăng ký...' : 'Đăng Ký'}
            </button>
          </form>
        )}
        {error && <p style={{ color: 'red', marginTop: '15px', textAlign: 'center' }}>{error}</p>}
        {!success && (
          <p style={{ marginTop: '20px', textAlign: 'center' }}>
            Đã có tài khoản? <a href="/login" style={{ color: '#007bff', textDecoration: 'none' }}>Đăng nhập</a>
          </p>
        )}
      </div>
    </div>
  );
}
