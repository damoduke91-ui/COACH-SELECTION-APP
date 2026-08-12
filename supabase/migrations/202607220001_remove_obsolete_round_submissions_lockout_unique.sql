-- Round submissions are identified by coach and Super 8 round. The legacy
-- lockout-based index conflicts with the application's round-based upserts when
-- a saved lockout timestamp is reused after the active round changes.
DROP INDEX IF EXISTS public.round_submissions_unique;
