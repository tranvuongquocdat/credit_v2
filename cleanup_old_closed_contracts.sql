-- SQL Script to Clean Up Old Closed Contracts
-- This script will:
-- 1. Query all installments, pawns and credits that are closed and created at least 400 days ago
-- 2. Delete all of their histories
-- 3. Delete the contracts themselves

-- Set the date threshold (400 days ago from today)
DO $$
DECLARE
    threshold_date DATE := CURRENT_DATE - INTERVAL '400 days';
    credit_count INTEGER;
    pawn_count INTEGER;
    installment_count INTEGER;
    credit_history_count INTEGER;
    pawn_history_count INTEGER;
    installment_history_count INTEGER;
BEGIN
    -- Display the threshold date for reference
    RAISE NOTICE 'Cleanup threshold date: %', threshold_date;
    RAISE NOTICE 'Current date: %', CURRENT_DATE;
    RAISE NOTICE '=====================================';

    -- First, let's query and count the records that will be affected
    RAISE NOTICE 'QUERYING RECORDS TO BE DELETED:';
    RAISE NOTICE '=====================================';

    -- Count closed credits older than 400 days
    SELECT COUNT(*) INTO credit_count
    FROM credits
    WHERE status = 'closed' 
    AND loan_date::DATE <= threshold_date;
    
    RAISE NOTICE 'Closed credits older than 400 days: %', credit_count;

    -- Count closed pawns older than 400 days
    SELECT COUNT(*) INTO pawn_count
    FROM pawns
    WHERE status = 'closed' 
    AND loan_date::DATE <= threshold_date;
    
    RAISE NOTICE 'Closed pawns older than 400 days: %', pawn_count;

    -- Count closed installments older than 400 days
    SELECT COUNT(*) INTO installment_count
    FROM installments
    WHERE status = 'closed' 
    AND loan_date::DATE <= threshold_date;
    
    RAISE NOTICE 'Closed installments older than 400 days: %', installment_count;

    -- Count related history records
    SELECT COUNT(*) INTO credit_history_count
    FROM credit_history ch
    WHERE ch.credit_id IN (
        SELECT id FROM credits 
        WHERE status = 'closed' 
        AND loan_date::DATE <= threshold_date
    );
    
    RAISE NOTICE 'Credit history records to be deleted: %', credit_history_count;

    SELECT COUNT(*) INTO pawn_history_count
    FROM pawn_history ph
    WHERE ph.pawn_id IN (
        SELECT id FROM pawns 
        WHERE status = 'closed' 
        AND loan_date::DATE <= threshold_date
    );
    
    RAISE NOTICE 'Pawn history records to be deleted: %', pawn_history_count;

    SELECT COUNT(*) INTO installment_history_count
    FROM installment_history ih
    WHERE ih.installment_id IN (
        SELECT id FROM installments 
        WHERE status = 'closed' 
        AND loan_date::DATE <= threshold_date
    );
    
    RAISE NOTICE 'Installment history records to be deleted: %', installment_history_count;

    RAISE NOTICE '=====================================';
    RAISE NOTICE 'Total contracts to be deleted: %', credit_count + pawn_count + installment_count;
    RAISE NOTICE 'Total history records to be deleted: %', credit_history_count + pawn_history_count + installment_history_count;
    RAISE NOTICE '=====================================';

    -- Uncomment the following sections to actually perform the deletions
    -- WARNING: This will permanently delete data. Make sure you have backups!
    
    /*
    RAISE NOTICE 'STARTING DELETION PROCESS:';
    RAISE NOTICE '=====================================';

    -- Delete credit history records first (to maintain referential integrity)
    RAISE NOTICE 'Deleting credit history records...';
    DELETE FROM credit_history 
    WHERE credit_id IN (
        SELECT id FROM credits 
        WHERE status = 'closed' 
        AND loan_date::DATE <= threshold_date
    );
    GET DIAGNOSTICS credit_history_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % credit history records', credit_history_count;

    -- Delete pawn history records
    RAISE NOTICE 'Deleting pawn history records...';
    DELETE FROM pawn_history 
    WHERE pawn_id IN (
        SELECT id FROM pawns 
        WHERE status = 'closed' 
        AND loan_date::DATE <= threshold_date
    );
    GET DIAGNOSTICS pawn_history_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % pawn history records', pawn_history_count;

    -- Delete installment history records
    RAISE NOTICE 'Deleting installment history records...';
    DELETE FROM installment_history 
    WHERE installment_id IN (
        SELECT id FROM installments 
        WHERE status = 'closed' 
        AND loan_date::DATE <= threshold_date
    );
    GET DIAGNOSTICS installment_history_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % installment history records', installment_history_count;

    -- Delete other related tables if they exist
    -- Delete pawn payment periods
    RAISE NOTICE 'Deleting pawn payment periods...';
    DELETE FROM pawn_payment_periods 
    WHERE pawn_id IN (
        SELECT id FROM pawns 
        WHERE status = 'closed' 
        AND loan_date::DATE <= threshold_date
    );

    -- Delete pawn principal repayments
    RAISE NOTICE 'Deleting pawn principal repayments...';
    DELETE FROM pawn_principal_repayments 
    WHERE pawn_id IN (
        SELECT id FROM pawns 
        WHERE status = 'closed' 
        AND loan_date::DATE <= threshold_date
    );

    -- Delete credit payment periods if the table exists
    RAISE NOTICE 'Deleting credit payment periods...';
    DELETE FROM credit_payment_periods 
    WHERE credit_id IN (
        SELECT id FROM credits 
        WHERE status = 'closed' 
        AND loan_date::DATE <= threshold_date
    );

    -- Delete installment payment periods if the table exists
    RAISE NOTICE 'Deleting installment payment periods...';
    DELETE FROM installment_payment_period 
    WHERE installment_id IN (
        SELECT id FROM installments 
        WHERE status = 'closed' 
        AND loan_date::DATE <= threshold_date
    );

    -- Now delete the main contract records
    RAISE NOTICE 'Deleting closed credits...';
    DELETE FROM credits 
    WHERE status = 'closed' 
    AND loan_date::DATE <= threshold_date;
    GET DIAGNOSTICS credit_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % credit contracts', credit_count;

    RAISE NOTICE 'Deleting closed pawns...';
    DELETE FROM pawns 
    WHERE status = 'closed' 
    AND loan_date::DATE <= threshold_date;
    GET DIAGNOSTICS pawn_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % pawn contracts', pawn_count;

    RAISE NOTICE 'Deleting closed installments...';
    DELETE FROM installments 
    WHERE status = 'closed' 
    AND loan_date::DATE <= threshold_date;
    GET DIAGNOSTICS installment_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % installment contracts', installment_count;

    RAISE NOTICE '=====================================';
    RAISE NOTICE 'CLEANUP COMPLETED SUCCESSFULLY!';
    RAISE NOTICE 'Total contracts deleted: %', credit_count + pawn_count + installment_count;
    RAISE NOTICE '=====================================';
    */

