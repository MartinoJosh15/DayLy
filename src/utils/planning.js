const ACTIONABLE_PROJECT_KEYWORDS = ["homework", "assignment", "project", "essay", "lab", "exam", "study"];
const ROUTINE_EXCLUDE_KEYWORDS = ["gym", "class", "lecture", "workout", "practice"];
const AUTO_PLAN_HORIZON_DAYS = 7;
const AUTO_PLAN_MAX_SUGGESTIONS = 8;
const TIME_WINDOW_RANGES = {
  any: { startHour: 8, endHour: 22 },
  morning: { startHour: 8, endHour: 12 },
  afternoon: { startHour: 12, endHour: 17 },
  evening: { startHour: 17, endHour: 22 },
};
const PLANNING_BUCKET_RANK = {
  overdue: 0,
  today: 1,
  inbox: 2,
  upcoming: 3,
  done: 4,
};
const PLANNING_PRIORITY_RANK = {
  high: 0,
  medium: 1,
  low: 2,
};

export function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function setDateWithHour(date, hour) {
  const value = new Date(date);
  value.setHours(hour, 0, 0, 0);
  return value;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function getPlanningPriorityRank(priority) {
  return PLANNING_PRIORITY_RANK[priority || "medium"] ?? 1;
}

function getPlanningBucketRank(bucket) {
  return PLANNING_BUCKET_RANK[bucket] ?? 5;
}

function getScheduledBlocksForDate(tasks, targetDate) {
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);

  return tasks
    .filter((task) => {
      if (!task.start_time || !task.end_time) return false;
      const start = new Date(task.start_time);
      return start >= dayStart && start <= dayEnd;
    })
    .map((task) => ({
      start: new Date(task.start_time),
      end: new Date(task.end_time),
    }))
    .sort((a, b) => a.start - b.start);
}

function getScheduledBlocksForRange(tasks, rangeStart, rangeEnd) {
  return tasks
    .filter((task) => {
      if (!task.start_time || !task.end_time) return false;
      const start = new Date(task.start_time);
      return start >= rangeStart && start <= rangeEnd;
    })
    .map((task) => ({
      start: new Date(task.start_time),
      end: new Date(task.end_time),
    }))
    .sort((a, b) => a.start - b.start);
}

function findNextAvailableSlot(events, rangeStart, rangeEnd, durationMinutes) {
  let cursor = new Date(rangeStart);

  for (const block of events) {
    if (block.end <= cursor) continue;
    if (block.start >= rangeEnd) break;

    if (addMinutes(cursor, durationMinutes) <= block.start) {
      return {
        start: new Date(cursor),
        end: addMinutes(cursor, durationMinutes),
      };
    }

    if (block.end > cursor) {
      cursor = new Date(block.end);
    }
  }

  if (addMinutes(cursor, durationMinutes) <= rangeEnd) {
    return {
      start: new Date(cursor),
      end: addMinutes(cursor, durationMinutes),
    };
  }

  return null;
}

function normalizeRepeatDays(value) {
  const allowed = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  if (!Array.isArray(value)) return [];

  return value
    .map((day) => String(day || "").toLowerCase())
    .filter((day) => allowed.has(day));
}

