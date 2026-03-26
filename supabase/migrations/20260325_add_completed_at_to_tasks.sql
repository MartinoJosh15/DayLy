-- Adds persistent completion state for planner tasks

alter table public.tasks
  add column if not exists completed_at timestamp with time zone;

create index if not exists idx_tasks_completed_at
  on public.tasks (completed_at);
