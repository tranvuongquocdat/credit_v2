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

  try {
    const currentPath = request.nextUrl.pathname;
    const isNuvorasBuild = process.env.NEXT_PUBLIC_BUILD_NAME === 'nuvoras';

    // Build khác nuvoras: chặn route /portfolio/* và chuyển sang /portfolio_v2/*
    if (!isNuvorasBuild && (currentPath === '/portfolio' || currentPath.startsWith('/portfolio/'))) {
      const mappedPath = currentPath.replace('/portfolio', '/portfolio_v2');
      return NextResponse.redirect(new URL(mappedPath, request.url));
    }

    // Get the current user
    const { data: { user }, error } = await supabase.auth.getUser();
    
    console.log("middleware user:", user);
    console.log("middleware path:", request.nextUrl.pathname);

    // Danh sách các trang được phép truy cập khi chưa login
    const publicPaths = isNuvorasBuild
      ? ['/', '/login', '/signup', '/portfolio/about', '/portfolio/projects', '/portfolio/skills']
      : ['/', '/login', '/signup', '/portfolio_v2/about', '/portfolio_v2/projects', '/portfolio_v2/skills'];

    // Nếu chưa login và không phải trang public → redirect về "/"
    if (!user && !publicPaths.includes(currentPath)) {
      console.log("User not authenticated, redirecting to home:", currentPath);
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Handle authentication errors
    if (error && !publicPaths.includes(currentPath)) {
      console.log("Auth error, redirecting to home:", error.message);
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Kiểm tra trạng thái ban của người dùng nếu đã đăng nhập
    if (user) {
      try {
        // Kiểm tra trạng thái người dùng trong bảng profiles
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
          return NextResponse.redirect(new URL('/', request.url));
        }
      } catch (err) {
        console.error("Error in ban check:", err);
      }

      // Kiểm tra nếu người dùng đã đăng nhập và đang truy cập trang đăng nhập
      if (currentPath === '/login' || currentPath === '/signup') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
  } catch (authError) {
    console.error("Auth error in middleware:", authError);
    // Redirect to home on any auth error for non-public routes
    const publicPaths = ['/', '/login', '/signup'];
    if (!publicPaths.includes(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
