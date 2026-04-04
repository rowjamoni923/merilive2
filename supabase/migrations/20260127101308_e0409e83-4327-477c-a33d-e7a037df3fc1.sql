-- First change column types to BIGINT for large values
ALTER TABLE agency_level_tiers 
  ALTER COLUMN min_weekly_income TYPE BIGINT,
  ALTER COLUMN max_weekly_income TYPE BIGINT;