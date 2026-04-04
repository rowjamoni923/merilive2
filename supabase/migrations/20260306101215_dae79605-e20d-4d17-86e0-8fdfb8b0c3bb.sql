-- Sync agency host counts to actual active hosts
UPDATE agencies SET total_hosts = (
  SELECT count(*) FROM agency_hosts 
  WHERE agency_hosts.agency_id = agencies.id AND status = 'active'
);