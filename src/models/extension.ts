export interface Extension {
  id?: string;
  credit_id: string;
  days: number;
  extension_date: string;
  notes?: string | null;
  from_date?: string;
  to_date?: string;
  created_at?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
}
