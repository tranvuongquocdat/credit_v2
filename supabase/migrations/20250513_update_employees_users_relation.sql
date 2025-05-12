-- First, drop the existing foreign key if it exists
ALTER TABLE employees
DROP CONSTRAINT IF EXISTS employees_id_fkey;

-- Update the foreign key to reference public.users instead of auth.users
ALTER TABLE employees
ADD CONSTRAINT employees_id_fkey
FOREIGN KEY (uid) REFERENCES public.users(id);

-- Enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable read access for employees" ON "public"."employees";
DROP POLICY IF EXISTS "Enable insert for employees" ON "public"."employees";
DROP POLICY IF EXISTS "Enable update for employees" ON "public"."employees";
DROP POLICY IF EXISTS "Enable delete for employees" ON "public"."employees";

-- Create new policies
CREATE POLICY "Enable read access for employees" ON "public"."employees"
FOR SELECT
USING (auth.uid() IN (SELECT id FROM public.users));

CREATE POLICY "Enable insert for employees" ON "public"."employees"
FOR INSERT
WITH CHECK (auth.uid() IN (SELECT id FROM public.users));

CREATE POLICY "Enable update for employees" ON "public"."employees"
FOR UPDATE
USING (auth.uid() IN (SELECT id FROM public.users))
WITH CHECK (auth.uid() IN (SELECT id FROM public.users));

CREATE POLICY "Enable delete for employees" ON "public"."employees"
FOR DELETE
USING (auth.uid() IN (SELECT id FROM public.users));
