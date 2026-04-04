-- Reset assigned_helper_id for ALL pending withdrawals
-- This allows ALL Level 5 helpers to see and claim them (first-come-first-serve)
UPDATE agency_withdrawals 
SET assigned_helper_id = NULL 
WHERE status = 'pending';