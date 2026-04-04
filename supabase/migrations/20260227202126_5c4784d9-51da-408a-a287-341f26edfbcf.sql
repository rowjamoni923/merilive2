-- Grant necessary permissions on agencies table for authenticated users
GRANT SELECT, INSERT, UPDATE ON public.agencies TO authenticated;

-- Also grant SELECT for anon role (for public agency info viewing)
GRANT SELECT ON public.agencies TO anon;