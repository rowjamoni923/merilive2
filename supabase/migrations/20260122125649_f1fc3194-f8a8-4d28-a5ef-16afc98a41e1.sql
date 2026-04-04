-- Temporarily disable foreign key checks and delete demo profiles
-- Keep only: Rj guru ganecy (ab155d31-96d4-4a42-855d-b2c090ba0339) and Babu (ac7fd915-c718-4c74-884f-ef49b03f1ba9)

-- Set session to disable FK checks
SET session_replication_role = replica;

-- Delete all profiles except the two we want to keep
DELETE FROM profiles 
WHERE id NOT IN ('ab155d31-96d4-4a42-855d-b2c090ba0339', 'ac7fd915-c718-4c74-884f-ef49b03f1ba9');

-- Re-enable FK checks
SET session_replication_role = DEFAULT;