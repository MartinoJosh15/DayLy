import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EXPO_ACCESS_TOKEN = (Deno.env.get("EXPO_ACCESS_TOKEN") || "").trim();
const REMINDER_CRON_SECRET = (Deno.env.get("REMINDER_CRON_SECRET") || "").trim();

type ReminderRow = {
  id: string;
  user_id: string;
  task_id: string;
  task_title: string;
  task_start_at: string | null;
  task_due_at: string | null;
  scheduled_for: string;
};

type PushTokenRow = {
  id: string;
  user_id: string;
  token: string;
  platform: string;
};

type NotificationSettingsRow = {
  user_id: string;
  reminders_enabled: boolean;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function formatReminderBody(reminder: ReminderRow) {
  const targetTime = reminder.task_start_at || reminder.task_due_at;
  if (!targetTime) {
    return "You have a task coming up in DayLy.";
  }

  const local = new Date(targetTime).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  if (reminder.task_start_at) {
    return `Starts ${local}.`;
  }

  return `Due ${local}.`;
}

async function sendExpoNotification(pushToken: string, reminder: ReminderRow) {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      to: pushToken,
      sound: "default",
      title: `DayLy reminder: ${reminder.task_title}`,
      body: formatReminderBody(reminder),
      data: {
        taskId: reminder.task_id,
        reminderId: reminder.id,
        screen: "today",
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  const ticket = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;

  if (!response.ok) {
    const message =
      typeof payload?.errors?.[0]?.message === "string"
        ? payload.errors[0].message
        : "Expo push request failed.";
    throw new Error(message);
  }

  if (ticket?.status === "ok") {
    return { ok: true, error: "" };
  }

  const error =
    typeof ticket?.details?.error === "string"
      ? ticket.details.error
      : typeof ticket?.message === "string"
        ? ticket.message
        : "Notification provider rejected the push.";

  return { ok: false, error };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, {
      ok: false,
      error: "Missing Supabase function secrets. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  if (REMINDER_CRON_SECRET) {
    const requestSecret = (request.headers.get("x-cron-secret") || "").trim();
    if (requestSecret !== REMINDER_CRON_SECRET) {
      return jsonResponse(401, { ok: false, error: "Invalid cron secret." });
    }
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const nowIso = new Date().toISOString();
    const { data: reminders, error: remindersError } = await supabase
      .from("task_reminders")
      .select("id, user_id, task_id, task_title, task_start_at, task_due_at, scheduled_for")
      .eq("status", "pending")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (remindersError) {
      throw new Error(remindersError.message);
    }

    if (!reminders?.length) {
      return jsonResponse(200, {
        ok: true,
        processed: 0,
        sent: 0,
        failed: 0,
        message: "No due reminders found.",
      });
    }

    const userIds = [...new Set(reminders.map((reminder) => reminder.user_id))];

    const { data: settingsRows, error: settingsError } = await supabase
      .from("user_notification_settings")
      .select("user_id, reminders_enabled")
      .in("user_id", userIds);

    if (settingsError) {
      throw new Error(settingsError.message);
    }

    const settingsByUser = new Map(
      ((settingsRows || []) as NotificationSettingsRow[]).map((row) => [row.user_id, row])
    );

    const { data: tokenRows, error: tokensError } = await supabase
      .from("device_push_tokens")
      .select("id, user_id, token, platform")
      .in("user_id", userIds)
      .is("disabled_at", null);

    if (tokensError) {
      throw new Error(tokensError.message);
    }

    const tokensByUser = new Map<string, PushTokenRow[]>();
    for (const tokenRow of (tokenRows || []) as PushTokenRow[]) {
      const existing = tokensByUser.get(tokenRow.user_id) || [];
      existing.push(tokenRow);
      tokensByUser.set(tokenRow.user_id, existing);
    }

    let sent = 0;
    let failed = 0;

    for (const reminder of reminders as ReminderRow[]) {
      const settings = settingsByUser.get(reminder.user_id);
      if (settings && settings.reminders_enabled === false) {
        await supabase
          .from("task_reminders")
          .update({
            status: "canceled",
            error_message: "User reminders are disabled.",
          })
          .eq("id", reminder.id);
        continue;
      }

      const userTokens = tokensByUser.get(reminder.user_id) || [];
      if (!userTokens.length) {
        failed += 1;
        await supabase
          .from("task_reminders")
          .update({
            status: "failed",
            error_message: "No active device tokens registered.",
          })
          .eq("id", reminder.id);
        continue;
      }

      let delivered = false;
      let lastError = "";

      for (const tokenRow of userTokens) {
        const result = await sendExpoNotification(tokenRow.token, reminder);
        if (result.ok) {
          delivered = true;
          continue;
        }

        lastError = result.error;

        if (result.error === "DeviceNotRegistered") {
          await supabase
            .from("device_push_tokens")
            .update({ disabled_at: new Date().toISOString() })
            .eq("id", tokenRow.id);
        }
      }

      if (delivered) {
        sent += 1;
        await supabase
          .from("task_reminders")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", reminder.id);
      } else {
        failed += 1;
        await supabase
          .from("task_reminders")
          .update({
            status: "failed",
            error_message: lastError || "All push deliveries failed.",
          })
          .eq("id", reminder.id);
      }
    }

    return jsonResponse(200, {
      ok: true,
      processed: reminders.length,
      sent,
      failed,
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Reminder dispatch failed.",
    });
  }
});
