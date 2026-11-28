-- Oura's daily activity score (0 to 100), next to sleep and readiness.
alter table public.daily_health add column if not exists activity_score smallint check (activity_score between 0 and 100);
