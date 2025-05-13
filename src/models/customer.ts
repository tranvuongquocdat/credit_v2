export enum CustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

export interface Customer {
  id: string;
  name: string;
  store_id: string | null;
  phone?: string | null;
  address?: string | null;
  id_number?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CreateCustomerParams {
  name: string;
  store_id?: string | null;
  phone?: string | null;
  address?: string | null;
  id_number?: string | null;
}

export interface UpdateCustomerParams {
  name?: string;
  store_id?: string | null;
  phone?: string | null;
  address?: string | null;
  id_number?: string | null;
}
