-- Grant table-level permissions for agencies table
GRANT SELECT ON public.agencies TO authenticated;
GRANT INSERT ON public.agencies TO authenticated;
GRANT UPDATE ON public.agencies TO authenticated;
GRANT SELECT ON public.agencies TO anon;