-- supabase/migrations/20250511015000_rls_for_bible_es_table.sql

-- Enable Row Level Security for the bible_es table
ALTER TABLE public.bible_es ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can select from the bible_es table
-- This table contains public Bible text.
CREATE POLICY "Authenticated users can select Bible text"
ON public.bible_es FOR SELECT
TO authenticated; -- Supabase specific role for any authenticated user

-- Note: No explicit INSERT, UPDATE, or DELETE policies for general users are added.
-- This table is considered read-only for application users.
-- Data loading/management should be done via service roles.
-- Service roles will bypass RLS by default. 