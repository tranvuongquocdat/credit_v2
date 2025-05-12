-- Step 1: Create a temporary table to store existing employee data
CREATE TEMP TABLE temp_employees AS 
SELECT * FROM employees;

-- Step 2: Drop existing foreign key constraint
ALTER TABLE employees 
DROP CONSTRAINT IF EXISTS employees_id_fkey;

-- Step 3: Drop the primary key constraint
ALTER TABLE employees 
DROP CONSTRAINT IF EXISTS employees_pkey;

-- Step 4: Rename id column to uid
ALTER TABLE employees 
RENAME COLUMN id TO uid;

-- Step 5: Add new primary key constraint on uid
ALTER TABLE employees 
ADD CONSTRAINT employees_pkey PRIMARY KEY (uid);

-- Step 6: Add new foreign key constraint to auth.users
ALTER TABLE employees 
ADD CONSTRAINT employees_uid_fkey 
FOREIGN KEY (uid) 
REFERENCES auth.users(id)
ON DELETE CASCADE;

-- Step 7: Update RLS policies to use uid instead of id
DROP POLICY IF EXISTS "Employees can only view their own record" ON employees;
CREATE POLICY "Employees can only view their own record" ON employees
FOR SELECT USING (
  auth.uid() = uid OR 
  auth.jwt()->>'role' = 'admin'
);

DROP POLICY IF EXISTS "Employees can only update their own record" ON employees;
CREATE POLICY "Employees can only update their own record" ON employees
FOR UPDATE USING (
  auth.uid() = uid OR 
  auth.jwt()->>'role' = 'admin'
);

-- Step 8: Re-enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Note: Make sure to update any other tables or policies that reference employees.id
-- For example, if you have any tables with employee_id foreign keys, update those as well
