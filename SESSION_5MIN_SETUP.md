# Cấu hình Inactivity Logout 5 Phút - Hướng dẫn Setup

## 📋 Tổng quan
Dự án đã được cấu hình để sử dụng **inactivity-based logout** - người dùng chỉ bị đăng xuất khi **không hoạt động** trong 5 phút liên tục. Khi có hoạt động (click, keyboard, scroll, mouse move), session sẽ được duy trì. **Khi bị đăng xuất, luôn redirect về trang chủ "/"**.

## 🔧 Những thay đổi đã thực hiện

### 1. Cấu hình Supabase (`supabase/config.toml`)
```toml
[auth]
# JWT expiry restored to normal 1 hour
jwt_expiry = 3600

[auth.sessions]
# Remove fixed timebox (no forced logout after fixed time)
# timebox = "5m"
# Only logout when inactive for 5 minutes
inactivity_timeout = "5m"
```

### 2. ActivityTracker Component thay thế SessionTimeoutWarning
- Không có UI, hoạt động ngầm
- Track user activity: mouse, keyboard, scroll, touch, click
- Tự động reset timer khi có activity
- Logout khi không có activity trong 5 phút

### 3. AuthContext cập nhật
- Sử dụng ActivityTracker thay vì SessionTimeoutWarning
- **Đơn giản redirect về "/" khi SIGNED_OUT**

### 4. Middleware cải tiến
- **Luôn redirect về "/" thay vì login page**
- Không xử lý error parameters phức tạp
- Đơn giản hóa logic authentication

### 5. Login page đơn giản hóa
- **Bỏ tất cả logic xử lý error parameters**
- Không còn banner thông báo inactivity
- UI clean và đơn giản

## 🚀 Cách khởi động lại hệ thống

### Bước 0: Cài đặt Supabase CLI (nếu chưa có)
```bash
# Cài đặt qua npm
npm install -g supabase

# Hoặc download binary từ GitHub releases
# https://github.com/supabase/cli/releases
```

### Bước 1: Dừng Supabase local (nếu đang chạy)
```bash
supabase stop
```

### Bước 2: Khởi động lại với config mới
```bash
supabase start
```

### Bước 3: Khởi động Next.js app
```bash
npm run dev
```

## 🔄 Alternative: Sử dụng Production Supabase

### Bước 1: Truy cập Supabase Dashboard
```bash
# Mở browser và đi tới:
https://app.supabase.com/project/YOUR_PROJECT_ID/settings/auth
```

### Bước 2: Cập nhật Auth Settings
- **Advanced Settings** → **JWT Expiry**: `3600` (1 hour - default)
- **Sessions** → **Time-box user sessions**: `DISABLE` (không force logout)
- **Sessions** → **Inactivity timeout**: `5` minutes

### Bước 3: Restart Next.js
```bash
npm run dev
```

## ⚡ Testing Inactivity Logout

### Test 1: User hoạt động liên tục
1. Đăng nhập vào hệ thống
2. Liên tục click, scroll, move mouse
3. Session sẽ không bao giờ timeout
4. Có thể làm việc hàng giờ mà không bị logout

### Test 2: User không hoạt động
1. Đăng nhập vào hệ thống
2. Để yên không touch gì trong 5 phút
3. **Sẽ tự động logout và redirect về trang chủ "/"**
4. Không có thông báo lỗi hay error parameters

### Test 3: Mix activity và inactivity
1. Đăng nhập và làm việc bình thường
2. Nghỉ giải lao 3 phút (không touch gì)
3. Quay lại và click/scroll
4. Timer sẽ reset, session tiếp tục
5. Nếu nghỉ quá 5 phút mới logout về "/"

## 🔍 Debug & Monitor

### Activity Tracking Debug
Trong browser console, bạn sẽ thấy:
```
User activity detected, session refreshed
No activity detected for 5 minutes, logging out...
```

### Check session status
Trong browser DevTools, xem Network tab:
- Console logs sẽ hiển thị auth state changes
- Middleware logs cho auth errors

### Supabase Studio (Local)
```bash
# Mở Supabase Studio để monitor sessions
http://localhost:54323
```

### Environment Variables Check
Verify các env variables được set đúng:
```bash
# Check trong .env.local
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## ⚠️ Lưu ý quan trọng

### UX Benefits
- Users có thể làm việc liên tục mà không bị gián đoạn
- **Logout đơn giản về trang chủ, không có error messages phức tạp**
- Clean và straightforward user experience

### Security Benefits
- Vẫn đảm bảo logout khi device bị bỏ quên
- Tự động clear session khi không có user
- Balance giữa security và usability

### Technical Considerations
- ActivityTracker chạy ngầm, không ảnh hưởng performance
- Event listeners được cleanup properly
- JWT expiry về normal (1 hour) cho stability
- **Redirect logic đơn giản: luôn về "/"**

## 🐛 Troubleshooting

### Lỗi thường gặp:

1. **Logout quá sớm hoặc quá muộn**
   - Check console logs xem activity có detect được không
   - Verify `inactivity_timeout = "5m"` trong config.toml
   - Clear browser cache và cookies

2. **Activity không được detect**
   - Check browser console for errors
   - Verify ActivityTracker component được mount
   - Test với different types of activity (mouse, keyboard, scroll)

3. **Session không refresh sau activity**
   - Check network tab for API calls
   - Verify Supabase client configuration
   - Check auth state change listeners

4. **Redirect không về "/"**
   - Check middleware logs trong console
   - Verify protected routes trong middleware config
   - Test với different browsers

### Activity Events được track:
- `mousedown` - Click chuột
- `mousemove` - Di chuyển chuột
- `keypress` - Nhấn phím
- `scroll` - Scroll trang
- `touchstart` - Touch trên mobile
- `click` - Click elements

### Log files để debug:
- Browser Console (activity logs)
- Network tab (auth API calls)
- Supabase logs trong terminal
- Next.js development console

## 📞 Support
Nếu gặp vấn đề, check:
1. Console logs trong browser (activity detection)
2. Network requests trong DevTools (session refresh)
3. Supabase local logs trong terminal
4. Verify cấu hình trong `supabase/config.toml`
5. Test với different activity types để verify detection
6. Environment variables trong `.env.local` 