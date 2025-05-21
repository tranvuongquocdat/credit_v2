import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'ID người dùng không hợp lệ' },
        { status: 400 }
      );
    }

    // Tạo Supabase client với cookie để kiểm tra quyền của người dùng hiện tại
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Không có quyền truy cập' },
        { status: 401 }
      );
    }
    
    // Kiểm tra quyền admin
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
      
    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Chỉ admin mới có quyền xóa tài khoản người dùng' },
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

    // Kiểm tra xem người dùng có dữ liệu quan trọng liên quan không
    // Ví dụ: kiểm tra các bảng liên quan để đảm bảo việc xóa không gây lỗi

    // Xóa từ bảng profiles trước
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);
      
    if (profileDeleteError) {
      // Nếu không xóa được từ profiles, có thể có ràng buộc khóa ngoại
      return NextResponse.json(
        { 
          error: 'Không thể xóa hồ sơ người dùng. Người dùng này có thể có dữ liệu liên quan trong hệ thống.',
          details: profileDeleteError.message
        },
        { status: 400 }
      );
    }

    // Xóa người dùng từ auth.users
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (authDeleteError) {
      return NextResponse.json(
        { 
          error: 'Đã xóa hồ sơ người dùng nhưng không thể xóa tài khoản xác thực.',
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