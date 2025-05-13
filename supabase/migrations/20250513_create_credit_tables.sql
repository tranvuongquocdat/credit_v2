-- Tạo bảng Khách hàng (customers)
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id),
  phone TEXT,
  address TEXT,
  id_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- Tạo enum cho kiểu hình thức lãi
CREATE TYPE public.interest_type AS ENUM ('percentage', 'fixed_amount');

-- Tạo enum cho trạng thái hợp đồng
CREATE TYPE public.credit_status AS ENUM ('on_time', 'overdue', 'late_interest', 'bad_debt', 'closed', 'deleted');

-- Tạo bảng Hợp đồng tín chấp (credits)
CREATE TABLE IF NOT EXISTS public.credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  customer_id UUID REFERENCES public.customers(id) NOT NULL,
  contract_code TEXT,
  id_number TEXT,
  phone TEXT,
  address TEXT,
  collateral TEXT,
  loan_amount NUMERIC NOT NULL,
  interest_type public.interest_type NOT NULL,
  interest_value NUMERIC NOT NULL,
  loan_period INTEGER NOT NULL, -- Số ngày vay
  interest_period INTEGER NOT NULL, -- Kỳ lãi phí
  loan_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  status public.credit_status DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- Index cho các truy vấn phổ biến
CREATE INDEX IF NOT EXISTS idx_credits_store_id ON public.credits(store_id);
CREATE INDEX IF NOT EXISTS idx_credits_customer_id ON public.credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_credits_status ON public.credits(status);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers(store_id);
