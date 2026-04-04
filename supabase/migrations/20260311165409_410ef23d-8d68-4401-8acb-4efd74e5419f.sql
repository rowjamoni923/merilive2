-- Deactivate legacy bKash and Nagad entries for Bangladesh that are still active
UPDATE helper_payment_methods 
SET is_active = false 
WHERE id IN ('1ada330b-50f5-4fdd-8922-4bbb61720120', 'de1e8fdc-bf51-4559-893a-3858efb21d7c');