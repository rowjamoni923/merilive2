-- Delete fake Google Play purchases from blocked user "alex"
DELETE FROM recharge_transactions 
WHERE user_id = 'b65b1ddd-9bac-40f2-bead-979917bbd981' 
AND payment_method = 'google_play';
