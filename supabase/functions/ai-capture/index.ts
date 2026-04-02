const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") || "").trim();
const OPENAI_MODEL = (Deno.env.get("OPENAI_MODEL") || "gpt-5-mini").trim();
const CATEGORY_VALUES = new Set(["school", "work", "personal", "health", "errands", "other"]);
const PRIORITY_VALUES = new Set(["high", "medium", "low"]);
const REPEAT_VALUES = new Set(["none", "daily", "weekly", "weekdays", "monthly"]);
const TIME_WINDOW_VALUES = new Set(["any", "morning", "afternoon", "evening"]);
const REPEAT_DAY_VALUES = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

type CaptureTask = {
  title: string;
  description: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  category: string;
  priority: string;
  repeat: string;
  repeatDays: string[];
  location: string | null;
  estimatedDurationMinutes: number;
  preferredTimeWindow: string;
  reminderEnabled: boolean;
  reminderOffsetMinutes: number;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function extractOutputText(responseJson: Record<string, unknown>) {
  if (typeof responseJson.output_text === "string" && responseJson.output_text) {
    return responseJson.output_text;
  }

  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];

    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const text = (entry as { text?: unknown }).text;
      if (typeof text === "string" && text) {
        return text;
      }
    }
  }

  return "";
}

function normalizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeTask(rawTask: unknown): CaptureTask | null {
  if (!rawTask || typeof rawTask !== "object") return null;

  const title = normalizeString((rawTask as { title?: unknown }).title);
  const date = normalizeString((rawTask as { date?: unknown }).date).slice(0, 10);
  const startTime = normalizeString((rawTask as { startTime?: unknown }).startTime) || null;
  const endTime = normalizeString((rawTask as { endTime?: unknown }).endTime) || null;
  const category = normalizeString((rawTask as { category?: unknown }).category, "other").toLowerCase();
  const priority = normalizeString((rawTask as { priority?: unknown }).priority, "medium").toLowerCase();
  const repeat = normalizeString((rawTask as { repeat?: unknown }).repeat, "none").toLowerCase();
  const preferredTimeWindow = normalizeString(
    (rawTask as { preferredTimeWindow?: unknown }).preferredTimeWindow,
    "any"
  ).toLowerCase();
  const estimatedDurationMinutes = Math.max(
    15,
    Math.min(480, Number((rawTask as { estimatedDurationMinutes?: unknown }).estimatedDurationMinutes) || 60)
  );
  const reminderOffsetMinutes = Math.max(
    0,
    Math.min(10080, Number((rawTask as { reminderOffsetMinutes?: unknown }).reminderOffsetMinutes) || 15)
  );
  const repeatDays = Array.isArray((rawTask as { repeatDays?: unknown[] }).repeatDays)
    ? (rawTask as { repeatDays: unknown[] }).repeatDays
        .map((day) => normalizeString(day).toLowerCase())
        .filter((day) => REPEAT_DAY_VALUES.has(day))
    : [];

  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) return null;
  if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) return null;
  if ((startTime && !endTime) || (!startTime && endTime)) return null;
  if (!CATEGORY_VALUES.has(category) || !PRIORITY_VALUES.has(priority) || !REPEAT_VALUES.has(repeat)) {
    return null;
  }
  if (!TIME_WINDOW_VALUES.has(preferredTimeWindow)) return null;
  if (repeat === "weekly" && !repeatDays.length) return null;

  return {
    title,
    description: normalizeString((rawTask as { description?: unknown }).description),
    date,
    startTime,
    endTime,
    category,
    priority,
    repeat,
    repeatDays,
    location: normalizeString((rawTask as { location?: unknown }).location) || null,
    estimatedDurationMinutes,
    preferredTimeWindow,
    reminderEnabled: Boolean((rawTask as { reminderEnabled?: unknown }).reminderEnabled),
    reminderOffsetMinutes,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  if (!OPENAI_API_KEY) {
    return jsonResponse(500, {
      ok: false,
      error: "Missing OPENAI_API_KEY. Add it to your Supabase Edge Function secrets.",
    });
  }

  try {
    const body = await request.json();
    const userPrompt =
      typeof body?.userPrompt === "string" && body.userPrompt.trim()
        ? body.userPrompt.trim()
        : "";
    const timezone = typeof body?.timezone === "string" ? body.timezone : "America/New_York";
    const now = typeof body?.now === "string" ? body.now : new Date().toISOString();

    if (!userPrompt) {
      return jsonResponse(400, {
        ok: false,
        error: "Missing userPrompt.",
      });
    }

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              date: { type: "string" },
              startTime: { type: ["string", "null"] },
              endTime: { type: ["string", "null"] },
              category: { type: "string" },
              priority: { type: "string" },
              repeat: { type: "string" },
              repeatDays: {
                type: "array",
                items: { type: "string" },
              },
              location: { type: ["string", "null"] },
              estimatedDurationMinutes: { type: "number" },
              preferredTimeWindow: { type: "string" },
              reminderEnabled: { type: "boolean" },
              reminderOffsetMinutes: { type: "number" },
            },
            required: [
              "title",
              "description",
              "date",
              "startTime",
              "endTime",
              "category",
              "priority",
              "repeat",
              "repeatDays",
              "location",
              "estimatedDurationMinutes",
              "preferredTimeWindow",
              "reminderEnabled",
              "reminderOffsetMinutes",
            ],
          },
        },
      },
      required: ["summary", "tasks"],
    };

    const systemPrompt = [
      "You are DayLy's AI task capture assistant.",
      "Convert the user's plain-English request into concrete DayLy tasks.",
      "The app supports one-off and recurring tasks, including classes, gym sessions, work shifts, study blocks, and routines.",
      "Return one task object for each distinct thing the user wants added.",
      "Use categories only from: school, work, personal, health, errands, other.",
      "Use priorities only from: high, medium, low.",
      "Use repeat only from: none, daily, weekly, weekdays, monthly.",
      "Use preferredTimeWindow only from: any, morning, afternoon, evening.",
      "Use repeatDays only from: mon, tue, wed, thu, fri, sat, sun.",
      "Dates must be YYYY-MM-DD in the user's local timezone.",
      "Times must be 24-hour HH:MM strings or null.",
      "If the task repeats weekly, choose the next upcoming occurrence as the date anchor and also fill repeatDays.",
      "If the user gives days and a time range, create timed tasks.",
      "If the user gives a duration but not an end time, calculate an end time.",
      "If the user does not specify a priority, use medium.",
      "If the user does not specify a category, infer the best fit.",
      "If the request is somewhat ambiguous, make a reasonable best effort instead of returning nothing.",
      "Do not include explanations outside the JSON response.",
    ].join(" ");

    const inputText = JSON.stringify(
      {
        now,
        timezone,
        userPrompt,
        notes:
          "Interpret the request as tasks to create in a planner app. Handle recurring classes, gym, work, and routines naturally.",
      },
      null,
      2
    );

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        reasoning: {
          effort: "low",
        },
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: inputText }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "dayly_ai_capture",
            strict: true,
            schema,
          },
        },
      }),
    });

    const responseJson = await openAiResponse.json();

    if (!openAiResponse.ok) {
      const apiError =
        typeof responseJson?.error?.message === "string"
          ? responseJson.error.message
          : "OpenAI request failed.";
      throw new Error(apiError);
    }

    const outputText = extractOutputText(responseJson);
    if (!outputText) {
      throw new Error("OpenAI returned no structured task capture.");
    }

    const parsed = JSON.parse(outputText) as { summary?: unknown; tasks?: unknown[] };
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.map((task) => normalizeTask(task)).filter((task) => task !== null)
      : [];

    return jsonResponse(200, {
      ok: true,
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : "AI converted your request into DayLy tasks.",
      tasks,
      model: OPENAI_MODEL,
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : "AI task capture failed.",
    });
  }
});
