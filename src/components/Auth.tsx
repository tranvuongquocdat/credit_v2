"use client";
import { useState } from 'react';
import { signIn, signUp } from '../lib/auth';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const { error } = isSignUp 
        ? await signUp(email, password)
        : await signIn(email, password);

      if (error) {
        setError(error.message || 'Đã có lỗi xảy ra');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    }
  };

  return (
    <div className="auth-container">
      <h1>{isSignUp ? 'Đăng Ký' : 'Đăng Nhập'}</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu"
          required
        />
        <button type="submit">{isSignUp ? 'Đăng Ký' : 'Đăng Nhập'}</button>
      </form>
      {error && <p className="error">{error}</p>}
      <p>
        {isSignUp ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}
        <button onClick={() => setIsSignUp(!isSignUp)}>
          {isSignUp ? 'Đăng Nhập' : 'Đăng Ký'}
        </button>
      </p>
    </div>
  );
}
