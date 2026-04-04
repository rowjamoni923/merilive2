-- Update the check constraint to include admin_transfer and transfer_to_user
ALTER TABLE helper_transactions
DROP CONSTRAINT IF EXISTS helper_transactions_transaction_type_check;

ALTER TABLE helper_transactions
ADD CONSTRAINT helper_transactions_transaction_type_check
CHECK (transaction_type = ANY (ARRAY['buy_from_platform'::text, 'sell_to_user'::text, 'withdraw'::text, 'admin_transfer'::text, 'transfer_to_user'::text]));