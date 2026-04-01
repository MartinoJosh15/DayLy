alter table public.tasks
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists reminder_enabled boolean not null default false,
  add column if not exists reminder_offset_minutes integer not null default 15;

create index if not exists idx_tasks_user_id
  on public.tasks (user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_reminder_offset_minutes_check'
  ) then
    alter table public.tasks
      add constraint tasks_reminder_offset_minutes_check
      check (reminder_offset_minutes >= 0 and reminder_offset_minutes <= 10080);
  end if;
end $$;

create table if not exists public.user_notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reminders_enabled boolean not null default true,
  default_reminder_offset_minutes integer not null default 15,
  timezone text not null default 'America/New_York',
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_notification_settings_default_offset_check'
  ) then
    alter table public.user_notification_settings
      add constraint user_notification_settings_default_offset_check
      check (default_reminder_offset_minutes >= 0 and default_reminder_offset_minutes <= 10080);
  end if;
end $$;

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'expo',
  platform text not null default 'unknown',
  token text not null,
  device_label text,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  last_seen_at timestamp with time zone not null default timezone('utc', now()),
  disabled_at timestamp with time zone
);

create unique index if not exists idx_device_push_tokens_token
  on public.device_push_tokens (token);

create index if not exists idx_device_push_tokens_user_id
  on public.device_push_tokens (user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'device_push_tokens_provider_check'
  ) then
    alter table public.device_push_tokens
      add constraint device_push_tokens_provider_check
      check (provider in ('expo', 'webpush'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'device_push_tokens_platform_check'
  ) then
    alter table public.device_push_tokens
      add constraint device_push_tokens_platform_check
      check (platform in ('ios', 'android', 'web', 'unknown'));
  end if;
end $$;

create table if not exists public.task_reminders (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null default 'push',
  status text not null default 'pending',
  scheduled_for timestamp with time zone not null,
  task_title text not null,
  task_start_at timestamp with time zone,
  task_due_at timestamp with time zone,
  sent_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  unique (task_id, channel)
);

create index if not exists idx_task_reminders_user_id
  on public.task_reminders (user_id);

create index if not exists idx_task_reminders_status_scheduled_for
  on public.task_reminders (status, scheduled_for);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_reminders_channel_check'
  ) then
    alter table public.task_reminders
      add constraint task_reminders_channel_check
      check (channel in ('push'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_reminders_status_check'
  ) then
    alter table public.task_reminders
      add constraint task_reminders_status_check
      check (status in ('pending', 'sent', 'failed', 'canceled'));
  end if;
end $$;

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_current_user_on_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  if new.reminder_offset_minutes is null then
    new.reminder_offset_minutes := 15;
  end if;

  if new.reminder_enabled is null then
    new.reminder_enabled := false;
  end if;

  return new;
end;
$$;

create or replace function public.sync_task_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_time timestamp with time zone;
  reminder_time timestamp with time zone;
begin
  if tg_op = 'DELETE' then
    delete from public.task_reminders
    where task_id = old.id::text
      and channel = 'push';

    return old;
  end if;

  base_time := new.start_time;

  if base_time is null and new.due_date is not null then
    base_time := new.due_date::timestamp with time zone;
  end if;

  if new.user_id is null
     or new.completed_at is not null
     or coalesce(new.reminder_enabled, false) = false
     or base_time is null then
    delete from public.task_reminders
    where task_id = new.id::text
      and channel = 'push';

    return new;
  end if;

  reminder_time := base_time - make_interval(mins => greatest(coalesce(new.reminder_offset_minutes, 15), 0));

  insert into public.task_reminders (
    task_id,
    user_id,
    channel,
    status,
    scheduled_for,
    task_title,
    task_start_at,
    task_due_at,
    sent_at,
    error_message
  )
  values (
    new.id::text,
    new.user_id,
    'push',
    'pending',
    reminder_time,
    coalesce(new.title, 'Untitled task'),
    new.start_time,
    case
      when new.due_date is not null then new.due_date::timestamp with time zone
      else null
    end,
    null,
    null
  )
  on conflict (task_id, channel)
  do update set
    user_id = excluded.user_id,
    status = 'pending',
    scheduled_for = excluded.scheduled_for,
    task_title = excluded.task_title,
    task_start_at = excluded.task_start_at,
    task_due_at = excluded.task_due_at,
    sent_at = null,
    error_message = null,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function public.ensure_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_notification_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.claim_unowned_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.tasks
  set user_id = auth.uid()
  where user_id is null;

  get diagnostics claimed_count = row_count;
  return claimed_count;
end;
$$;

drop trigger if exists set_tasks_current_user on public.tasks;
create trigger set_tasks_current_user
before insert on public.tasks
for each row
execute function public.set_current_user_on_task();

drop trigger if exists sync_task_reminders_after_write on public.tasks;
create trigger sync_task_reminders_after_write
after insert or update on public.tasks
for each row
execute function public.sync_task_reminder();

drop trigger if exists sync_task_reminders_after_delete on public.tasks;
create trigger sync_task_reminders_after_delete
after delete on public.tasks
for each row
execute function public.sync_task_reminder();

drop trigger if exists set_user_notification_settings_updated_at on public.user_notification_settings;
create trigger set_user_notification_settings_updated_at
before update on public.user_notification_settings
for each row
execute function public.set_row_updated_at();

drop trigger if exists set_device_push_tokens_updated_at on public.device_push_tokens;
create trigger set_device_push_tokens_updated_at
before update on public.device_push_tokens
for each row
execute function public.set_row_updated_at();

drop trigger if exists set_task_reminders_updated_at on public.task_reminders;
create trigger set_task_reminders_updated_at
before update on public.task_reminders
for each row
execute function public.set_row_updated_at();

drop trigger if exists on_auth_user_created_notification_settings on auth.users;
create trigger on_auth_user_created_notification_settings
after insert on auth.users
for each row
execute function public.ensure_notification_settings();

alter table public.tasks enable row level security;
alter table public.user_notification_settings enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.task_reminders enable row level security;

drop policy if exists "users_can_select_own_tasks" on public.tasks;
create policy "users_can_select_own_tasks"
  on public.tasks
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users_can_insert_own_tasks" on public.tasks;
create policy "users_can_insert_own_tasks"
  on public.tasks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users_can_update_own_tasks" on public.tasks;
create policy "users_can_update_own_tasks"
  on public.tasks
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_can_delete_own_tasks" on public.tasks;
create policy "users_can_delete_own_tasks"
  on public.tasks
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users_can_select_own_notification_settings" on public.user_notification_settings;
create policy "users_can_select_own_notification_settings"
  on public.user_notification_settings
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users_can_insert_own_notification_settings" on public.user_notification_settings;
create policy "users_can_insert_own_notification_settings"
  on public.user_notification_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users_can_update_own_notification_settings" on public.user_notification_settings;
create policy "users_can_update_own_notification_settings"
  on public.user_notification_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_can_select_own_device_push_tokens" on public.device_push_tokens;
create policy "users_can_select_own_device_push_tokens"
  on public.device_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users_can_insert_own_device_push_tokens" on public.device_push_tokens;
create policy "users_can_insert_own_device_push_tokens"
  on public.device_push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users_can_update_own_device_push_tokens" on public.device_push_tokens;
create policy "users_can_update_own_device_push_tokens"
  on public.device_push_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_can_delete_own_device_push_tokens" on public.device_push_tokens;
create policy "users_can_delete_own_device_push_tokens"
  on public.device_push_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users_can_select_own_task_reminders" on public.task_reminders;
create policy "users_can_select_own_task_reminders"
  on public.task_reminders
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users_can_insert_own_task_reminders" on public.task_reminders;
create policy "users_can_insert_own_task_reminders"
  on public.task_reminders
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users_can_update_own_task_reminders" on public.task_reminders;
create policy "users_can_update_own_task_reminders"
  on public.task_reminders
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_can_delete_own_task_reminders" on public.task_reminders;
create policy "users_can_delete_own_task_reminders"
  on public.task_reminders
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant execute on function public.claim_unowned_tasks() to authenticated;
