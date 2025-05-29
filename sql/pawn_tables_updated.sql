-- Enum for pawn status
CREATE TYPE pawn_status AS ENUM (
  'on_time',
  'overdue',
  'late_interest',
  'bad_debt',
  'closed',
  'deleted'
);

-- Pawn transaction type for history
CREATE TYPE pawn_transaction_type AS ENUM (
  'payment',
  'new_loan',
  'principal_repayment',
  'contract_close',
  'contract_rotation',
  'other'
);

-- Main pawn table (đã bỏ phone, address, id_number)
CREATE TABLE IF NOT EXISTS pawns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  contract_code TEXT,
  loan_amount NUMERIC NOT NULL,
  loan_date TIMESTAMP WITH TIME ZONE NOT NULL,
  loan_period INTEGER NOT NULL,
  interest_type interest_type NOT NULL,
  interest_value NUMERIC NOT NULL,
  interest_ui_type TEXT,
  interest_notation TEXT,
  interest_period INTEGER NOT NULL,
  collateral_id UUID NOT NULL REFERENCES collaterals(id),
  collateral_detail TEXT,
  status pawn_status DEFAULT 'on_time',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pawn payment periods table
CREATE TABLE IF NOT EXISTS pawn_payment_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pawn_id UUID NOT NULL REFERENCES pawns(id),
  period_number INTEGER NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  expected_amount NUMERIC NOT NULL,
  actual_amount NUMERIC DEFAULT 0,
  other_amount NUMERIC,
  payment_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pawn amount history table (đã thay đổi amount thành debit_amount/credit_amount, thêm employee_id)
CREATE TABLE IF NOT EXISTS pawn_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pawn_id UUID NOT NULL REFERENCES pawns(id),
  transaction_type pawn_transaction_type NOT NULL,
  debit_amount NUMERIC DEFAULT 0,
  credit_amount NUMERIC DEFAULT 0,
  previous_loan_amount NUMERIC NOT NULL,
  new_loan_amount NUMERIC NOT NULL,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  employee_id UUID REFERENCES employees(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pawn principal repayment table
CREATE TABLE IF NOT EXISTS pawn_principal_repayments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pawn_id UUID NOT NULL REFERENCES pawns(id),
  amount NUMERIC NOT NULL,
  repayment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pawns_customer_id ON pawns(customer_id);
CREATE INDEX IF NOT EXISTS idx_pawns_store_id ON pawns(store_id);
CREATE INDEX IF NOT EXISTS idx_pawns_collateral_id ON pawns(collateral_id);
CREATE INDEX IF NOT EXISTS idx_pawns_status ON pawns(status);
CREATE INDEX IF NOT EXISTS idx_pawns_contract_code ON pawns(contract_code);
CREATE INDEX IF NOT EXISTS idx_pawn_payment_periods_pawn_id ON pawn_payment_periods(pawn_id);
CREATE INDEX IF NOT EXISTS idx_pawn_history_pawn_id ON pawn_history(pawn_id);
CREATE INDEX IF NOT EXISTS idx_pawn_history_employee_id ON pawn_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_pawn_principal_repayments_pawn_id ON pawn_principal_repayments(pawn_id);

-- Enable RLS (Row Level Security)
ALTER TABLE pawns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pawn_payment_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE pawn_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pawn_principal_repayments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for pawns table
CREATE POLICY "Users can view pawns from their stores" ON pawns
  FOR SELECT USING (
    store_id IN (
      SELECT store_id FROM employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert pawns to their stores" ON pawns
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT store_id FROM employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update pawns from their stores" ON pawns
  FOR UPDATE USING (
    store_id IN (
      SELECT store_id FROM employees WHERE user_id = auth.uid()
    )
  );

-- Create RLS policies for pawn_payment_periods table
CREATE POLICY "Users can view pawn payment periods from their stores" ON pawn_payment_periods
  FOR SELECT USING (
    pawn_id IN (
      SELECT id FROM pawns WHERE store_id IN (
        SELECT store_id FROM employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert pawn payment periods to their stores" ON pawn_payment_periods
  FOR INSERT WITH CHECK (
    pawn_id IN (
      SELECT id FROM pawns WHERE store_id IN (
        SELECT store_id FROM employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update pawn payment periods from their stores" ON pawn_payment_periods
  FOR UPDATE USING (
    pawn_id IN (
      SELECT id FROM pawns WHERE store_id IN (
        SELECT store_id FROM employees WHERE user_id = auth.uid()
      )
    )
  );

-- Create RLS policies for pawn_history table
CREATE POLICY "Users can view pawn amount history from their stores" ON pawn_history
  FOR SELECT USING (
    pawn_id IN (
      SELECT id FROM pawns WHERE store_id IN (
        SELECT store_id FROM employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert pawn amount history to their stores" ON pawn_history
  FOR INSERT WITH CHECK (
    pawn_id IN (
      SELECT id FROM pawns WHERE store_id IN (
        SELECT store_id FROM employees WHERE user_id = auth.uid()
      )
    )
  );

-- Create RLS policies for pawn_principal_repayments table
CREATE POLICY "Users can view pawn principal repayments from their stores" ON pawn_principal_repayments
  FOR SELECT USING (
    pawn_id IN (
      SELECT id FROM pawns WHERE store_id IN (
        SELECT store_id FROM employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert pawn principal repayments to their stores" ON pawn_principal_repayments
  FOR INSERT WITH CHECK (
    pawn_id IN (
      SELECT id FROM pawns WHERE store_id IN (
        SELECT store_id FROM employees WHERE user_id = auth.uid()
      )
    )
  );

-- Create triggers for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pawns_updated_at BEFORE UPDATE ON pawns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pawn_payment_periods_updated_at BEFORE UPDATE ON pawn_payment_periods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pawn_history_updated_at BEFORE UPDATE ON pawn_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pawn_principal_repayments_updated_at BEFORE UPDATE ON pawn_principal_repayments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 