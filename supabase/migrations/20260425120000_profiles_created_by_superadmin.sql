-- Tenant isolation: track super admin who created each admin.
-- Mục đích: super admin v2 chỉ thấy admin do mình tạo, không thấy admin v1.
--
-- Cột nullable (super admin = top-level, không có "creator").
-- Backfill toàn bộ admin hiện có gắn về super admin v1 duy nhất.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_by_superadmin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_created_by_superadmin_idx
  ON public.profiles (created_by_superadmin_id)
  WHERE role = 'admin';

UPDATE public.profiles
SET    created_by_superadmin_id = '18af91f7-4e57-4664-a265-c5980e5db1da'
WHERE  role = 'admin'
  AND  created_by_superadmin_id IS NULL;

COMMENT ON COLUMN public.profiles.created_by_superadmin_id IS
  'FK tới profiles(id) của super admin đã tạo ra admin này. NULL với super admin (top-level). Dùng để cách ly tenant ở UI flow.';
