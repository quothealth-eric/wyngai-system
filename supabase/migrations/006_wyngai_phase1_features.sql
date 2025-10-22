-- WyngAI Phase 1 Features Database Schema
-- Features 1,2,4,5,6,7: Explainer Lite, Coverage Wizard, Policy Pulse, Network Finder, Appeal Studio 2.0, MyWyng Locker

-- 1) Explainer Lite snapshots (short-lived, anonymous allowed)
CREATE TABLE IF NOT EXISTS public.explainer_lite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid,
  case_id uuid, -- nullable; may not create a case for lite
  input_mode text CHECK (input_mode IN ('text','image','pdf')),
  raw_input text,             -- for text mode, else null
  storage_path text,          -- for image/pdf mode, else null
  bullets jsonb,              -- [{title,text}], 3 bullet response
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_explainer_lite_thread_id ON public.explainer_lite(thread_id);
CREATE INDEX IF NOT EXISTS idx_explainer_lite_created_at ON public.explainer_lite(created_at);

-- 2) Coverage Wizard sessions (store user answers to show continuity)
CREATE TABLE IF NOT EXISTS public.coverage_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  state text,
  current_coverage text,        -- employer|marketplace|medicaid|medicare|cobra|none
  household jsonb,              -- {spouse:boolean, children:int}
  qualifying_event text,        -- loss|move|birth|marriage|none|unknown
  marketplace_type text,        -- healthcare.gov|state-based|unknown
  plan_inputs jsonb,            -- optional benefit math capture
  result jsonb,                 -- stored normalized decision result
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coverage_sessions_thread_id ON public.coverage_sessions(thread_id);
CREATE INDEX IF NOT EXISTS idx_coverage_sessions_updated_at ON public.coverage_sessions(updated_at);

-- 3) Policy Pulse (newsfeed)
CREATE TABLE IF NOT EXISTS public.policy_pulse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority text,               -- Federal|CMS|StateDOI|Marketplace|Payer
  jurisdiction text,            -- e.g., 'US' or 'FL'
  title text,
  summary text,                 -- what it means in plain language
  action_items jsonb,           -- ["If you are <X>, do <Y>"]
  source_url text,
  effective_date date,
  retrieved_at timestamptz DEFAULT now(),
  pinned boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_policy_pulse_authority ON public.policy_pulse(authority);
CREATE INDEX IF NOT EXISTS idx_policy_pulse_jurisdiction ON public.policy_pulse(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_policy_pulse_effective_date ON public.policy_pulse(effective_date);
CREATE INDEX IF NOT EXISTS idx_policy_pulse_pinned ON public.policy_pulse(pinned);

-- 4) Links resolver (overlay + wizard)
CREATE TABLE IF NOT EXISTS public.resource_links (
  key text PRIMARY KEY,         -- e.g., 'marketplace:FL', 'doi:FL', 'payer:UHC:directory'
  label text,
  url text,
  meta jsonb,                   -- {state:'FL', payer:'UHC', type:'directory'}
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_links_meta ON public.resource_links USING gin(meta);

-- 5) Case Locker (magic-link, no account)
CREATE TABLE IF NOT EXISTS public.case_locker (
  locker_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  magic_token text,
  token_expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_locker_email ON public.case_locker(email);
CREATE INDEX IF NOT EXISTS idx_case_locker_magic_token ON public.case_locker(magic_token);
CREATE INDEX IF NOT EXISTS idx_case_locker_expires ON public.case_locker(token_expires_at);

CREATE TABLE IF NOT EXISTS public.locker_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locker_id uuid REFERENCES public.case_locker(locker_id) ON DELETE CASCADE,
  item_type text,              -- 'chat', 'explainer', 'analyzer_report'
  ref_id uuid,                 -- threadId|explainer_lite.id|caseId
  title text,
  storage_path text,           -- optional pdf path
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locker_items_locker_id ON public.locker_items(locker_id);
CREATE INDEX IF NOT EXISTS idx_locker_items_type ON public.locker_items(item_type);
CREATE INDEX IF NOT EXISTS idx_locker_items_created_at ON public.locker_items(created_at);

-- Add comments for documentation
COMMENT ON TABLE public.explainer_lite IS 'Fast 3-bullet explanations for EOB/bill lines without full case creation';
COMMENT ON TABLE public.coverage_sessions IS 'Coverage decision wizard state and results';
COMMENT ON TABLE public.policy_pulse IS 'Policy changes feed with plain-language summaries';
COMMENT ON TABLE public.resource_links IS 'Directory and resource links for overlays and wizards';
COMMENT ON TABLE public.case_locker IS 'Magic-link based case storage without accounts';
COMMENT ON TABLE public.locker_items IS 'Individual items saved to user lockers';