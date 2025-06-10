export enum AdminStatus {
  ACTIVE = "active",
  INACTIVE = "inactive"
}

// Database model - maps directly to the profiles table
export interface AdminDB {
  id: string;
  username: string;
  email?: string | null;
  full_name?: string | null;
  role: 'admin' | 'superadmin';
  is_banned?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

// UI model - what's used in the UI
export interface Admin {
  id: string;
  username: string;
  email?: string;
  full_name?: string;
  role: 'admin' | 'superadmin';
  status: AdminStatus;
  created_at?: string;
  updated_at?: string;
}

export interface AdminWithProfile extends Admin {
  // Additional profile information if needed
}

// Interface for creating a new admin
export interface CreateAdminParams {
  username: string;
  email?: string;
  password: string;
  status?: AdminStatus;
}

// Interface for updating admin
export interface UpdateAdminParams {
  username?: string;
  email?: string;
  status?: AdminStatus;
}

export interface AdminFormData {
  username: string;
  email?: string;
  password?: string;
  status: AdminStatus;
} 