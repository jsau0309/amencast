-- supabase/migrations/20250511014500_rls_for_transcripts_table.sql

-- Enable Row Level Security for the transcripts table
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;

-- Policy: Listeners can select transcripts related to their own streams
CREATE POLICY "Listeners can select transcripts for their own streams"
ON public.transcripts FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.streams s
    WHERE s.id = transcripts.stream_id AND s.listener_id = auth.uid()::text
  )
);

-- Note: No explicit INSERT, UPDATE, or DELETE policies for listeners are added.
-- These operations are intended for service roles or backend processes.
-- Service roles will bypass RLS by default. 