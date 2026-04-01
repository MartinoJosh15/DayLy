# DayLy

DayLy is a scheduling and task management app with calendar-first planning.

## Current Features

- Week and month views powered by FullCalendar
- Drag-and-drop task rescheduling
- Priority filtering and category coloring
- Supabase-backed task persistence
- Supabase Auth-backed private workspaces
- Canvas assignment scan/import flow
- AI-assisted weekly planning
- Reminder foundation for future mobile push notifications
- Home hub for future multi-use modules

## Run Locally

```bash
npm install
npm run dev
```

## Frontend Environment Variables

Create a local `.env.local` with:

```bash
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_CANVAS_SCAN_URL=
VITE_AI_PLAN_URL=
```

An example file is included at [.env.example](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/.env.example).

`VITE_CANVAS_SCAN_URL` is optional. Leave it blank to use the local Vite route in development and the default Supabase Edge Function URL in production.
`VITE_AI_PLAN_URL` is optional. Leave it blank to use the default Supabase Edge Function URL in every environment.

## CLI Environment Variables

The Python CLI reads its secrets from a sibling `.env` file one level above this repo:

[`C:\Users\marti\OneDrive\Documents\Task_Manager\.env`](C:/Users/marti/OneDrive/Documents/Task_Manager/.env)

Suggested contents:

```bash
CANVAS_API_KEY=your-canvas-token
CANVAS_BASE_URL=https://canvas.jmu.edu/api/v1

SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-supabase-anon-key
```

Use the CLI from the `Dayly` folder with:

```bash
python ..\DayLy_CLI.py canvas --days 14 --apply
```

## Auth And Private Workspaces

DayLy now expects users to sign in with Supabase Auth so tasks, reminders, and future mobile clients can share one private account.

Recommended Supabase auth setup:

1. In Supabase Dashboard, enable `Email` sign-in with magic links or OTP.
2. Apply the SQL migrations in `supabase/migrations`.
3. After the new auth migration runs, existing pre-auth tasks will remain unowned until you claim them from the app.

The frontend uses the existing Supabase anon key and browser session handling, so no extra frontend secret is required for auth.

## AWS Deployment

DayLy is prepared for `AWS Amplify Hosting` with `Route 53` managing the domain.

Recommended domain structure:

- `app.day-ly.net` -> DayLy app
- `day-ly.net` -> optional landing page later

### Deploy with Amplify

1. Push the repo to GitHub.
2. In AWS Amplify, create a new app from the GitHub repo.
3. Amplify will detect [amplify.yml](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/amplify.yml).
4. Add these environment variables in Amplify:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_CANVAS_SCAN_URL`
   - `VITE_AI_PLAN_URL`
5. Deploy the `main` branch.

### Important For Auth

If you use magic-link sign-in, add your production app URL in Supabase:

`Authentication -> URL Configuration -> Redirect URLs`

Examples:

- `http://localhost:5173`
- `https://app.day-ly.net`

### Route 53 Setup

If `day-ly.net` is in Route 53:

1. Open the Amplify app.
2. Go to `Domain management`.
3. Add custom domain: `day-ly.net`
4. Assign the app to `app.day-ly.net`
5. Let Amplify create the DNS records in Route 53 automatically

## Canvas Scan In Production

Canvas scan now has a production path through a Supabase Edge Function at [supabase/functions/canvas-scan/index.ts](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/supabase/functions/canvas-scan/index.ts).

Local development still supports the Vite middleware route in [vite.config.js](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/vite.config.js), but deployed apps should use the Edge Function.

### Required Supabase Function Secrets

Add these secrets in Supabase before deploying the function:

```bash
CANVAS_API_KEY=your-canvas-api-token
CANVAS_BASE_URL=https://canvas.jmu.edu/api/v1
```

Supabase-hosted Edge Functions already receive `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the platform at runtime.

### Deploy The Function

Windows PowerShell:

```bash
npx.cmd supabase login
npx.cmd supabase link --project-ref your-project-id
npx.cmd supabase functions deploy canvas-scan
```

If PowerShell blocks `npx`, use `npx.cmd` and `npm.cmd` instead of `npx` / `npm`.

Generic command:

```bash
supabase functions deploy canvas-scan
```

Canvas scan now expects a signed-in Supabase session in production so imported tasks can be attached to the correct user.

If you want to point the app at a different function host, set:

```bash
VITE_CANVAS_SCAN_URL=https://your-project-id.supabase.co/functions/v1/canvas-scan
```

## AI Planning In Production

AI-assisted planning uses a second Supabase Edge Function at [supabase/functions/ai-plan/index.ts](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/supabase/functions/ai-plan/index.ts).

Add these Supabase function secrets before deploying:

```bash
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
```

Deploy the AI function:

```bash
npx.cmd supabase functions deploy ai-plan
```

Optional frontend override:

```bash
VITE_AI_PLAN_URL=https://your-project-id.supabase.co/functions/v1/ai-plan
```

AI planning now expects a signed-in Supabase session in production.

## Reminder Foundation

The reminder backend foundation now includes:

- user-owned tasks via `tasks.user_id`
- per-task reminder settings via `reminder_enabled` and `reminder_offset_minutes`
- `user_notification_settings`
- `device_push_tokens`
- `task_reminders`
- a reminder sender Edge Function at [supabase/functions/send-reminders/index.ts](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/supabase/functions/send-reminders/index.ts)

### Reminder Function Secrets

Add these secrets in Supabase before deploying reminder delivery:

```bash
EXPO_ACCESS_TOKEN=
REMINDER_CRON_SECRET=choose-a-long-random-secret
```

`EXPO_ACCESS_TOKEN` is optional for Expo Push, but recommended if you want to lock push delivery to your Expo account.

### Deploy The Reminder Function

```bash
npx.cmd supabase functions deploy send-reminders --no-verify-jwt
```

### Trigger Reminder Delivery

Set up a scheduler to send a POST request to:

```bash
https://your-project-id.supabase.co/functions/v1/send-reminders
```

Include this header:

```bash
x-cron-secret: your-reminder-cron-secret
```

Recommended cadence:

- every 5 minutes for normal use
- every 1 minute if you want near-real-time reminder dispatch

This function will read pending reminder rows, look up active device tokens, and send push notifications through Expo.

## Security Notes

- Keep `CANVAS_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` out of the React app and Amplify frontend environment variables.
- Keep `OPENAI_API_KEY` out of the React app and Amplify frontend environment variables.
- Keep `EXPO_ACCESS_TOKEN` and `REMINDER_CRON_SECRET` out of the React app and Amplify frontend environment variables.
- If a token or key is pasted into chat, committed, or otherwise exposed, rotate it and update the relevant `.env` file or Supabase secret.
