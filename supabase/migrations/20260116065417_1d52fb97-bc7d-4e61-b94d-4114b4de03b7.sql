
-- Sync wallet_balance with beans_balance for agencies where wallet_balance is 0 but beans_balance has value
UPDATE agencies 
SET wallet_balance = beans_balance 
WHERE wallet_balance = 0 AND beans_balance > 0;

-- Enable realtime for agencies and profiles tables
ALTER TABLE agencies REPLICA IDENTITY FULL;
ALTER TABLE profiles REPLICA IDENTITY FULL;
ALTER TABLE agency_earnings_transfers REPLICA IDENTITY FULL;
