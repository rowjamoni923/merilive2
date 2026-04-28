
-- Alias wrapper: current_admin_id() → current_admin_id_from_header()
-- Several admin RPCs (rotate secret token, set vault PIN) call current_admin_id()
-- which was never created.