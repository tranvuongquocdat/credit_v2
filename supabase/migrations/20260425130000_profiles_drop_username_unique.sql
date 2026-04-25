-- Drop UNIQUE constraint trên profiles.username để v1 và v2 cùng dùng được username trùng nhau.
-- Cách ly v1/v2 đã đảm bảo qua:
--   1. auth.users.email vẫn UNIQUE (mỗi env có domain khác: @creditapp.local vs @creditappc2.local)
--   2. profiles.created_by_superadmin_id giới hạn list admin per super admin
-- → username trùng giữa v1 và v2 không xung đột về mặt logic, nhưng bị chặn bởi constraint cũ.
--
-- Lưu ý: transactions.employee_name có FK trỏ tới profiles.username (qua unique key này).
-- Sau khi drop, FK đó bị drop theo (CASCADE) → transactions.employee_name trở thành text thuần,
-- không còn integrity check ở DB. App code phân biệt employee qua store_id + employee_name
-- nên về mặt nghiệp vụ không vỡ.

-- Drop FK phụ thuộc trước (cụ thể, tránh dùng CASCADE để rõ ràng)
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_employee_name_fkey;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_key;

-- Tạo index non-unique để search username vẫn nhanh
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles (username);
