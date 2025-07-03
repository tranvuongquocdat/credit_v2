import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

type Params = Promise<{ id: string }>;

export async function DELETE(
  request: Request,
  { params }: { params: Params }
) {
  try {
    const { id: userId } = await params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'ID người dùng không hợp lệ' },
        { status: 400 }
      );
    }

    // Lấy cookie store BẤT ĐỒNG BỘ
    const cookieStore = await cookies();

    // Truyền hàm trả về cookieStore cho Supabase helper
    const supabase = createRouteHandlerClient({
      cookies,
    });

    // Kiểm tra quyền admin
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    
    if (!userProfile) {
      return NextResponse.json(
        { error: 'Không tìm thấy tài khoản người dùng' },
        { status: 403 }
      );
    }

    // Tạo Supabase admin client với Service Role Key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Service Role Key chưa được cấu hình' },
        { status: 500 }
      );
    }
    
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Xóa người dùng từ auth.users
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (authDeleteError) {
      return NextResponse.json(
        { 
          error: 'Không thể xóa tài khoản xác thực.',
          details: authDeleteError.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Đã xóa tài khoản người dùng thành công'
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: error.message || 'Đã có lỗi xảy ra khi xóa tài khoản người dùng' },
      { status: 500 }
    );
  }
} 