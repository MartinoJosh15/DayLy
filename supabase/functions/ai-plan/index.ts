const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") || "").trim();
const OPENAI_MODEL = (Deno.env.get("OPENAI_MODEL") || "gpt-5-mini").trim();

type PlanningTask = {
  id: string;
  title: string;
  category: string;
  priority: string;
  bucket: string;
  estimatedDurationMinutes: number;
  preferredTimeWindow: string;
  dueDate: string | null;
  description: string;
};

type PlanningWindow = {
  start: string;
  end: string;
  label: string;
};

type PlanningSuggestion = {
  taskId: string;
  start: string;
  end: string;
  rationale: string;
};

type PlanningResponse = {
  summary: string;
  suggestions: PlanningSuggestion[];
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

function toMillis(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return parsed;
}

function sortSuggestionsByStart(a: PlanningSuggestion, b: PlanningSuggestion) {
  return toMillis(a.start) - toMillis(b.start);
}

function suggestionFitsWindow(suggestion: PlanningSuggestion, windows: PlanningWindow[]) {
  const start = toMillis(suggestion.start);
  const end = toMillis(suggestion.end);
  if (end <= start) return false;

  return windows.some((window) => {
    const windowStart = toMillis(window.start);
    const windowEnd = toMillis(window.end);
    return start >= windowStart && end <= windowEnd;
  });
}

function suggestionsOverlap(a: PlanningSuggestion, b: PlanningSuggestion) {
  const aStart = toMillis(a.start);
  const aEnd = toMillis(a.end);
  const bStart = toMillis(b.start);
  const bEnd = toMillis(b.end);
  return aStart < bEnd && bStart < aEnd;
}

function validateSuggestions(
  rawSuggestions: unknown,
  tasks: PlanningTask[],
  windows: PlanningWindow[],
  maxSuggestions: number
) {
  const allowedTaskIds = new Set(tasks.map((task) => task.id));
  const suggestions = Array.isArray(rawSuggestions) ? rawSuggestions : [];
  const normalized: PlanningSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (!suggestion || typeof suggestion !== "object") continue;

    const taskId = typeof (suggestion as { taskId?: unknown }).taskId === "string"
      ? (suggestion as { taskId: string }).taskId
      : "";
    const start = typeof (suggestion as { start?: unknown }).start === "string"
      ? (suggestion as { start: string }).start
      : "";
    const end = typeof (suggestion as { end?: unknown }).end === "string"
      ? (suggestion as { end: string }).end
      : "";
    const rationale = typeof (suggestion as { rationale?: unknown }).rationale === "string"
      ? (suggestion as { rationale: string }).rationale.trim()
      : "";

    if (!allowedTaskIds.has(taskId) || !start || !end || !rationale) continue;

    const candidate = { taskId, start, end, rationale };
    if (!suggestionFitsWindow(candidate, windows)) continue;
    normalized.push(candidate);
  }

  normalized.sort(sortSuggestionsByStart);

  const deduped: PlanningSuggestion[] = [];
  const usedTaskIds = new Set<string>();

  for (const suggestion of normalized) {
    if (usedTaskIds.has(suggestion.taskId)) continue;
    if (deduped.some((existing) => suggestionsOverlap(existing, suggestion))) continue;
    deduped.push(suggestion);
    usedTaskIds.add(suggestion.taskId);
  }

  return deduped.slice(0, maxSuggestions);
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
    const timezone = typeof body?.timezone === "string" ? body.timezone : "America/New_York";
    const now = typeof body?.now === "string" ? body.now : new Date().toISOString();
    const userPrompt =
      typeof body?.userPrompt === "string" && body.userPrompt.trim()
        ? body.userPrompt.trim()
        : "";
    const freeWindows = Array.isArray(body?.freeWindows) ? body.freeWindows : [];
    const tasks = Array.isArray(body?.tasks) ? body.tasks : [];
    const maxSuggestions = Number.isFinite(Number(body?.maxSuggestions))
      ? Math.max(1, Math.min(10, Number(body.maxSuggestions)))
      : 8;

    if (!tasks.length) {
      return jsonResponse(200, {
        ok: true,
        summary: "No unscheduled tasks were available for AI planning.",
        suggestions: [],
      });
    }

    if (!freeWindows.length) {
      return jsonResponse(200, {
        ok: true,
        summary: "No open time windows were available this week, so there was nothing to schedule.",
        suggestions: [],
      });
    }

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: {
          type: "string",
        },
        suggestions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              taskId: { type: "string" },
              start: { type: "string", format: "date-time" },
              end: { type: "string", format: "date-time" },
              rationale: { type: "string" },
            },
            required: ["taskId", "start", "end", "rationale"],
          },
        },
      },
      required: ["summary", "suggestions"],
    };

    const systemPrompt = [
      "You are DayLy's AI planning assistant.",
      "Create a focused, realistic plan for the upcoming week.",
      "Only schedule tasks and time windows provided in the input.",
      "Never invent new task IDs or time windows.",
      "Treat the user's planning prompt as guidance for emphasis, ordering, tradeoffs, and focus.",
      "If the prompt asks for work that is not represented in the provided tasks, mention that in the summary but do not invent extra scheduled items.",
      "Prefer overdue, due-soon, and high-priority tasks.",
      "Respect each task's estimated duration and preferred time window when possible.",
      "Avoid excessive context switching and leave some breathing room when the week is packed.",
      `Return at most ${maxSuggestions} suggestions.`,
    ].join(" ");

    const plannerPayloadText = JSON.stringify(
      {
        timezone,
        now,
        userPrompt,
        planningGoal:
          "Choose the best tasks to schedule into the available windows over the next week and explain the plan briefly.",
        maxSuggestions,
        freeWindows,
        tasks,
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
            content: [{ type: "input_text", text: plannerPayloadText }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "dayly_ai_plan",
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
      throw new Error("OpenAI returned no structured plan.");
    }

    const parsed = JSON.parse(outputText) as PlanningResponse;
    const validatedSuggestions = validateSuggestions(
      parsed.suggestions,
      tasks as PlanningTask[],
      freeWindows as PlanningWindow[],
      maxSuggestions
    );

    return jsonResponse(200, {
      ok: true,
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : "AI generated a weekly plan based on your open time windows and task priorities.",
      suggestions: validatedSuggestions,
      model: OPENAI_MODEL,
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : "AI planning failed.",
    });
  }
});
