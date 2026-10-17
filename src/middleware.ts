import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { CookieOptions } from '@supabase/ssr';

// Cookie cache kết quả kiểm tra ban (giá trị = user.id đã được xác nhận không bị ban)
const BAN_CHECK_COOKIE = 'nv_ban_ok';
const BAN_CHECK_TTL_SECONDS = 5 * 60;

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
      : ['/', '/login', '/signup'];

    const isPublic = publicPaths.includes(currentPath) || (!isNuvorasBuild && currentPath.startsWith('/space/'));

    // Nếu chưa login và không phải trang public → redirect về "/"
    if (!user && !isPublic) {
      console.log("User not authenticated, redirecting to home:", currentPath);
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Handle authentication errors
    if (error && !isPublic) {
      console.log("Auth error, redirecting to home:", error.message);
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Kiểm tra trạng thái ban của người dùng nếu đã đăng nhập.
    // Kết quả "không bị ban" được cache vào cookie BAN_CHECK_COOKIE trong BAN_CHECK_TTL_SECONDS
    // để không query profiles ở mọi request (mỗi lần chuyển trang tiết kiệm 1 round-trip tới DB).
    // Hệ quả: ban từ admin có hiệu lực chậm tối đa BAN_CHECK_TTL_SECONDS; login vẫn check ngay (lib/auth.ts).
    if (user) {
      const banCheckCached = request.cookies.get(BAN_CHECK_COOKIE)?.value === user.id;
      if (!banCheckCached) {
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
            const redirectResponse = NextResponse.redirect(new URL('/', request.url));
            // Giữ cookie đã cập nhật (xóa session) từ response gốc — redirect mới mặc định không mang theo
            response.cookies.getAll().forEach((cookie) => {
              redirectResponse.cookies.set(cookie);
            });
            redirectResponse.cookies.delete(BAN_CHECK_COOKIE);
            return redirectResponse;
          } else {
            // Không bị ban → cache theo user.id để request sau bỏ qua query
            response.cookies.set({
              name: BAN_CHECK_COOKIE,
              value: user.id,
              maxAge: BAN_CHECK_TTL_SECONDS,
              path: '/',
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            });
          }
        } catch (err) {
          console.error("Error in ban check:", err);
        }
      }

      // Kiểm tra nếu người dùng đã đăng nhập và đang truy cập trang đăng nhập
      if (currentPath === '/login' || currentPath === '/signup') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
  } catch (authError) {
    console.error("Auth error in middleware:", authError);
    // Redirect to home on any auth error for non-public routes
    const publicPaths = ['/', '/login', '/signup', '/portfolio/about', '/portfolio/projects'];
    if (!publicPaths.includes(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}

export const config = {
  // Bỏ qua api, asset của Next và file tĩnh (ảnh/font/css/js) để không gọi Supabase Auth cho mỗi file
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?|ttf|txt|xml)$).*)',
  ],
};
