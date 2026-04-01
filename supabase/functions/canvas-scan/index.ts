import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const CANVAS_BASE_URL = (Deno.env.get("CANVAS_BASE_URL") || "https://canvas.jmu.edu/api/v1").replace(
  /\/+$/,
  ""
);
const CANVAS_API_KEY = (Deno.env.get("CANVAS_API_KEY") || "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const LOCAL_TIME_ZONE = "America/New_York";

const htmlTagPattern = /<[^>]+>/g;

type CanvasCourse = {
  id: string;
  name: string;
  course_code: string;
};

type CanvasAssignment = {
  assignment_id: string;
  name: string;
  due_at: string;
  description: string;
  points_possible: number | null;
  html_url: string;
};

type TaskInsert = {
  user_id: string;
  title: string;
  due_date: string;
  description: string;
  category: string;
  priority: string;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  repeat: string;
  repeat_days: string[] | null;
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(`${normalized}${padding}`);
}

function getUserIdFromRequest(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return "";

  const tokenParts = match[1].split(".");
  if (tokenParts.length < 2) return "";

  try {
    const payload = JSON.parse(decodeBase64Url(tokenParts[1]));
    return typeof payload?.sub === "string" ? payload.sub : "";
  } catch {
    return "";
  }
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function stripHtml(text: string) {
  if (!text) return "";
  return text.replace(htmlTagPattern, " ").replace(/\s+/g, " ").trim();
}

function formatLocalTimeForHumans(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: LOCAL_TIME_ZONE,
  });
}

function getLocalDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format Canvas due date.");
  }

  return `${year}-${month}-${day}`;
}

function parseLinkHeader(linkHeader: string | null) {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(",")) {
    if (part.includes('rel="next"')) {
      const match = part.match(/<([^>]+)>/);
      if (match?.[1]) return match[1];
    }
  }

  return null;
}

async function canvasRequestAllPages(endpoint: string, params: Record<string, string> = {}) {
  if (!CANVAS_API_KEY) {
    throw new Error("Missing CANVAS_API_KEY. Add it to your Supabase function secrets.");
  }

  let nextUrl = `${CANVAS_BASE_URL}/${endpoint.replace(/^\/+/, "")}`;
  let query = new URLSearchParams(params);
  const out: unknown[] = [];

  while (nextUrl) {
    const url = query.size ? `${nextUrl}?${query.toString()}` : nextUrl;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${CANVAS_API_KEY}`,
        "User-Agent": "dayly-edge-function/1.0 (canvas importer)",
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Canvas request failed with status ${response.status}.`);
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      out.push(...data);
    } else {
      break;
    }

    nextUrl = parseLinkHeader(response.headers.get("Link"));
    query = new URLSearchParams();
  }

  return out;
}

async function listCourses(): Promise<CanvasCourse[]> {
  const courses = await canvasRequestAllPages("courses", {
    enrollment_state: "active",
    per_page: "100",
  });

  return courses.flatMap((course) => {
    if (!course || typeof course !== "object") return [];

    const id = "id" in course ? course.id : null;
    if (!id) return [];

    const name =
      ("name" in course && typeof course.name === "string" && course.name) ||
      ("course_code" in course && typeof course.course_code === "string" && course.course_code) ||
      "Untitled course";

    return [
      {
        id: String(id),
        name,
        course_code:
          ("course_code" in course && typeof course.course_code === "string" && course.course_code) || "",
      },
    ];
  });
}

