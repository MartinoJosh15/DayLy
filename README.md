# DayLy

DayLy is a scheduling and task management app with calendar-first planning.

## Current Features

- Week and month views powered by FullCalendar
- Drag-and-drop task rescheduling
- Priority filtering and category coloring
- Supabase-backed task persistence
- Canvas assignment scan/import flow
- Home hub for future multi-use modules

## Run Locally

```bash
npm install
npm run dev
```

## Environment Variables

Create a local `.env.local` with:

```bash
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_CANVAS_SCAN_URL=
```

An example file is included at [.env.example](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/.env.example).

`VITE_CANVAS_SCAN_URL` is optional. Leave it blank to use the local Vite route in development and the default Supabase Edge Function URL in production.

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
5. Deploy the `main` branch.

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
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CANVAS_API_KEY=your-canvas-api-token
CANVAS_BASE_URL=https://canvas.jmu.edu/api/v1
```

### Deploy The Function

```bash
supabase functions deploy canvas-scan --no-verify-jwt
```

If your frontend uses the same Supabase project as its main database, no extra client config is required in production.

If you want to point the app at a different function host, set:

```bash
VITE_CANVAS_SCAN_URL=https://your-project-id.supabase.co/functions/v1/canvas-scan
```
