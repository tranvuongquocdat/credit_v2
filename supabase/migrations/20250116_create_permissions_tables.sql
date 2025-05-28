-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  parent_id TEXT REFERENCES permissions(id) ON DELETE CASCADE,
  module TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create employee_permissions table
CREATE TABLE IF NOT EXISTS employee_permissions (
  employee_id UUID REFERENCES employees(uid) ON DELETE CASCADE,
  permission_id TEXT REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (employee_id, permission_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_permissions_parent_id ON permissions(parent_id);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);
CREATE INDEX IF NOT EXISTS idx_employee_permissions_employee_id ON employee_permissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_permissions_permission_id ON employee_permissions(permission_id);

-- Enable RLS (Row Level Security)
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_permissions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for permissions table
CREATE POLICY "Users can view all permissions" ON permissions
  FOR SELECT USING (true);

-- Create RLS policies for employee_permissions table
CREATE POLICY "Users can view employee permissions from their stores" ON employee_permissions
  FOR SELECT USING (
    employee_id IN (
      SELECT uid FROM employees WHERE store_id IN (
        SELECT store_id FROM employees WHERE uid = auth.uid()
      )
    ) OR
    auth.jwt()->>'role' = 'admin'
  );

CREATE POLICY "Users can insert employee permissions to their stores" ON employee_permissions
  FOR INSERT WITH CHECK (
    employee_id IN (
      SELECT uid FROM employees WHERE store_id IN (
        SELECT store_id FROM employees WHERE uid = auth.uid()
      )
    ) OR
    auth.jwt()->>'role' = 'admin'
  );

CREATE POLICY "Users can update employee permissions from their stores" ON employee_permissions
  FOR UPDATE USING (
    employee_id IN (
      SELECT uid FROM employees WHERE store_id IN (
        SELECT store_id FROM employees WHERE uid = auth.uid()
      )
    ) OR
    auth.jwt()->>'role' = 'admin'
  );

CREATE POLICY "Users can delete employee permissions from their stores" ON employee_permissions
  FOR DELETE USING (
    employee_id IN (
      SELECT uid FROM employees WHERE store_id IN (
        SELECT store_id FROM employees WHERE uid = auth.uid()
      )
    ) OR
    auth.jwt()->>'role' = 'admin'
  ); 