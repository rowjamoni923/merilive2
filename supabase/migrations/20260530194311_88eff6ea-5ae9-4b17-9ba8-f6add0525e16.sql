UPDATE new_host_live_bonus_settings 
SET eligible_days = 365, eligible_program_days = 365
WHERE is_active = true;