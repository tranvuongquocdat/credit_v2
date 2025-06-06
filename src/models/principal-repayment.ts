export interface PrincipalRepayment {
  id?: string;
  credit_id: string;
  amount: number;
  note?: string;
  created_at?: string;
}

export interface PawnPrincipalRepayment {
  id?: string;
  pawn_id: string;
  amount: number;
  note?: string;
  created_at?: string;
}

