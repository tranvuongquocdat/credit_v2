import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Tạo Supabase client sử dụng cookies từ request
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => {
          return request.cookies.get(name)?.value;
        },
        set: (name: string, value: string, options: CookieOptions) => {
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove: (name: string, options: CookieOptions) => {
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  // Lấy thông tin người dùng từ cookie
  console.log('Cookies in middleware:', request.cookies.getAll());
  try {
    // Try to refresh the session first
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.log("Session error:", sessionError);
    }

    // Then get the user
    const { data: { user }, error } = await supabase.auth.getUser();
    console.log("middleware user:", user);
    console.log("middleware auth error:", error);

    // Handle the case where there's no user but no error (expired session)
    if (!user && !error && request.nextUrl.pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Kiểm tra trạng thái ban của người dùng nếu đã đăng nhập
    if (user) {
      try {
        // Kiểm tra trạng thái người dùng trong bảng profiles hoặc user_status
        const { data: userStatus, error: statusError } = await supabase
          .from('profiles')
          .select('is_banned')
          .eq('id', user.id)
          .single();
        
        if (statusError) {
          console.error("Error checking user ban status:", statusError);
        } else if (userStatus?.is_banned) {
          // Người dùng đã bị ban, đăng xuất họ
          console.log("User is banned, signing out:", user.id);
          await supabase.auth.signOut();
          localStorage.removeItem('currentStoreId');
          // Xóa tất cả cookies liên quan đến phiên đăng nhập
          const cookies = request.cookies.getAll();
          cookies.forEach(cookie => {
            if (cookie.name.includes('supabase') || cookie.name.includes('sb')) {
              response.cookies.set({
                name: cookie.name,
                value: '',
                expires: new Date(0),
              });
            }
          });
          
          return NextResponse.redirect(new URL('/login?error=account_banned', request.url));
        }
      } catch (err) {
        console.error("Error in ban check:", err);
      }

      // Kiểm tra nếu người dùng đã đăng nhập và đang truy cập trang đăng nhập/đăng ký
      if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
  } catch (authError) {
    console.error("Auth error in middleware:", authError);
    // Redirect to login on any auth error
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup', '/store/:path*', '/customer/:path*', '/installments/:path*', '/employees/:path*', '/credits/:path*', '/pawns/:path*'],
};
