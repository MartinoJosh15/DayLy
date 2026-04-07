-- DayLy notification smoke test queries
-- Run these in Supabase SQL Editor while signed in as an authenticated test user.

-- 1. Confirm your account-level notification settings exist.
select
  user_id,
  reminders_enabled,
  default_reminder_offset_minutes,
  timezone,
  quiet_hours_start,
  quiet_hours_end,
  updated_at
from public.user_notification_settings
order by updated_at desc
limit 5;

-- 2. Confirm recent tasks that have reminders enabled.
select
  id,
  title,
  user_id,
  reminder_enabled,
  reminder_offset_minutes,
  start_time,
  due_date,
  completed_at,
  updated_at
from public.tasks
where reminder_enabled = true
order by updated_at desc
limit 10;

-- 3. Confirm queued reminder rows were generated from those tasks.
select
  id,
  task_id,
  user_id,
  task_title,
  scheduled_for,
  task_start_at,
  task_due_at,
  status,
  error_message,
  updated_at
from public.task_reminders
order by scheduled_for asc
limit 20;

-- 4. Focus on reminders that are ready to send now.
select
  id,
  task_id,
  task_title,
  scheduled_for,
  status
from public.task_reminders
where status = 'pending'
  and scheduled_for <= timezone('utc', now())
order by scheduled_for asc;

-- 5. Confirm whether any device tokens exist for push delivery.
select
  id,
  user_id,
  provider,
  platform,
  device_label,
  disabled_at,
  last_seen_at
from public.device_push_tokens
order by updated_at desc nulls last, created_at desc
limit 20;
