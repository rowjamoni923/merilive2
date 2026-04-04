-- Migrate existing wallet_balance data to beans_balance for agencies
-- wallet_balance will now be used for diamond wallet (from traders)
-- beans_balance is for agency's own beans (exchangeable)
UPDATE public.agencies 
SET beans_balance = wallet_balance,
    wallet_balance = 0
WHERE wallet_balance > 0 AND beans_balance = 0;