-- Add context frame column to chat_sessions for slot management
-- This supports the minimal clarifier policy by persisting user context

-- Add context_frame column to store serialized ContextFrame
ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS context_frame jsonb;

-- Add index for efficient context frame queries
CREATE INDEX IF NOT EXISTS idx_chat_sessions_context_frame
ON public.chat_sessions USING gin(context_frame);

-- Add comment explaining the column
COMMENT ON COLUMN public.chat_sessions.context_frame IS
'Serialized ContextFrame containing extracted slots from user conversations to prevent redundant clarification questions';

-- Example context frame structure for reference:
-- {
--   "threadId": "uuid",
--   "slots": {
--     "state": {
--       "key": "state",
--       "value": "Florida",
--       "confidence": 0.9,
--       "source": "user",
--       "lastUpdated": 1640995200000
--     },
--     "currentCoverage": {
--       "key": "currentCoverage",
--       "value": "employer",
--       "confidence": 0.8,
--       "source": "user",
--       "lastUpdated": 1640995200000
--     }
--   }
-- }