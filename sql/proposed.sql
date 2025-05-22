-- Bật extension uuid-ossp nếu chưa được bật
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tạo enum types cần thiết
CREATE TYPE credit_status AS ENUM ('on_time', 'overdue', 'late_interest', 'bad_debt', 'closed', 'deleted');
CREATE TYPE credit_transaction_type AS ENUM ('principal_repayment', 'additional_loan', 'initial_loan');
CREATE TYPE installment_payment_status AS ENUM ('pending', 'paid', 'partial', 'overdue', 'cancelled');
CREATE TYPE installment_status AS ENUM ('on_time', 'overdue', 'late_interest', 'bad_debt', 'closed', 'deleted', 'finished');
CREATE TYPE interest_type AS ENUM ('percentage', 'fixed_amount');
CREATE TYPE payment_period_status AS ENUM ('pending', 'paid', 'overdue', 'partially_paid');

-- Main users table for authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'employee')),
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User profiles with basic info
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  is_banned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stores table
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT CHECK (status IN ('active', 'inactive', 'deleted')) DEFAULT 'active',
  cash_fund NUMERIC DEFAULT 0,
  investment NUMERIC DEFAULT 0,
  admin_id UUID NOT NULL REFERENCES users(id),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT admin_role_check CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = admin_id AND role = 'admin')
  )
);

-- Employees table
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permissions table
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

-- Employee permissions
CREATE TABLE employee_permissions (
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (employee_id, permission_id)
);

-- Customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  id_number TEXT,
  phone TEXT,
  store_id UUID REFERENCES stores(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credits table
CREATE TABLE credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  contract_code TEXT,
  loan_amount NUMERIC NOT NULL,
  loan_date TIMESTAMP WITH TIME ZONE NOT NULL,
  loan_period INTEGER NOT NULL,
  interest_type interest_type NOT NULL,
  interest_value NUMERIC NOT NULL,
  interest_period INTEGER NOT NULL,
  phone TEXT,
  address TEXT,
  id_number TEXT,
  collateral TEXT,
  document TEXT,
  status credit_status DEFAULT 'on_time',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credit payment periods table
CREATE TABLE credit_payment_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_id UUID NOT NULL REFERENCES credits(id),
  period_number INTEGER NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  expected_amount NUMERIC NOT NULL,
  actual_amount NUMERIC DEFAULT 0,
  other_amount NUMERIC,
  payment_date TIMESTAMP WITH TIME ZONE,
  status payment_period_status DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credit amount history table
CREATE TABLE credit_amount_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_id UUID NOT NULL REFERENCES credits(id),
  transaction_type credit_transaction_type NOT NULL,
  amount NUMERIC NOT NULL,
  previous_loan_amount NUMERIC NOT NULL,
  new_loan_amount NUMERIC NOT NULL,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credit extension histories table
CREATE TABLE credit_extension_histories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_id UUID NOT NULL REFERENCES credits(id),
  from_date TIMESTAMP WITH TIME ZONE NOT NULL,
  to_date TIMESTAMP WITH TIME ZONE NOT NULL,
  days INTEGER NOT NULL,
  extension_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Installments table
CREATE TABLE installments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  contract_code TEXT,
  installment_amount NUMERIC NOT NULL,
  down_payment NUMERIC NOT NULL,
  loan_date TIMESTAMP WITH TIME ZONE NOT NULL,
  loan_period INTEGER NOT NULL,
  payment_period INTEGER NOT NULL,
  status installment_status DEFAULT 'on_time',
  document TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Installment payment period table
CREATE TABLE installment_payment_period (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  installment_id UUID NOT NULL REFERENCES installments(id),
  period_number INTEGER NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  expected_amount NUMERIC NOT NULL,
  actual_amount NUMERIC,
  payment_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Installment amount history table
CREATE TABLE installment_amount_history (
  id SERIAL PRIMARY KEY,
  installment_id UUID NOT NULL REFERENCES installments(id),
  transaction_type TEXT NOT NULL,
  debit_amount NUMERIC,
  credit_amount NUMERIC,
  employee_id UUID REFERENCES employees(id),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Store fund history table
CREATE TABLE store_fund_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id),
  fund_amount NUMERIC NOT NULL,
  transaction_type TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- View for installments by store
CREATE OR REPLACE VIEW installments_by_store AS
SELECT 
  i.*,
  e.store_id
FROM 
  installments i
JOIN 
  employees e ON i.employee_id = e.id;

-- Các functions
CREATE OR REPLACE FUNCTION calculate_credit_end_date(loan_date TIMESTAMP WITH TIME ZONE, loan_period INTEGER)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
  RETURN loan_date + (loan_period * INTERVAL '1 day');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_additional_loan(
  p_credit_id UUID,
  p_additional_amount NUMERIC,
  p_transaction_date TIMESTAMP WITH TIME ZONE,
  p_notes TEXT
)
RETURNS UUID AS $$
DECLARE
  v_previous_amount NUMERIC;
  v_new_amount NUMERIC;
  v_history_id UUID;
BEGIN
  -- Get current loan amount
  SELECT loan_amount INTO v_previous_amount FROM credits WHERE id = p_credit_id;
  
  -- Calculate new amount
  v_new_amount := v_previous_amount + p_additional_amount;
  
  -- Update credit with new amount
  UPDATE credits SET loan_amount = v_new_amount, updated_at = NOW() WHERE id = p_credit_id;
  
  -- Record history
  INSERT INTO credit_amount_history (
    credit_id, transaction_type, amount, previous_loan_amount, new_loan_amount, 
    transaction_date, notes, created_at, updated_at
  ) VALUES (
    p_credit_id, 'additional_loan', p_additional_amount, v_previous_amount, v_new_amount,
    p_transaction_date, p_notes, NOW(), NOW()
  ) RETURNING id INTO v_history_id;
  
  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_principal_repayment(
  p_credit_id UUID,
  p_repayment_amount NUMERIC,
  p_transaction_date TIMESTAMP WITH TIME ZONE,
  p_notes TEXT
)
RETURNS UUID AS $$
DECLARE
  v_previous_amount NUMERIC;
  v_new_amount NUMERIC;
  v_history_id UUID;
BEGIN
  -- Get current loan amount
  SELECT loan_amount INTO v_previous_amount FROM credits WHERE id = p_credit_id;
  
  -- Calculate new amount
  v_new_amount := v_previous_amount - p_repayment_amount;
  IF v_new_amount < 0 THEN
    v_new_amount := 0;
  END IF;
  
  -- Update credit with new amount
  UPDATE credits SET loan_amount = v_new_amount, updated_at = NOW() WHERE id = p_credit_id;
  
  -- Record history
  INSERT INTO credit_amount_history (
    credit_id, transaction_type, amount, previous_loan_amount, new_loan_amount, 
    transaction_date, notes, created_at, updated_at
  ) VALUES (
    p_credit_id, 'principal_repayment', p_repayment_amount, v_previous_amount, v_new_amount,
    p_transaction_date, p_notes, NOW(), NOW()
  ) RETURNING id INTO v_history_id;
  
  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recreate_payment_periods(credit_id_param UUID, periods_param JSONB)
RETURNS JSONB AS $$
BEGIN
  -- Delete existing periods
  DELETE FROM credit_payment_periods WHERE credit_id = credit_id_param;
  
  -- Insert new periods from JSON
  INSERT INTO credit_payment_periods (
    credit_id, period_number, start_date, end_date, expected_amount, 
    status, created_at, updated_at
  )
  SELECT 
    credit_id_param,
    (p->>'period_number')::INTEGER,
    (p->>'start_date')::TIMESTAMP WITH TIME ZONE,
    (p->>'end_date')::TIMESTAMP WITH TIME ZONE,
    (p->>'expected_amount')::NUMERIC,
    'pending'::payment_period_status,
    NOW(),
    NOW()
  FROM jsonb_array_elements(periods_param) AS p;
  
  RETURN periods_param;
END;
$$ LANGUAGE plpgsql;