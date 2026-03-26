alter table public.tasks
  add column if not exists estimated_duration_minutes integer,
  add column if not exists preferred_time_window text;

create index if not exists idx_tasks_preferred_time_window
  on public.tasks (preferred_time_window);