async function getUnsubmittedAssignments(courseId: string): Promise<CanvasAssignment[]> {
  const assignments = await canvasRequestAllPages(`courses/${courseId}/assignments`, {
    per_page: "100",
    "include[]": "submission",
  });

  return assignments.flatMap((assignment) => {
    if (!assignment || typeof assignment !== "object") return [];

    const published = "published" in assignment ? assignment.published : false;
    const lockedForUser = "locked_for_user" in assignment ? assignment.locked_for_user : false;
    const dueAt = "due_at" in assignment ? assignment.due_at : null;

    if (!published || lockedForUser || typeof dueAt !== "string" || !dueAt) {
      return [];
    }

    const submission =
      "submission" in assignment && assignment.submission && typeof assignment.submission === "object"
        ? assignment.submission
        : {};

    const workflowState =
      "workflow_state" in submission && typeof submission.workflow_state === "string"
        ? submission.workflow_state
        : "";
    const submittedAt =
      "submitted_at" in submission && typeof submission.submitted_at === "string"
        ? submission.submitted_at
        : null;

    const submitted =
      submittedAt !== null || ["submitted", "graded", "pending_review"].includes(workflowState);

    if (submitted) {
      return [];
    }

    return [
      {
        assignment_id: String(("id" in assignment ? assignment.id : "") || ""),
        name:
          ("name" in assignment && typeof assignment.name === "string" && assignment.name) ||
          "Untitled assignment",
        due_at: dueAt,
        description:
          ("description" in assignment && typeof assignment.description === "string"
            ? stripHtml(assignment.description)
            : "") || "",
        points_possible:
          "points_possible" in assignment && typeof assignment.points_possible === "number"
            ? assignment.points_possible
            : null,
        html_url:
          ("html_url" in assignment && typeof assignment.html_url === "string" && assignment.html_url) || "",
      },
    ];
  });
}

function isWithinWindow(dueAt: Date, now: Date, horizon: Date, includeOverdue: boolean) {
  if (includeOverdue) {
    return dueAt <= horizon;
  }

  return dueAt >= now && dueAt <= horizon;
}

function buildTask(userId: string, courseName: string, assignment: CanvasAssignment): TaskInsert {
  const dueDate = new Date(assignment.due_at);
  const dueDateLocal = getLocalDateParts(dueDate);
  const dueTimeLocal = formatLocalTimeForHumans(dueDate);
  const descriptionParts = [];

  if (assignment.description) {
    descriptionParts.push(assignment.description);
  }

  descriptionParts.push(`Canvas due time: ${dueTimeLocal} (${LOCAL_TIME_ZONE})`);

  if (assignment.html_url) {
    descriptionParts.push(`Link: ${assignment.html_url}`);
  }

  return {
    user_id: userId,
    title: `${courseName}: ${assignment.name}`,
    due_date: dueDateLocal,
    description: descriptionParts.join("\n\n").trim(),
    category: "school",
    priority: "medium",
    location: null,
    start_time: null,
    end_time: null,
    repeat: "none",
    repeat_days: null,
  };
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

  try {
    const body = await request.json().catch(() => ({}));
    const userId = getUserIdFromRequest(request);
    const daysValue = Number(body?.days);
    const days = Number.isFinite(daysValue) ? Math.max(1, Math.min(60, Math.floor(daysValue))) : 14;
    const includeOverdue = Boolean(body?.includeOverdue);

    if (!userId) {
      return jsonResponse(401, {
        ok: false,
        error: "Authentication required. Sign in before scanning Canvas.",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const courses = await listCourses();
    if (!courses.length) {
      return jsonResponse(200, {
        ok: true,
        inserted: 0,
        skipped: 0,
        output: "No active Canvas courses found.",
      });
    }

    const now = new Date();
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const candidates: TaskInsert[] = [];

    for (const course of courses) {
      const assignments = await getUnsubmittedAssignments(course.id);

      for (const assignment of assignments) {
        const dueAt = new Date(assignment.due_at);
        if (Number.isNaN(dueAt.getTime())) continue;
        if (!isWithinWindow(dueAt, now, horizon, includeOverdue)) continue;
        candidates.push(buildTask(userId, course.name, assignment));
      }
    }

    if (!candidates.length) {
      return jsonResponse(200, {
        ok: true,
        inserted: 0,
        skipped: 0,
        output: "No Canvas assignments matched your filters.",
      });
    }

    let inserted = 0;
    let skipped = 0;

    for (const task of candidates) {
      const { data: existingRows, error: selectError } = await supabase
        .from("tasks")
        .select("id")
        .eq("user_id", userId)
        .eq("title", task.title)
        .eq("due_date", task.due_date)
        .limit(1);

      if (selectError) {
        throw new Error(selectError.message);
      }

      if (existingRows?.length) {
        skipped += 1;
        continue;
      }

      const { error: insertError } = await supabase.from("tasks").insert(task);
      if (insertError) {
        throw new Error(insertError.message);
      }

      inserted += 1;
    }

    return jsonResponse(200, {
      ok: true,
      inserted,
      skipped,
      output: `Canvas import complete. Inserted=${inserted}, Skipped(dupes)=${skipped}`,
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Canvas scan failed.",
    });
  }
});
