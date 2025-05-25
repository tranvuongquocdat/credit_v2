-- Enum for pawn status
CREATE TYPE pawn_status AS ENUM (
  'on_time',
  'overdue',
  'late_interest',
  'bad_debt',
  'closed',
  'deleted'
);

-- Enum for interest type (shared with credits)
-- CREATE TYPE interest_type AS ENUM (
--   'percentage',
--   'fixed_amount'
-- );

-- Pawn transaction type for history
CREATE TYPE pawn_transaction_type AS ENUM (
  'payment',
  'new_loan',
  'principal_repayment',
  'contract_close',
  'contract_rotation',
  'other'
);

-- Main pawn table
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
  interest_period INTEGER NOT NULL,
  phone TEXT,
  address TEXT,
  id_number TEXT,
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

-- Pawn amount history table
CREATE TABLE IF NOT EXISTS pawn_amount_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pawn_id UUID NOT NULL REFERENCES pawns(id),
  transaction_type pawn_transaction_type NOT NULL,
  amount NUMERIC NOT NULL,
  previous_loan_amount NUMERIC NOT NULL,
  new_loan_amount NUMERIC NOT NULL,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
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
CREATE INDEX IF NOT EXISTS idx_pawn_amount_history_pawn_id ON pawn_amount_history(pawn_id);
CREATE INDEX IF NOT EXISTS idx_pawn_principal_repayments_pawn_id ON pawn_principal_repayments(pawn_id); 