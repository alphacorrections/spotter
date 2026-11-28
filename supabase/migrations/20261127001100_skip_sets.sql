-- A set you chose to skip, with the reason. It carries no weight or reps, so nothing that reads
-- lifted sets (history, bests, targets) ever counts it.
alter table public.efforts drop constraint if exists efforts_kind_check;
alter table public.efforts add constraint efforts_kind_check check (kind in (
  'work', 'warmup', 'skip',
  'drop', 'rest_pause', 'myo', 'partials', 'amrap',
  'interval', 'steady',
  'hold', 'flow', 'movement',
  'day'));
