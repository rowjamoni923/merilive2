
-- Fix negative beans_balance in agencies table
UPDATE agencies 
SET beans_balance = 0
WHERE beans_balance < 0;

-- Add a constraint to prevent negative beans_balance in future
-- But first, let's create a trigger to prevent negative values
CREATE OR REPLACE FUNCTION prevent_negative_agency_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure beans_balance never goes negative
  IF NEW.beans_balance < 0 THEN
    NEW.beans_balance := 0;
  END IF;
  
  -- Ensure diamond_balance never goes negative
  IF NEW.diamond_balance < 0 THEN
    NEW.diamond_balance := 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_prevent_negative_agency_balance ON agencies;

-- Create the trigger
CREATE TRIGGER trigger_prevent_negative_agency_balance
  BEFORE INSERT OR UPDATE ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION prevent_negative_agency_balance();
