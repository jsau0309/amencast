-- supabase/migrations/20250511013500_rls_for_feedback_table.sql

-- Enable Row Level Security for the feedback table
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Listeners can insert feedback for their own streams
-- This policy checks if the stream_id in the feedback being inserted
-- corresponds to a stream owned by the authenticated user.
CREATE POLICY "Listeners can insert feedback for their own streams"
ON public.feedback FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.streams s
    WHERE s.id = feedback.stream_id AND s.listener_id = auth.uid()::text
  )
);

-- Policy: Listeners can select feedback related to their own streams
CREATE POLICY "Listeners can select feedback for their own streams"
ON public.feedback FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.streams s
    WHERE s.id = feedback.stream_id AND s.listener_id = auth.uid()::text
  )
);

-- Note: No explicit UPDATE or DELETE policies for listeners are added for now.
-- Service roles will bypass RLS by default. 