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
```

An example file is included at [.env.example](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/.env.example).

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

### Important Production Note

The current Canvas scan endpoint is implemented as Vite dev middleware in [vite.config.js](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/vite.config.js). That route works in local development, but it will not run in Amplify production hosting.

To support Canvas scanning in production later, move that logic to:

- AWS Lambda + API Gateway, or
- another backend service
