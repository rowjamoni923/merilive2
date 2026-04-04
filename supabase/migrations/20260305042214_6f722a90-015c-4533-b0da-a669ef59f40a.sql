SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = current_database() 
AND pid != pg_backend_pid() 
AND state = 'idle' 
AND query LIKE '%private_calls%';