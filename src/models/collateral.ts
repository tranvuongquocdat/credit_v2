import { Database } from '@/types/database.types';

export type Collateral = Database['public']['Tables']['collaterals']['Row'];
export type CollateralInsert = Database['public']['Tables']['collaterals']['Insert'];
export type CollateralUpdate = Database['public']['Tables']['collaterals']['Update'];

export interface CollateralWithStore extends Collateral {
  store?: {
    id: string;
    name: string;
  };
}

export const CollateralStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
} as const;

export type CollateralStatusType = typeof CollateralStatus[keyof typeof CollateralStatus];

export const CollateralCategory = {
  PAWN: 'pawn',
  UNSECURED: 'unsecured'
} as const;

export type CollateralCategoryType = typeof CollateralCategory[keyof typeof CollateralCategory];

export const InterestType = {
  PER_MILLION: 'per_million',
  TOTAL: 'total'
} as const;

export type InterestTypeType = typeof InterestType[keyof typeof InterestType]; 