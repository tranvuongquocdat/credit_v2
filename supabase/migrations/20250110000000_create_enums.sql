-- Create all necessary enum types
CREATE TYPE IF NOT EXISTS interest_type AS ENUM ('percentage', 'fixed_amount');
CREATE TYPE IF NOT EXISTS credit_status AS ENUM ('on_time', 'overdue', 'late_interest', 'bad_debt', 'closed', 'deleted');
CREATE TYPE IF NOT EXISTS credit_transaction_type AS ENUM (
  'principal_repayment', 
  'additional_loan', 
  'initial_loan',
  'payment',
  'payment_cancel',
  'contract_close',
  'contract_reopen',
  'cancel_additional_loan',
  'cancel_principal_repayment',
  'contract_delete'
);
CREATE TYPE IF NOT EXISTS pawn_status AS ENUM ('on_time', 'overdue', 'late_interest', 'bad_debt', 'closed', 'deleted');
CREATE TYPE IF NOT EXISTS pawn_transaction_type AS ENUM (
  'payment',
  'new_loan',
  'initial_loan',
  'additional_loan',
  'principal_repayment',
  'contract_close',
  'contract_rotation',
  'payment_cancel',
  'contract_reopen',
  'cancel_additional_loan',
  'cancel_principal_repayment',
  'other'
);
CREATE TYPE IF NOT EXISTS installment_status AS ENUM ('on_time', 'overdue', 'late_interest', 'bad_debt', 'closed', 'deleted', 'finished');
CREATE TYPE IF NOT EXISTS installment_payment_status AS ENUM ('pending', 'paid', 'partial', 'overdue', 'cancelled');
CREATE TYPE IF NOT EXISTS payment_period_status AS ENUM ('pending', 'paid', 'overdue', 'partially_paid'); 