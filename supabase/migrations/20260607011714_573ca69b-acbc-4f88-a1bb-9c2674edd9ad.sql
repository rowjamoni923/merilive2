
-- Phase 6 / K1: drop legacy over-broad helper upload policy on payment-proofs.
-- All helper code paths use {auth.uid()}/... prefix, covered by
-- "User can upload own payment proof" + "private_media_owner_insert_scoped".
DROP POLICY IF EXISTS "Helpers can upload payment proofs" ON storage.objects;