END $$;

-- Alternative approach: Create a view to see the records before deletion
CREATE OR REPLACE VIEW old_closed_contracts_to_delete AS
SELECT 
    'credit' as contract_type,
    id,
    contract_code,
    loan_amount,
    loan_date,
    status,
    (CURRENT_DATE - loan_date::DATE) as days_old
FROM credits
WHERE status = 'closed' 
AND loan_date::DATE <= CURRENT_DATE - INTERVAL '400 days'

UNION ALL

SELECT 
    'pawn' as contract_type,
    id,
    contract_code,
    loan_amount,
    loan_date,
    status,
    (CURRENT_DATE - loan_date::DATE) as days_old
FROM pawns
WHERE status = 'closed' 
AND loan_date::DATE <= CURRENT_DATE - INTERVAL '400 days'

UNION ALL

SELECT 
    'installment' as contract_type,
    id,
    contract_code,
    installment_amount as loan_amount,
    loan_date,
    status,
    (CURRENT_DATE - loan_date::DATE) as days_old
FROM installments
WHERE status = 'closed' 
AND loan_date::DATE <= CURRENT_DATE - INTERVAL '400 days'

ORDER BY loan_date;

-- Query to see the contracts that will be deleted
SELECT 
    contract_type,
    COUNT(*) as count,
    MIN(days_old) as min_days_old,
    MAX(days_old) as max_days_old,
    SUM(loan_amount) as total_amount
FROM old_closed_contracts_to_delete
GROUP BY contract_type
ORDER BY contract_type; 