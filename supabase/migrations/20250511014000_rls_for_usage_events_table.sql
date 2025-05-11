-- supabase/migrations/20250511014000_rls_for_usage_events_table.sql

-- Enable Row Level Security for the usage_events table
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- No explicit policies for general authenticated users are added.
-- This table is intended to be accessed via service roles or backend processes only.
-- Operations (SELECT, INSERT, UPDATE, DELETE) by general users will be denied by default
-- because RLS is enabled and there are no permissive policies for them.
-- Service roles will bypass RLS. 