export function formatLocalDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatPlanSuggestionDay(date) {
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function normalizeKanbanStatus(value) {
  if (value === "todo" || value === "in_progress" || value === "done") {
    return value;
  }
  return "todo";
}

export function getTaskSourceDate(task) {
  const source = task.start_time || task.due_date;
  if (!source) return null;

  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isDashboardActionableTask(task) {
  const repeat = String(task.repeat || "none").toLowerCase();
  const text = `${task.title || ""} ${task.description || ""} ${task.location || ""}`.toLowerCase();
  const looksRoutine = ROUTINE_EXCLUDE_KEYWORDS.some((word) => text.includes(word));
  const looksProjectLike = ACTIONABLE_PROJECT_KEYWORDS.some((word) => text.includes(word));
  const isRecurring = repeat !== "none";

  if (looksRoutine && !looksProjectLike) return false;
  if (isRecurring && !looksProjectLike) return false;

  return true;
}

export function getTaskWorkflowBucket(task, now = new Date()) {
  if (task.completed_at) return "done";

  const sourceDate = getTaskSourceDate(task);
  if (!sourceDate) return "inbox";

  if (sourceDate.toDateString() === now.toDateString()) {
    return "today";
  }

  if (sourceDate < now) {
    return "overdue";
  }

  return "upcoming";
}

export function formatWorkflowBucketLabel(bucket) {
  if (bucket === "inbox") return "Inbox";
  if (bucket === "today") return "Today";
  if (bucket === "upcoming") return "Upcoming";
  if (bucket === "overdue") return "Overdue";
  if (bucket === "done") return "Done";
  return "Active";
}

export function getAutoPlanCandidates(tasks, now, { includeUpcoming = false } = {}) {
  return tasks
    .filter((task) => {
      if (task.completed_at) return false;
      if (!isDashboardActionableTask(task)) return false;
      if (task.start_time && task.end_time) return false;
      const bucket = getTaskWorkflowBucket(task, now);
      return (
        bucket === "overdue" ||
        bucket === "today" ||
        bucket === "inbox" ||
        (includeUpcoming && bucket === "upcoming")
      );
    })
    .sort((a, b) => {
      const bucketDiff =
        getPlanningBucketRank(getTaskWorkflowBucket(a, now)) -
        getPlanningBucketRank(getTaskWorkflowBucket(b, now));
      if (bucketDiff !== 0) return bucketDiff;

      const priorityDiff = getPlanningPriorityRank(a.priority) - getPlanningPriorityRank(b.priority);
      if (priorityDiff !== 0) return priorityDiff;

      const aTime = getTaskSourceDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = getTaskSourceDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
}

export function buildSmartPlanSuggestions(tasks, now = new Date()) {
  const horizonEnd = endOfDay(addDays(now, AUTO_PLAN_HORIZON_DAYS - 1));
  const scheduledBlocks = getScheduledBlocksForRange(tasks, now, horizonEnd);
  const candidates = getAutoPlanCandidates(tasks, now, { includeUpcoming: true });
  const workingBlocks = [...scheduledBlocks];
  const suggestions = [];

  for (const task of candidates) {
    const preferredWindow = task.preferred_time_window || "any";
    const { startHour, endHour } = TIME_WINDOW_RANGES[preferredWindow] || TIME_WINDOW_RANGES.any;
    const durationMinutes = task.estimated_duration_minutes || 60;
    let slot = null;

    for (let offset = 0; offset < AUTO_PLAN_HORIZON_DAYS; offset += 1) {
      const day = addDays(now, offset);
      const preferredStart = setDateWithHour(day, startHour);
      const preferredEnd = setDateWithHour(day, endHour);
      const rangeStart =
        offset === 0
          ? new Date(Math.max(preferredStart.getTime(), now.getTime()))
          : preferredStart;

      if (rangeStart >= preferredEnd) continue;

      slot = findNextAvailableSlot(workingBlocks, rangeStart, preferredEnd, durationMinutes);
      if (slot) break;
    }

    if (!slot) continue;

    suggestions.push({
      task,
      start: slot.start,
      end: slot.end,
      bucket: getTaskWorkflowBucket(task, now),
      preferredWindow,
      rationale: "",
    });

    workingBlocks.push({ start: slot.start, end: slot.end });
    workingBlocks.sort((a, b) => a.start - b.start);

    if (suggestions.length >= AUTO_PLAN_MAX_SUGGESTIONS) break;
  }

  return suggestions;
}

export function buildPlanningWindows(tasks, now = new Date()) {
  const windows = [];

  for (let offset = 0; offset < AUTO_PLAN_HORIZON_DAYS; offset += 1) {
    const day = addDays(now, offset);
    const scheduledBlocks = getScheduledBlocksForDate(tasks, day);
    const planningStart =
      offset === 0
        ? new Date(Math.max(setDateWithHour(day, 8).getTime(), now.getTime()))
        : setDateWithHour(day, 8);
    const planningEnd = setDateWithHour(day, 22);

    if (planningStart >= planningEnd) continue;

    let cursor = new Date(planningStart);

    for (const block of scheduledBlocks) {
      if (block.end <= cursor) continue;
      if (block.start >= planningEnd) break;

      const windowEnd = new Date(Math.min(block.start.getTime(), planningEnd.getTime()));
      if (windowEnd > cursor) {
        windows.push({
          start: new Date(cursor),
          end: windowEnd,
        });
      }

      if (block.end > cursor) {
        cursor = new Date(block.end);
      }
    }

    if (cursor < planningEnd) {
      windows.push({
        start: new Date(cursor),
        end: new Date(planningEnd),
      });
    }
  }

  return windows.filter((window) => window.end > window.start);
}

export function toTaskInsertFromAiSuggestion(suggestion, currentUserId) {
  const date = String(suggestion?.date || "").slice(0, 10);
  const title = String(suggestion?.title || "").trim();
  if (!currentUserId || !date || !title) return null;

  const startTime = String(suggestion?.startTime || "").trim();
  const endTime = String(suggestion?.endTime || "").trim();
  let startIso = null;
  let endIso = null;

  if (startTime && endTime) {
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return null;
    }

    startIso = start.toISOString();
    endIso = end.toISOString();
  }

  return {
    user_id: currentUserId,
    title,
    description: String(suggestion?.description || "").trim() || null,
    category: String(suggestion?.category || "other").toLowerCase(),
    priority: String(suggestion?.priority || "medium").toLowerCase(),
    repeat: String(suggestion?.repeat || "none").toLowerCase(),
    repeat_days: normalizeRepeatDays(suggestion?.repeatDays),
    location: String(suggestion?.location || "").trim() || null,
    estimated_duration_minutes: Number(suggestion?.estimatedDurationMinutes) || null,
    preferred_time_window: String(suggestion?.preferredTimeWindow || "any").toLowerCase(),
    reminder_enabled: Boolean(suggestion?.reminderEnabled),
    reminder_offset_minutes: Number(suggestion?.reminderOffsetMinutes) || 15,
    due_date: new Date(`${date}T00:00`).toISOString(),
    start_time: startIso,
    end_time: endIso,
  };
}
