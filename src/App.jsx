import { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { supabase } from "./utils/supabase";

import FullCalendarView from "./components/FullCalendarView";
import AddTaskModal from "./components/AddTaskModal";
import TaskDetailPanel from "./components/TaskDetailPanel";
import SettingsPanel from "./components/SettingsPanel";
import PriorityFilter from "./components/PriorityFilter";
import ProjectKanbanBoard from "./components/ProjectKanbanBoard";

import logo from "./assets/Logo.png";

const MODULES = [
  {
    id: "planner",
    title: "Task Planner",
    subtitle: "Calendar scheduling, drag and drop, priorities, and Canvas sync.",
    status: "Live",
    cta: "Open Planner",
  },
  {
    id: "projects",
    title: "Project Boards",
    subtitle: "Kanban board for assignments and projects you need to work on.",
    status: "Live",
    cta: "Open Board",
  },
  {
    id: "habits",
    title: "Habits",
    subtitle: "Recurring routine tracking with streak and consistency analytics.",
    status: "Planned",
    cta: "Coming Soon",
  },
  {
    id: "notes",
    title: "Notes and Docs",
    subtitle: "Fast capture notes linked directly to tasks and deadlines.",
    status: "Planned",
    cta: "Coming Soon",
  },
];

const ACTIONABLE_PROJECT_CATEGORIES = ["school", "work"];
const ACTIONABLE_PROJECT_KEYWORDS = ["homework", "assignment", "project", "essay", "lab", "exam", "study"];
const ROUTINE_EXCLUDE_KEYWORDS = ["gym", "class", "lecture", "workout", "practice"];
const PLANNER_CATEGORY_OPTIONS = ["all", "school", "work", "personal", "health", "errands", "other"];
const HOME_UPCOMING_LIMIT = 5;
const WORKFLOW_BUCKET_ORDER = ["inbox", "today", "upcoming", "overdue", "done"];
const TIME_WINDOW_RANGES = {
  any: { startHour: 8, endHour: 22 },
  morning: { startHour: 8, endHour: 12 },
  afternoon: { startHour: 12, endHour: 17 },
  evening: { startHour: 17, endHour: 22 },
};

function getCanvasScanUrl() {
  const explicitUrl = import.meta.env.VITE_CANVAS_SCAN_URL?.trim();
  if (explicitUrl) return explicitUrl;

  if (import.meta.env.DEV) {
    return "/api/canvas-scan";
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/canvas-scan`;
  }

  return "/api/canvas-scan";
}

function getCanvasScanHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };

  const explicitUrl = import.meta.env.VITE_CANVAS_SCAN_URL?.trim();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const usingSupabaseFunction =
    Boolean(explicitUrl) || (!import.meta.env.DEV && Boolean(supabaseUrl));

  if (usingSupabaseFunction && anonKey) {
    headers.apikey = anonKey;
    headers.Authorization = `Bearer ${anonKey}`;
  }

  return headers;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  if (!rawText) return {};

  if (!contentType.includes("application/json")) {
    const preview = rawText.slice(0, 120).trim().toLowerCase();

    if (preview.startsWith("<!doctype") || preview.startsWith("<html")) {
      throw new Error(
        import.meta.env.DEV
          ? "Canvas scan endpoint returned HTML instead of JSON. Make sure the app is running with `npm run dev`."
          : "Canvas scan endpoint is unavailable. Deploy the Supabase `canvas-scan` edge function or set `VITE_CANVAS_SCAN_URL`."
      );
    }

    throw new Error("Canvas scan returned an unexpected response format.");
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error("Canvas scan returned invalid JSON.");
  }
}

function normalizeKanbanStatus(value) {
  if (value === "todo" || value === "in_progress" || value === "done") {
    return value;
  }
  return "todo";
}

function getTaskSourceDate(task) {
  const source = task.start_time || task.due_date;
  if (!source) return null;

  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDashboardActionableTask(task) {
  const repeat = String(task.repeat || "none").toLowerCase();
  const text = `${task.title || ""} ${task.description || ""} ${task.location || ""}`.toLowerCase();
  const looksRoutine = ROUTINE_EXCLUDE_KEYWORDS.some((word) => text.includes(word));
  const looksProjectLike = ACTIONABLE_PROJECT_KEYWORDS.some((word) => text.includes(word));
  const isRecurring = repeat !== "none";

  if (looksRoutine && !looksProjectLike) return false;
  if (isRecurring && !looksProjectLike) return false;

  return true;
}

function getTaskWorkflowBucket(task, now = new Date()) {
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

function formatWorkflowBucketLabel(bucket) {
  if (bucket === "inbox") return "Inbox";
  if (bucket === "today") return "Today";
  if (bucket === "upcoming") return "Upcoming";
  if (bucket === "overdue") return "Overdue";
  if (bucket === "done") return "Done";
  return "Active";
}

function startOfDay(date) {
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

function formatLocalDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export default function App() {
  const [activeModule, setActiveModule] = useState("home");

  const [tasks, setTasks] = useState([]);
  const [calendarView, setCalendarView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const [showModal, setShowModal] = useState(false);
  const [modalInitialDateTime, setModalInitialDateTime] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

  const [theme, setTheme] = useState("light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [canvasScanning, setCanvasScanning] = useState(false);
  const [plannerSearch, setPlannerSearch] = useState("");
  const [plannerCategory, setPlannerCategory] = useState("all");
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [plannerPanel, setPlannerPanel] = useState("overview");
  const [plannerDockOpen, setPlannerDockOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddDate, setQuickAddDate] = useState(() => formatLocalDateInput(new Date()));
  const [quickAddStartTime, setQuickAddStartTime] = useState("09:00");
  const [quickAddEndTime, setQuickAddEndTime] = useState("10:00");
  const [quickAddCategory, setQuickAddCategory] = useState("other");
  const [quickAddPriority, setQuickAddPriority] = useState("medium");
  const [quickAddTimed, setQuickAddTimed] = useState(true);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [applyingPlan, setApplyingPlan] = useState(false);

  const [visiblePriorities, setVisiblePriorities] = useState({
    high: true,
    medium: true,
    low: true,
  });

  const isPlannerModule = activeModule === "planner";
  const isProjectsModule = activeModule === "projects";

  useEffect(() => {
    document.body.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  async function fetchTasks() {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching tasks:", error);
      toast.error("Could not load tasks");
      return;
    }

    setTasks(data || []);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTasks();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const basePlannerTasks = useMemo(() => {
    const query = plannerSearch.trim().toLowerCase();

    return tasks.filter((task) => {
      const priorityVisible = visiblePriorities[task.priority || "medium"];
      if (!priorityVisible) return false;

      if (plannerCategory !== "all" && task.category !== plannerCategory) {
        return false;
      }

      if (!query) return true;

      const haystack = `${task.title || ""} ${task.description || ""} ${task.location || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [tasks, visiblePriorities, plannerCategory, plannerSearch]);

  const filteredPlannerTasks = useMemo(() => {
    if (showCompletedTasks) return basePlannerTasks;
    return basePlannerTasks.filter((task) => !task.completed_at);
  }, [basePlannerTasks, showCompletedTasks]);

  const homeStats = useMemo(() => {
    const highPriorityCount = tasks.filter((t) => t.priority === "high").length;
    const timedCount = tasks.filter((t) => t.start_time && t.end_time).length;
    const completedCount = tasks.filter((t) => Boolean(t.completed_at)).length;
    const now = new Date();
    const todayKey = now.toDateString();
    const dueTodayCount = tasks.filter((task) => {
      if (task.completed_at) return false;
      if (!isDashboardActionableTask(task)) return false;
      const source = task.start_time || task.due_date;
      if (!source) return false;
      return new Date(source).toDateString() === todayKey;
    }).length;

    return {
      total: tasks.length,
      high: highPriorityCount,
      timed: timedCount,
      completed: completedCount,
      dueToday: dueTodayCount,
    };
  }, [tasks]);

  const homeUpcomingTasks = useMemo(() => {
    const now = new Date();

    return tasks
      .filter((task) => {
        if (task.completed_at) return false;
        if (!isDashboardActionableTask(task)) return false;
        const source = task.start_time || task.due_date;
        if (!source) return false;
        return new Date(source) >= now;
      })
      .sort((a, b) => {
        const aTime = new Date(a.start_time || a.due_date).getTime();
        const bTime = new Date(b.start_time || b.due_date).getTime();
        return aTime - bTime;
      });
  }, [tasks]);

  const visibleHomeUpcomingTasks = useMemo(
    () => homeUpcomingTasks.slice(0, HOME_UPCOMING_LIMIT),
    [homeUpcomingTasks]
  );

  const hiddenHomeUpcomingCount = Math.max(0, homeUpcomingTasks.length - HOME_UPCOMING_LIMIT);

  const homeOverdueTasks = useMemo(() => {
    const now = new Date();
    const todayKey = now.toDateString();

    return tasks
      .filter((task) => {
        if (task.completed_at) return false;
        if (!isDashboardActionableTask(task)) return false;
        const source = task.start_time || task.due_date;
        if (!source) return false;
        const date = new Date(source);
        return date < now && date.toDateString() !== todayKey;
      })
      .sort((a, b) => {
        const aTime = new Date(a.start_time || a.due_date).getTime();
        const bTime = new Date(b.start_time || b.due_date).getTime();
        return aTime - bTime;
      })
      .slice(0, 4);
  }, [tasks]);

  const homeRecentlyCompletedTasks = useMemo(() => {
    return tasks
      .filter((task) => Boolean(task.completed_at))
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
      .slice(0, 4);
  }, [tasks]);

  const actionableWorkflowBuckets = useMemo(() => {
    const grouped = {
      inbox: [],
      today: [],
      upcoming: [],
      overdue: [],
      done: [],
    };

    const actionableTasks = tasks.filter((task) => isDashboardActionableTask(task));
    const now = new Date();

    for (const task of actionableTasks) {
      grouped[getTaskWorkflowBucket(task, now)].push(task);
    }

    for (const bucket of WORKFLOW_BUCKET_ORDER) {
      grouped[bucket].sort((a, b) => {
        const aTime = getTaskSourceDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = getTaskSourceDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    }

    return grouped;
  }, [tasks]);

  const todayPlanSuggestions = useMemo(() => {
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);
    const scheduledBlocks = tasks
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

    const candidates = tasks
      .filter((task) => {
        if (task.completed_at) return false;
        if (!isDashboardActionableTask(task)) return false;
        if (task.start_time && task.end_time) return false;
        const bucket = getTaskWorkflowBucket(task, now);
        return bucket === "overdue" || bucket === "today" || bucket === "inbox";
      })
      .sort((a, b) => {
        const bucketRank = {
          overdue: 0,
          today: 1,
          inbox: 2,
          upcoming: 3,
          done: 4,
        };
        const priorityRank = {
          high: 0,
          medium: 1,
          low: 2,
        };
        const bucketDiff =
          bucketRank[getTaskWorkflowBucket(a, now)] - bucketRank[getTaskWorkflowBucket(b, now)];
        if (bucketDiff !== 0) return bucketDiff;

        const priorityDiff =
          (priorityRank[a.priority || "medium"] ?? 1) - (priorityRank[b.priority || "medium"] ?? 1);
        if (priorityDiff !== 0) return priorityDiff;

        const aTime = getTaskSourceDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = getTaskSourceDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });

    const workingBlocks = [...scheduledBlocks];
    const suggestions = [];

    for (const task of candidates) {
      const preferredWindow = task.preferred_time_window || "any";
      const { startHour, endHour } = TIME_WINDOW_RANGES[preferredWindow] || TIME_WINDOW_RANGES.any;
      const rangeStart = setDateWithHour(now, startHour);
      const rangeEnd = setDateWithHour(now, endHour);
      const durationMinutes = task.estimated_duration_minutes || 60;

      const slot = findNextAvailableSlot(workingBlocks, rangeStart, rangeEnd, durationMinutes);
      if (!slot) continue;

      const suggestion = {
        task,
        start: slot.start,
        end: slot.end,
        bucket: getTaskWorkflowBucket(task, now),
        preferredWindow,
      };

      suggestions.push(suggestion);
      workingBlocks.push({ start: slot.start, end: slot.end });
      workingBlocks.sort((a, b) => a.start - b.start);

      if (suggestions.length >= 5) break;
    }

    return suggestions;
  }, [tasks]);

  const workflowSummaryCards = useMemo(() => {
    return [
      {
        key: "inbox",
        label: "Inbox",
        count: actionableWorkflowBuckets.inbox.length,
        detail: "No date yet",
      },
      {
        key: "today",
        label: "Today",
        count: actionableWorkflowBuckets.today.length,
        detail: "Needs action now",
      },
      {
        key: "upcoming",
        label: "Upcoming",
        count: actionableWorkflowBuckets.upcoming.length,
        detail: "Scheduled ahead",
      },
      {
        key: "overdue",
        label: "Overdue",
        count: actionableWorkflowBuckets.overdue.length,
        detail: "Needs attention",
      },
      {
        key: "done",
        label: "Done",
        count: actionableWorkflowBuckets.done.length,
        detail: "Completed work",
      },
    ];
  }, [actionableWorkflowBuckets]);

  const plannerStats = useMemo(() => {
    const timed = filteredPlannerTasks.filter((task) => task.start_time && task.end_time);
    const high = filteredPlannerTasks.filter((task) => task.priority === "high");
    const completed = basePlannerTasks.filter((task) => Boolean(task.completed_at));

    return {
      visible: filteredPlannerTasks.length,
      timed: timed.length,
      high: high.length,
      completed: completed.length,
    };
  }, [basePlannerTasks, filteredPlannerTasks]);

  const plannerFocusStats = useMemo(() => {
    const now = new Date();
    const todayKey = now.toDateString();
    const weekAhead = new Date(now);
    weekAhead.setDate(weekAhead.getDate() + 7);

    let overdue = 0;
    let dueToday = 0;
    let dueThisWeek = 0;

    for (const task of filteredPlannerTasks) {
      const source = task.start_time || task.due_date;
      if (!source) continue;

      const date = new Date(source);
      if (task.completed_at) continue;

      if (date < now && date.toDateString() !== todayKey) {
        overdue += 1;
        continue;
      }

      if (date.toDateString() === todayKey) {
        dueToday += 1;
      }

      if (date >= now && date <= weekAhead) {
        dueThisWeek += 1;
      }
    }

    return {
      overdue,
      dueToday,
      dueThisWeek,
    };
  }, [filteredPlannerTasks]);

  const actionableProjectTasks = useMemo(() => {
    return tasks.filter((task) => {
      const category = String(task.category || "").toLowerCase();
      const repeat = String(task.repeat || "none").toLowerCase();
      const text = `${task.title || ""} ${task.description || ""} ${task.location || ""}`.toLowerCase();

      const isWorkCategory = ACTIONABLE_PROJECT_CATEGORIES.includes(category);
      const looksProjectLike = ACTIONABLE_PROJECT_KEYWORDS.some((word) => text.includes(word));
      const looksRoutine = ROUTINE_EXCLUDE_KEYWORDS.some((word) => text.includes(word));
      const isRecurring = repeat !== "none";

      if (looksRoutine && !looksProjectLike) return false;
      if (isRecurring && !looksProjectLike) return false;

      return isWorkCategory || looksProjectLike;
    });
  }, [tasks]);

  const hiddenProjectCount = Math.max(0, tasks.length - actionableProjectTasks.length);

  const kanbanStatusByTask = useMemo(() => {
    return Object.fromEntries(
      actionableProjectTasks.map((task) => [
        String(task.id),
        task.completed_at ? "done" : normalizeKanbanStatus(task.kanban_status),
      ])
    );
  }, [actionableProjectTasks]);

  function openModule(moduleId) {
    if (moduleId === "planner" || moduleId === "projects") {
      setActiveModule(moduleId);
      return;
    }

    toast("This module is planned and not live yet.");
  }

  function handleTimeSlotClick(date) {
    setModalInitialDateTime(date);
    setShowModal(true);
  }

  function formatPlannerTaskDate(task) {
    const source = task.start_time || task.due_date;
    if (!source) return "No date";

    const date = new Date(source);
    const hasTime = Boolean(task.start_time && task.end_time);

    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
    });
  }

  function movePlannerWindow(direction) {
    const d = new Date(currentDate);

    if (calendarView === "day") {
      d.setDate(d.getDate() + direction);
    } else if (calendarView === "week") {
      d.setDate(d.getDate() + direction * 7);
    } else {
      d.setMonth(d.getMonth() + direction);
    }

    setCurrentDate(d);
  }

  function getPlannerTitle() {
    if (calendarView === "day") {
      return currentDate.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }

    return currentDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }

  function focusToday() {
    setCurrentDate(new Date());
    setCalendarView("day");
  }

  function handleTaskClick(task) {
    setSelectedTask(task);
  }

  function handleTaskCreated() {
    setShowModal(false);
    fetchTasks();
  }

  async function handleQuickAddSubmit() {
    if (!quickAddTitle.trim()) {
      toast.error("Quick add needs a task title.");
      return;
    }

    setQuickAddSaving(true);

    let startIso = null;
    let endIso = null;

    if (quickAddTimed) {
      const start = new Date(`${quickAddDate}T${quickAddStartTime}`);
      const end = new Date(`${quickAddDate}T${quickAddEndTime}`);

      if (end <= start) {
        setQuickAddSaving(false);
        toast.error("End time must be after start time.");
        return;
      }

      startIso = start.toISOString();
      endIso = end.toISOString();
    }

    const { error } = await supabase.from("tasks").insert({
      title: quickAddTitle.trim(),
      category: quickAddCategory,
      priority: quickAddPriority,
      repeat: "none",
      due_date: new Date(`${quickAddDate}T00:00`).toISOString(),
      start_time: startIso,
      end_time: endIso,
    });

    setQuickAddSaving(false);

    if (error) {
      toast.error(error.message || "Could not create task.");
      return;
    }

    setQuickAddTitle("");
    setQuickAddPriority("medium");
    setQuickAddCategory("other");
    setQuickAddTimed(true);
    toast.success("Task added");
    fetchTasks();
  }

  async function handleKanbanStatusChange(taskId, status) {
    const normalized = normalizeKanbanStatus(status);
    const taskIdValue = String(taskId);

    let previousStatus = "todo";
    setTasks((prev) =>
      prev.map((task) => {
        if (String(task.id) !== taskIdValue) return task;
        previousStatus = normalizeKanbanStatus(task.kanban_status);
        return { ...task, kanban_status: normalized };
      })
    );

    if (previousStatus === normalized) return;

    const { error } = await supabase
      .from("tasks")
      .update({ kanban_status: normalized })
      .eq("id", taskId);

    if (!error) return;

    setTasks((prev) =>
      prev.map((task) =>
        String(task.id) === taskIdValue ? { ...task, kanban_status: previousStatus } : task
      )
    );

    const missingColumn =
      typeof error.message === "string" &&
      error.message.toLowerCase().includes("kanban_status");

    if (missingColumn) {
      toast.error("Missing `kanban_status` column in Supabase. Run the SQL migration first.");
      return;
    }

    toast.error(error.message || "Could not update board status.");
  }

  async function handleTaskCompletionToggle(taskId, completed) {
    const taskIdValue = String(taskId);
    const nextCompletedAt = completed ? new Date().toISOString() : null;
    let previousCompletedAt = null;

    setTasks((prev) =>
      prev.map((task) => {
        if (String(task.id) !== taskIdValue) return task;
        previousCompletedAt = task.completed_at || null;
        return {
          ...task,
          completed_at: nextCompletedAt,
        };
      })
    );

    const { error } = await supabase
      .from("tasks")
      .update({ completed_at: nextCompletedAt })
      .eq("id", taskId);

    if (!error) {
      toast.success(completed ? "Task marked complete" : "Task marked active");
      return true;
    }

    setTasks((prev) =>
      prev.map((task) =>
        String(task.id) === taskIdValue ? { ...task, completed_at: previousCompletedAt } : task
      )
    );

    const missingColumn =
      typeof error.message === "string" &&
      error.message.toLowerCase().includes("completed_at");

    if (missingColumn) {
      toast.error("Missing `completed_at` column in Supabase. Run the new SQL migration first.");
      return false;
    }

    toast.error(error.message || "Could not update task completion.");
    return false;
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function hasOverlap(taskId, startIso, endIso) {
    const start = new Date(startIso);
    const end = new Date(endIso);

    return tasks.some((t) => {
      if (t.id === taskId) return false;
      if (!t.start_time || !t.end_time) return false;

      const tStart = new Date(t.start_time);
      const tEnd = new Date(t.end_time);

      return rangesOverlap(start, end, tStart, tEnd);
    });
  }

  async function handleEventTimeChange({ event, revert }) {
    const task = event.extendedProps;

    if (!event.start || !event.end || event.allDay) return;

    const startIso = event.start.toISOString();
    const endIso = event.end.toISOString();

    if (new Date(endIso) <= new Date(startIso)) {
      revert();
      toast.error("End time must be after start time.");
      return;
    }

    if (hasOverlap(task.id, startIso, endIso)) {
      revert();
      toast.error("That time overlaps another task.");
      return;
    }

    const { error } = await supabase
      .from("tasks")
      .update({
        start_time: startIso,
        end_time: endIso,
      })
      .eq("id", task.id);

    if (error) {
      revert();
      toast.error(error.message);
      return;
    }

    fetchTasks();
  }

  async function handleCanvasScan() {
    if (canvasScanning) return;
    setCanvasScanning(true);

    try {
      const response = await fetch(getCanvasScanUrl(), {
        method: "POST",
        headers: getCanvasScanHeaders(),
        body: JSON.stringify({
          days: 14,
          includeOverdue: false,
        }),
      });

      const result = await readJsonResponse(response);

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Canvas scan failed.");
      }

      const insertedText =
        result.inserted === null || result.inserted === undefined ? "unknown" : result.inserted;
      const skippedText =
        result.skipped === null || result.skipped === undefined ? "unknown" : result.skipped;

      toast.success(`Canvas scan complete. Inserted ${insertedText}, skipped ${skippedText}.`);
      fetchTasks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Canvas scan failed.");
    } finally {
      setCanvasScanning(false);
    }
  }

  async function handleApplyPlanMyDay() {
    if (!todayPlanSuggestions.length || applyingPlan) return;

    setApplyingPlan(true);

    try {
      for (const suggestion of todayPlanSuggestions) {
        const { error } = await supabase
          .from("tasks")
          .update({
            due_date: startOfDay(suggestion.start).toISOString(),
            start_time: suggestion.start.toISOString(),
            end_time: suggestion.end.toISOString(),
          })
          .eq("id", suggestion.task.id);

        if (error) {
          throw error;
        }
      }

      toast.success("Applied your plan for today.");
      setPlannerPanel("overview");
      focusToday();
      fetchTasks();
    } catch (error) {
      toast.error(error.message || "Could not apply the plan.");
    } finally {
      setApplyingPlan(false);
    }
  }

  return (
    <>
      <Toaster position="top-right" />

      {activeModule === "home" ? (
        <div className="home-page">
          <header className="home-header">
            <div className="home-brand">
              <img src={logo} alt="DayLy logo" className="home-logo" />
              <div>
                <div className="home-kicker">Workspace Platform</div>
                <h1>DayLy</h1>
                <p className="home-header-copy">
                  One place for planning, execution, and the next tools you add over time.
                </p>
              </div>
            </div>

            <div className="home-header-actions">
              <button className="topbar-btn" onClick={() => setActiveModule("planner")}>
                Open Planner
              </button>
              <button className="topbar-btn" onClick={toggleTheme}>
                {theme === "light" ? "Dark Mode" : "Light Mode"}
              </button>
            </div>
          </header>

          <section className="home-primary-grid">
            <section className="home-surface home-command-surface">
              <div className="surface-header">
                <div>
                  <div className="home-kicker">Dashboard</div>
                  <h2>Start with what matters today</h2>
                </div>
              </div>

              <section className="home-summary-grid home-summary-grid-compact">
                <article className="home-summary-card home-summary-card-primary">
                  <div className="home-summary-label">Actionable Work</div>
                  <strong>
                    {actionableWorkflowBuckets.inbox.length +
                      actionableWorkflowBuckets.today.length +
                      actionableWorkflowBuckets.upcoming.length +
                      actionableWorkflowBuckets.overdue.length}
                  </strong>
                  <p>Active assignments, exams, and one-off work.</p>
                </article>
                <article className="home-summary-card">
                  <div className="home-summary-label">Today Snapshot</div>
                  <strong>
                    {homeStats.dueToday} due, {actionableWorkflowBuckets.overdue.length} overdue
                  </strong>
                  <p>{homeStats.completed} completed overall.</p>
                </article>
              </section>

              <section className="workflow-strip workflow-strip-inline">
                {workflowSummaryCards.map((card) => (
                  <div key={card.key} className={`workflow-card workflow-${card.key}`}>
                    <div className="workflow-card-label">{card.label}</div>
                    <strong>{card.count}</strong>
                  </div>
                ))}
              </section>
            </section>

            <aside className="home-surface home-upcoming home-upcoming-sidebar">
              <div className="surface-header">
                <div>
                  <div className="home-kicker">Upcoming Queue</div>
                  <h2>Next actionable tasks</h2>
                </div>
                <div className="home-upcoming-count">
                  {Math.min(homeUpcomingTasks.length, HOME_UPCOMING_LIMIT)} visible
                </div>
              </div>

              <div className="home-upcoming-list home-upcoming-checklist">
                {visibleHomeUpcomingTasks.length ? (
                  visibleHomeUpcomingTasks.map((task) => (
                    <div key={task.id} className="home-upcoming-check-item">
                      <label className="home-upcoming-check-label">
                        <input
                          type="checkbox"
                          checked={Boolean(task.completed_at)}
                          onChange={(event) =>
                            handleTaskCompletionToggle(task.id, event.target.checked)
                          }
                        />
                        <div
                          className="home-upcoming-check-content"
                          onClick={() => {
                            setActiveModule("planner");
                            setSelectedTask(task);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setActiveModule("planner");
                              setSelectedTask(task);
                            }
                          }}
                        >
                          <div className="home-upcoming-title">{task.title}</div>
                          <div className="home-upcoming-meta">
                            <span>{formatPlannerTaskDate(task)}</span>
                            <span className={`workflow-badge workflow-${getTaskWorkflowBucket(task)}`}>
                              {formatWorkflowBucketLabel(getTaskWorkflowBucket(task))}
                            </span>
                            <span className={`planner-priority priority-${task.priority || "medium"}`}>
                              {task.priority || "medium"}
                            </span>
                          </div>
                        </div>
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="home-upcoming-empty">No upcoming active tasks right now.</div>
                )}
              </div>

              {hiddenHomeUpcomingCount > 0 && (
                <div className="home-upcoming-footer">
                  {hiddenHomeUpcomingCount} more task{hiddenHomeUpcomingCount === 1 ? "" : "s"} queued.
                </div>
              )}
            </aside>
          </section>

          <section className="home-surface home-workspaces-section">
            <div className="surface-header">
              <div>
                <div className="home-kicker">Workspaces</div>
                <h2>Choose where you want to work</h2>
              </div>
            </div>

            <section className="module-grid">
              {MODULES.map((module) => {
                const live = module.status === "Live";
                const moduleMeta =
                  module.id === "planner"
                    ? `${filteredPlannerTasks.length} active tasks`
                    : module.id === "projects"
                      ? `${actionableProjectTasks.length} tracked project tasks`
                      : "Planned module";

                return (
                  <article key={module.id} className={`module-card ${live ? "live" : ""}`}>
                    <div className="module-card-topline">
                      <div className="module-status">{module.status}</div>
                      <div className="module-meta-note">{moduleMeta}</div>
                    </div>
                    <h3>{module.title}</h3>
                    <p>{module.subtitle}</p>
                    <button
                      className={`btn ${live ? "primary" : "ghost"}`}
                      onClick={() => openModule(module.id)}
                    >
                      {module.cta}
                    </button>
                  </article>
                );
              })}
            </section>
          </section>

          <section className="home-secondary-grid">
            <section className="home-surface home-panel home-panel-overdue">
              <div className="surface-header">
                <div>
                  <div className="home-kicker">Overdue</div>
                  <h2>Needs attention</h2>
                </div>
              </div>

              <div className="home-panel-list">
                {homeOverdueTasks.length ? (
                  homeOverdueTasks.map((task) => (
                    <button
                      key={task.id}
                      className="home-panel-item"
                      onClick={() => {
                        setActiveModule("planner");
                        setSelectedTask(task);
                      }}
                    >
                      <div className="home-panel-title">{task.title}</div>
                      <div className="home-panel-meta">
                        <span>{formatPlannerTaskDate(task)}</span>
                        <span className={`workflow-badge workflow-${getTaskWorkflowBucket(task)}`}>
                          {formatWorkflowBucketLabel(getTaskWorkflowBucket(task))}
                        </span>
                        <span className={`planner-priority priority-${task.priority || "medium"}`}>
                          {task.priority || "medium"}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="home-panel-empty">Nothing overdue right now.</div>
                )}
              </div>
            </section>

            <section className="home-surface home-panel">
              <div className="surface-header">
                <div>
                  <div className="home-kicker">Recently Completed</div>
                  <h2>Finished work</h2>
                </div>
              </div>

              <div className="home-panel-list">
                {homeRecentlyCompletedTasks.length ? (
                  homeRecentlyCompletedTasks.map((task) => (
                    <div key={task.id} className="home-panel-item is-completed">
                      <div className="home-panel-title">{task.title}</div>
                      <div className="home-panel-meta">
                        <span>
                          Completed{" "}
                          {new Date(task.completed_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="workflow-badge workflow-done">Done</span>
                        <span className={`planner-priority priority-${task.priority || "medium"}`}>
                          {task.priority || "medium"}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="home-panel-empty">Completed tasks will show up here.</div>
                )}
              </div>
            </section>
          </section>
        </div>
      ) : (
        <div className="app-shell">
          <aside className="sidebar">
            <div className="sidebar-header">
              <img src={logo} alt="DayLy logo" className="sidebar-logo" />
              <span className="sidebar-title">DayLy</span>
            </div>

            <div className="sidebar-section-label">Platform</div>
            <div className="sidebar-nav">
              <button
                className={`sidebar-btn ${activeModule === "home" ? "active" : ""}`}
                onClick={() => setActiveModule("home")}
              >
                Home
              </button>
              <button
                className={`sidebar-btn ${isPlannerModule ? "active" : ""}`}
                onClick={() => setActiveModule("planner")}
              >
                Planner
              </button>
              <button
                className={`sidebar-btn ${isProjectsModule ? "active" : ""}`}
                onClick={() => setActiveModule("projects")}
              >
                Project Board
              </button>
            </div>

            {isPlannerModule && (
              <>
                <div className="sidebar-section-label">Views</div>
                <div className="sidebar-nav">
                  <button
                    className={`sidebar-btn ${calendarView === "day" ? "active" : ""}`}
                    onClick={() => setCalendarView("day")}
                  >
                    Day
                  </button>

                  <button
                    className={`sidebar-btn ${calendarView === "month" ? "active" : ""}`}
                    onClick={() => setCalendarView("month")}
                  >
                    Month
                  </button>

                  <button
                    className={`sidebar-btn ${calendarView === "week" ? "active" : ""}`}
                    onClick={() => setCalendarView("week")}
                  >
                    Week
                  </button>
                </div>
              </>
            )}

            <div className="sidebar-section-label">Actions</div>
            <div className="sidebar-nav">
              <button
                className="sidebar-btn primary"
                onClick={() => {
                  setModalInitialDateTime(new Date());
                  setShowModal(true);
                }}
              >
                {isProjectsModule ? "+ Add Work Task" : "+ Add Task"}
              </button>

              <button className="sidebar-btn" onClick={handleCanvasScan} disabled={canvasScanning}>
                {canvasScanning ? "Scanning Canvas..." : "Scan Canvas"}
              </button>

              {isProjectsModule && (
                <button className="sidebar-btn" onClick={fetchTasks}>
                  Refresh Board
                </button>
              )}
            </div>

            <div className="sidebar-section-label">Theme and Settings</div>
            <div className="sidebar-nav">
              <button className="sidebar-btn" onClick={toggleTheme}>
                {theme === "light" ? "Enable Dark Mode" : "Disable Dark Mode"}
              </button>
              <button className="sidebar-btn" onClick={() => setSettingsOpen(true)}>
                Settings
              </button>
            </div>

            {isPlannerModule && calendarView === "month" && (
              <>
                <div className="sidebar-section-label">Priority</div>
                <PriorityFilter visible={visiblePriorities} onChange={setVisiblePriorities} />
              </>
            )}

            {isPlannerModule && (
              <>
                <div className="sidebar-section-label">Planner Filters</div>
                <div className="planner-sidebar-tools">
                  <input
                    className="planner-search-input"
                    placeholder="Search tasks"
                    value={plannerSearch}
                    onChange={(e) => setPlannerSearch(e.target.value)}
                  />

                  <select
                    className="planner-category-select"
                    value={plannerCategory}
                    onChange={(e) => setPlannerCategory(e.target.value)}
                  >
                    {PLANNER_CATEGORY_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value === "all" ? "All Categories" : value[0].toUpperCase() + value.slice(1)}
                      </option>
                    ))}
                  </select>

                  <label className="checkbox-row planner-toggle-row">
                    <input
                      type="checkbox"
                      checked={showCompletedTasks}
                      onChange={(e) => setShowCompletedTasks(e.target.checked)}
                    />
                    Show completed tasks
                  </label>
                </div>
              </>
            )}

            {isProjectsModule && (
              <div className="kanban-summary">
                Showing {actionableProjectTasks.length} work-focused tasks.
                {hiddenProjectCount > 0 && ` ${hiddenProjectCount} routine tasks are hidden.`}
              </div>
            )}
          </aside>

          <main className="main">
            {isPlannerModule ? (
              <>
                <header className="topbar">
                  <div>
                    <div className="topbar-title">Planner</div>
                    <div className="topbar-subtitle">
                      {getPlannerTitle()}
                    </div>
                  </div>

                  <div className="topbar-left">
                    <button className="topbar-btn" onClick={() => movePlannerWindow(-1)}>
                      Prev
                    </button>
                    <button className="topbar-btn" onClick={() => setCurrentDate(new Date())}>
                      Today
                    </button>
                    <button className="topbar-btn" onClick={() => movePlannerWindow(1)}>
                      Next
                    </button>
                    <button className="topbar-btn" onClick={focusToday}>
                      Focus Today
                    </button>
                    <button
                      className="topbar-btn"
                      onClick={() => {
                        setPlannerPanel("autoPlan");
                        setPlannerDockOpen(true);
                        focusToday();
                      }}
                    >
                      Plan My Day
                    </button>
                    <button
                      className="topbar-btn"
                      onClick={() => setPlannerDockOpen((prev) => !prev)}
                    >
                      {plannerDockOpen ? "Hide Tools" : "Show Tools"}
                    </button>
                  </div>
                </header>
              </>
            ) : (
              <header className="topbar">
                <div>
                  <div className="topbar-title">Project Board</div>
                  <div className="topbar-subtitle">
                    Focused on homework and projects, not routines or classes.
                  </div>
                </div>
                <button className="topbar-btn" onClick={fetchTasks}>
                  Refresh
                </button>
              </header>
            )}

            <div className="main-content">
              {isPlannerModule ? (
                <>
                  <div className={`planner-workspace ${plannerDockOpen ? "with-dock" : ""}`}>
                    <div className="planner-calendar-shell">
                      <FullCalendarView
                        tasks={filteredPlannerTasks}
                        view={calendarView}
                        currentDate={currentDate}
                        onTimeSlotClick={handleTimeSlotClick}
                        onTaskClick={handleTaskClick}
                        onEventTimeChange={handleEventTimeChange}
                      />
                    </div>
                  </div>

                  {plannerDockOpen && (
                    <section className="planner-dock">
                      <div className="planner-dock-tabs">
                        <button
                          className={`planner-dock-tab ${plannerPanel === "overview" ? "active" : ""}`}
                          onClick={() => setPlannerPanel("overview")}
                        >
                          Overview
                        </button>
                        <button
                          className={`planner-dock-tab ${plannerPanel === "quickAdd" ? "active" : ""}`}
                          onClick={() => setPlannerPanel("quickAdd")}
                        >
                          Quick Add
                        </button>
                        <button
                          className={`planner-dock-tab ${plannerPanel === "autoPlan" ? "active" : ""}`}
                          onClick={() => setPlannerPanel("autoPlan")}
                        >
                          Auto Plan
                        </button>
                        <button
                          className="planner-dock-tab"
                          onClick={() => setActiveModule("home")}
                        >
                          Home Dashboard
                        </button>
                      </div>

                      <div className="planner-dock-panel">
                        {plannerPanel === "overview" && (
                          <>
                            <section className="planner-overview planner-overview-side">
                              <article className="planner-overview-card">
                                <span>Visible Tasks</span>
                                <strong>{plannerStats.visible}</strong>
                              </article>
                              <article className="planner-overview-card">
                                <span>Timed Blocks</span>
                                <strong>{plannerStats.timed}</strong>
                              </article>
                              <article className="planner-overview-card">
                                <span>High Priority</span>
                                <strong>{plannerStats.high}</strong>
                              </article>
                              <article className="planner-overview-card">
                                <span>Completed</span>
                                <strong>{plannerStats.completed}</strong>
                              </article>
                            </section>

                            <section className="planner-focus-strip planner-focus-strip-side">
                              <button className="planner-focus-card is-primary" onClick={focusToday}>
                                <span>Today</span>
                                <strong>{plannerFocusStats.dueToday}</strong>
                                <small>tasks scheduled today</small>
                              </button>

                              <div className="planner-focus-card">
                                <span>Overdue</span>
                                <strong>{plannerFocusStats.overdue}</strong>
                                <small>need attention</small>
                              </div>

                              <div className="planner-focus-card">
                                <span>Next 7 Days</span>
                                <strong>{plannerFocusStats.dueThisWeek}</strong>
                                <small>coming up soon</small>
                              </div>
                            </section>
                          </>
                        )}

                        {plannerPanel === "quickAdd" && (
                          <section className="planner-quick-add planner-quick-add-side">
                            <div className="planner-quick-add-copy">
                              <span className="planner-quick-add-kicker">Quick Add</span>
                              <h3>Capture a task fast</h3>
                            </div>

                            <div className="planner-quick-add-grid planner-quick-add-grid-side">
                              <input
                                className="planner-quick-add-title"
                                placeholder="What needs to get done?"
                                value={quickAddTitle}
                                onChange={(e) => setQuickAddTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleQuickAddSubmit();
                                  }
                                }}
                              />

                              <input
                                type="date"
                                value={quickAddDate}
                                onChange={(e) => setQuickAddDate(e.target.value)}
                              />

                              <label className="checkbox-row planner-quick-add-toggle">
                                <input
                                  type="checkbox"
                                  checked={quickAddTimed}
                                  onChange={(e) => setQuickAddTimed(e.target.checked)}
                                />
                                Timed
                              </label>

                              {quickAddTimed && (
                                <>
                                  <input
                                    type="time"
                                    value={quickAddStartTime}
                                    onChange={(e) => setQuickAddStartTime(e.target.value)}
                                  />
                                  <input
                                    type="time"
                                    value={quickAddEndTime}
                                    onChange={(e) => setQuickAddEndTime(e.target.value)}
                                  />
                                </>
                              )}

                              <select
                                value={quickAddCategory}
                                onChange={(e) => setQuickAddCategory(e.target.value)}
                              >
                                <option value="school">School</option>
                                <option value="work">Work</option>
                                <option value="personal">Personal</option>
                                <option value="health">Health</option>
                                <option value="errands">Errands</option>
                                <option value="other">Other</option>
                              </select>

                              <select
                                value={quickAddPriority}
                                onChange={(e) => setQuickAddPriority(e.target.value)}
                              >
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                              </select>

                              <button
                                className="btn primary planner-quick-add-button"
                                onClick={handleQuickAddSubmit}
                                disabled={quickAddSaving}
                              >
                                {quickAddSaving ? "Adding..." : "Add"}
                              </button>
                            </div>
                          </section>
                        )}

                        {plannerPanel === "autoPlan" && (
                          <section className="planner-plan-board">
                            <div className="planner-plan-header">
                              <div>
                                <span className="planner-quick-add-kicker">Auto Plan</span>
                                <h3>Suggested schedule for today</h3>
                                <p>
                                  DayLy is placing overdue, due-today, and unscheduled work into open
                                  time slots.
                                </p>
                              </div>
                              <button
                                className="btn primary"
                                onClick={handleApplyPlanMyDay}
                                disabled={applyingPlan || !todayPlanSuggestions.length}
                              >
                                {applyingPlan ? "Applying..." : "Apply Plan"}
                              </button>
                            </div>

                            <div className="planner-plan-list">
                              {todayPlanSuggestions.length ? (
                                todayPlanSuggestions.map((suggestion) => (
                                  <article key={suggestion.task.id} className="planner-plan-item">
                                    <div className="planner-plan-time">
                                      {suggestion.start.toLocaleTimeString([], {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}{" "}
                                      -{" "}
                                      {suggestion.end.toLocaleTimeString([], {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}
                                    </div>
                                    <div className="planner-plan-content">
                                      <div className="planner-plan-title">{suggestion.task.title}</div>
                                      <div className="planner-plan-meta">
                                        <span className={`workflow-badge workflow-${suggestion.bucket}`}>
                                          {formatWorkflowBucketLabel(suggestion.bucket)}
                                        </span>
                                        <span className={`planner-priority priority-${suggestion.task.priority || "medium"}`}>
                                          {suggestion.task.priority || "medium"}
                                        </span>
                                        <span className="planner-plan-window">
                                          {suggestion.preferredWindow === "any"
                                            ? "Any time"
                                            : suggestion.preferredWindow}
                                        </span>
                                      </div>
                                    </div>
                                  </article>
                                ))
                              ) : (
                                <div className="planner-agenda-empty">
                                  No smart scheduling suggestions right now. Add unscheduled work with
                                  duration estimates to generate a daily plan.
                                </div>
                              )}
                            </div>
                          </section>
                        )}
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <ProjectKanbanBoard
                  tasks={actionableProjectTasks}
                  statusByTask={kanbanStatusByTask}
                  workflowBucketByTask={Object.fromEntries(
                    actionableProjectTasks.map((task) => [String(task.id), getTaskWorkflowBucket(task)])
                  )}
                  onTaskClick={handleTaskClick}
                  onStatusChange={handleKanbanStatusChange}
                />
              )}
            </div>

            {showModal && (
              <AddTaskModal
                initialDateTime={modalInitialDateTime}
                onClose={() => setShowModal(false)}
                onCreated={handleTaskCreated}
                defaultCategory={isProjectsModule ? "school" : "other"}
                categoryOptions={isProjectsModule ? ["school", "work", "other"] : undefined}
              />
            )}

            <TaskDetailPanel
              task={selectedTask}
              onClose={() => {
                setSelectedTask(null);
                fetchTasks();
              }}
              onUpdated={fetchTasks}
              onDeleted={fetchTasks}
              onCompletionToggle={handleTaskCompletionToggle}
            />

            <SettingsPanel
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              theme={theme}
              toggleTheme={toggleTheme}
            />
          </main>
        </div>
      )}
    </>
  );
}
