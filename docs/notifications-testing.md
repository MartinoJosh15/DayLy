# Notification Testing

This guide is the fastest manual smoke test for DayLy reminders.

## Prerequisites

1. Apply the migrations in [`supabase/migrations`](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/supabase/migrations).
2. Run the app locally with `npm.cmd run dev`.
3. Sign in to the app with a real Supabase user.
4. If you want to test dispatch, deploy [`supabase/functions/send-reminders/index.ts`](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/supabase/functions/send-reminders/index.ts).

## Smoke Test 1: Reminder Row Creation

Goal: verify that saving a task with reminders enabled creates a `task_reminders` row.

1. Open DayLy and sign in.
2. Create a timed task that starts 10 to 15 minutes from now.
3. Turn on reminders and choose `5 minutes before`.
4. Save the task.
5. Open Supabase SQL Editor and run [`supabase/manual-tests/notifications_smoke_test.sql`](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/supabase/manual-tests/notifications_smoke_test.sql).

Expected result:

- the task appears with `reminder_enabled = true`
- a matching row exists in `public.task_reminders`
- `status = 'pending'`
- `scheduled_for` is about 5 minutes before the task start time

## Smoke Test 2: Account Settings Round Trip

Goal: verify that global notification settings save and load correctly.

1. Open `Settings`.
2. Change any of these values:
   - reminders enabled
   - default reminder timing
   - timezone
   - quiet hours
3. Save settings.
4. Close and reopen `Settings`.
5. Run the SQL checks in [`supabase/manual-tests/notifications_smoke_test.sql`](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/supabase/manual-tests/notifications_smoke_test.sql).

Expected result:

- values persist in `public.user_notification_settings`
- reopening the panel shows the saved values

## Smoke Test 3: Reminder Dispatch

Goal: verify that the reminder worker picks up pending reminders.

1. Make sure `send-reminders` is deployed.
2. Create a reminder due within the next few minutes.
3. Wait until `scheduled_for` has passed.
4. Invoke the reminder function manually.

PowerShell example:

```powershell
Invoke-WebRequest `
  -Uri "https://YOUR_PROJECT_ID.supabase.co/functions/v1/send-reminders" `
  -Method POST `
  -Headers @{ "x-cron-secret" = "YOUR_REMINDER_CRON_SECRET" }
```

Expected result:

- due reminder rows move from `pending` to either `sent`, `failed`, or `canceled`

Interpretation:

- `sent`: dispatch succeeded
- `failed`: the worker ran but could not deliver
- `canceled`: user reminders are disabled

## Common Failure Cases

- `No active device tokens registered.`
  This is expected if `public.device_push_tokens` is empty. The worker is functioning, but there is nowhere to send the push.

- `Could not load notification settings.`
  Usually means the notification migration has not been applied yet.

- No row in `task_reminders`
  Check that:
  - the task has `reminder_enabled = true`
  - the task has either `start_time` or `due_date`
  - the task is not completed

## Good First End-to-End Target

Use this scenario for repeatable testing:

1. Create a timed task starting 12 minutes from now.
2. Set reminder timing to `5 minutes before`.
3. Confirm the pending reminder row appears.
4. After the reminder time passes, manually invoke `send-reminders`.
5. Confirm the reminder row status changes.

This validates the whole path from app -> database trigger -> reminder queue -> worker.
