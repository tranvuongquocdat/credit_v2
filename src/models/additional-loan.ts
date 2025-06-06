export interface AdditionalLoan {
  id?: string;
  credit_id: string;
  amount: number;
  note?: string;
  created_at?: string;
}

export interface PawnAdditionalLoan {
  id?: string;
  pawn_id: string;
  amount: number;
  note?: string;
  created_at?: string;
}