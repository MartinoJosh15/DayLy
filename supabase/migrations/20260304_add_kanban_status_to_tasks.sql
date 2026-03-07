-- Adds persistent Kanban status for project board drag/drop

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'kanban_status'
  ) then
    alter table public.tasks
      add column kanban_status text;
  end if;
end $$;

update public.tasks
set kanban_status = 'todo'
where kanban_status is null;

alter table public.tasks
  alter column kanban_status set default 'todo';

alter table public.tasks
  alter column kanban_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_kanban_status_check'
  ) then
    alter table public.tasks
      add constraint tasks_kanban_status_check
      check (kanban_status in ('todo', 'in_progress', 'done'));
  end if;
end $$;

create index if not exists idx_tasks_kanban_status
  on public.tasks (kanban_status);
