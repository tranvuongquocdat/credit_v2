import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/database.types';

// Đảm bảo các biến môi trường này được định nghĩa trong .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Tạo Supabase client cho phía client (browser)
export const supabase = createBrowserClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);
