-- Thêm value 'update_contract' vào enum pawn_transaction_type để đồng bộ với credit_transaction_type.
-- Bug cũ: updatePawn() trong src/lib/pawn.ts insert history với transaction_type='update_contract'
-- nhưng enum DB không có value này → insert fail âm thầm (error bị ignore).
ALTER TYPE public.pawn_transaction_type ADD VALUE IF NOT EXISTS 'update_contract';
