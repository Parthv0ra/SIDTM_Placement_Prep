-- Create shortlist_evaluations table
CREATE TABLE IF NOT EXISTS public.shortlist_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain text NOT NULL,
  role text NOT NULL,
  jd_text text NOT NULL,
  resume_id uuid REFERENCES public.resumes(id) ON DELETE SET NULL,
  shortlist_score int NOT NULL,
  status text NOT NULL, -- 'shortlisted', 'borderline', 'not_shortlisted'
  evaluation_verdict text NOT NULL, -- Detailed evaluation reasoning
  missing_skills jsonb NOT NULL, -- array of strings
  matched_skills jsonb NOT NULL, -- array of strings
  suggested_certifications jsonb NOT NULL, -- array of strings
  suggested_courses jsonb NOT NULL, -- array of strings
  action_plan jsonb NOT NULL, -- array of strings
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shortlist_evaluations TO authenticated;
GRANT ALL ON public.shortlist_evaluations TO service_role;

-- Enable RLS
ALTER TABLE public.shortlist_evaluations ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to access their own records
CREATE POLICY "Users can manage own shortlist evaluations" ON public.shortlist_evaluations
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'faculty') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid());
