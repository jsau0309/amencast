-- supabase/migrations/20250511013000_rls_for_streams_table.sql

-- Enable Row Level Security for the streams table
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;

-- Policy: Listeners can select their own streams
CREATE POLICY "Listeners can select their own streams"
ON public.streams FOR SELECT
USING (auth.uid()::text = listener_id);

-- Policy: Listeners can insert new streams for themselves
CREATE POLICY "Listeners can insert new streams for themselves"
ON public.streams FOR INSERT
WITH CHECK (auth.uid()::text = listener_id);

-- Policy: Listeners can update specific fields of their own streams
-- For now, let's assume they can update status and ended_at
CREATE POLICY "Listeners can update their own streams"
ON public.streams FOR UPDATE
USING (auth.uid()::text = listener_id)
WITH CHECK (auth.uid()::text = listener_id); -- The WITH CHECK clause applies to the new row data after the update

-- Note: No explicit DELETE policy for listeners is added for now.
-- Service roles (like the one Prisma uses via directUrl) will bypass RLS by default. 