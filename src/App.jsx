import { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { supabase, supabaseConfigError } from "./utils/supabase";
import useTaskInsights from "./hooks/useTaskInsights";
import {
  getAiCaptureUrl,
  getAiPlanUrl,
  getCanvasScanHeaders,
  getCanvasScanUrl,
  getSupabaseFunctionHeaders,
  readJsonResponse,
} from "./utils/api";
import {
  formatLocalDateInput,
  formatPlanSuggestionDay,
  formatWorkflowBucketLabel,
  getTaskWorkflowBucket,
  normalizeKanbanStatus,
  startOfDay,
  toTaskInsertFromAiSuggestion,
} from "./utils/planning";

import FullCalendarView from "./components/FullCalendarView";
import AddTaskModal from "./components/AddTaskModal";
import TaskDetailPanel from "./components/TaskDetailPanel";
import SettingsPanel from "./components/SettingsPanel";
import PriorityFilter from "./components/PriorityFilter";
import ProjectKanbanBoard from "./components/ProjectKanbanBoard";
import NotesDocsWorkspace from "./components/NotesDocsWorkspace";

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
    subtitle: "Your writing workspace for notes, docs, and task-driven work sessions.",
    status: "Live",
    cta: "Open Docs",
  },
];

const PLANNER_CATEGORY_OPTIONS = ["all", "school", "work", "personal", "health", "errands", "other"];
const DEFAULT_NOTIFICATION_SETTINGS = {
  reminders_enabled: true,
  default_reminder_offset_minutes: 15,
  timezone: "America/New_York",
  quiet_hours_start: null,
  quiet_hours_end: null,
};

function getAuthRedirectUrl() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}`;
}

export default function App() {
  const [activeModule, setActiveModule] = useState("home");

  const [tasks, setTasks] = useState([]);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [claimingLegacyTasks, setClaimingLegacyTasks] = useState(false);
  const [showLegacyClaimCard, setShowLegacyClaimCard] = useState(true);
  const [calendarView, setCalendarView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const [showModal, setShowModal] = useState(false);
  const [modalInitialDateTime, setModalInitialDateTime] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

  const [theme, setTheme] = useState("light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [notificationSettingsLoading, setNotificationSettingsLoading] = useState(false);
  const [notificationSettingsSaving, setNotificationSettingsSaving] = useState(false);
  const [deviceTokens, setDeviceTokens] = useState([]);
  const [deviceTokenSaving, setDeviceTokenSaving] = useState(false);
  const [notificationStats, setNotificationStats] = useState({
    enabledTaskCount: 0,
    queuedReminderCount: 0,
    nextReminderAt: null,
    upcomingReminders: [],
  });
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
  const [aiCapturePrompt, setAiCapturePrompt] = useState("");
  const [aiCapturing, setAiCapturing] = useState(false);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [planMode, setPlanMode] = useState("smart");
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiPlanSummary, setAiPlanSummary] = useState("");
  const [aiPlanError, setAiPlanError] = useState("");
  const [aiPlanSuggestions, setAiPlanSuggestions] = useState([]);
  const [aiPlanningPrompt, setAiPlanningPrompt] = useState("");
  const [notesCreateSignal, setNotesCreateSignal] = useState(0);

  const [visiblePriorities, setVisiblePriorities] = useState({
    high: true,
    medium: true,
    low: true,
  });

  const isPlannerModule = activeModule === "planner";
  const isProjectsModule = activeModule === "projects";
  const isNotesModule = activeModule === "notes";
  const showDeploymentConfig = Boolean(supabaseConfigError);
  const currentUser = session?.user ?? null;
  const currentUserId = currentUser?.id || "";

  useEffect(() => {
    document.body.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    setShowLegacyClaimCard(true);
  }, [currentUserId]);

  useEffect(() => {
    const enabledTaskCount = tasks.filter(
      (task) => Boolean(task.reminder_enabled) && !task.completed_at
    ).length;

    setNotificationStats((prev) => ({
      ...prev,
      enabledTaskCount,
    }));
  }, [tasks]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }

    let mounted = true;
    const url = new URL(window.location.href);
    const authCode = url.searchParams.get("code");
    const authError =
      url.searchParams.get("error_description") ||
      url.searchParams.get("error") ||
      (url.hash.startsWith("#error=") ? new URLSearchParams(url.hash.slice(1)).get("error") : "");

    async function restoreSession() {
      if (authError) {
        if (mounted) {
          toast.error(decodeURIComponent(authError));
          setAuthLoading(false);
        }
        return;
      }

      if (authCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(authCode);
        if (error) {
          if (mounted) {
            toast.error(error.message || "Could not finish signing in from the email link.");
            setAuthLoading(false);
          }
          return;
        }

        window.history.replaceState({}, document.title, getAuthRedirectUrl());
      }

      const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) {
          toast.error(error.message || "Could not restore your session.");
        }
        setSession(data.session ?? null);
        setAuthLoading(false);
    }

    restoreSession().catch((error) => {
        if (!mounted) return;
        toast.error(error instanceof Error ? error.message : "Could not restore your session.");
        setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  async function handleSaveNotificationSettings(nextSettings) {
    if (!supabase || !currentUserId) {
      toast.error("Sign in before saving notification settings.");
      return;
    }

    setNotificationSettingsSaving(true);

    const payload = {
      user_id: currentUserId,
      reminders_enabled: Boolean(nextSettings.reminders_enabled),
      default_reminder_offset_minutes: Number(nextSettings.default_reminder_offset_minutes) || 15,
      timezone: nextSettings.timezone || "America/New_York",
      quiet_hours_start: nextSettings.quiet_hours_start || null,
      quiet_hours_end: nextSettings.quiet_hours_end || null,
    };

    const { data, error } = await supabase
      .from("user_notification_settings")
      .upsert(payload, { onConflict: "user_id" })
      .select(
        "reminders_enabled, default_reminder_offset_minutes, timezone, quiet_hours_start, quiet_hours_end"
      )
      .single();

    setNotificationSettingsSaving(false);

    if (error) {
      toast.error(error.message || "Could not save notification settings.");
      return;
    }

    setNotificationSettings({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(data || payload),
    });
    toast.success("Notification settings saved.");
  }

  async function handleRegisterDeviceToken(nextToken) {
    if (!supabase || !currentUserId) {
      toast.error("Sign in before saving a device token.");
      return;
    }

    const tokenValue = String(nextToken.token || "").trim();
    if (!tokenValue) {
      toast.error("Enter a device token first.");
      return;
    }

    setDeviceTokenSaving(true);

    const payload = {
      user_id: currentUserId,
      token: tokenValue,
      platform: nextToken.platform || "unknown",
      provider: "expo",
      device_label: String(nextToken.deviceLabel || "").trim() || null,
      disabled_at: null,
      last_seen_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("device_push_tokens")
      .insert(payload)
      .select("id, token, platform, device_label, disabled_at, created_at")
      .single();

    setDeviceTokenSaving(false);

    if (error) {
      toast.error(error.message || "Could not save device token.");
      return;
    }

    setDeviceTokens((prev) => [
      {
        id: String(data.id),
        token: data.token || "",
        platform: data.platform || "unknown",
        deviceLabel: data.device_label || "",
        disabledAt: data.disabled_at || null,
        createdAt: data.created_at || null,
      },
      ...prev.filter((tokenRow) => tokenRow.token !== data.token),
    ]);
    toast.success("Device token saved.");
  }

  async function handleDeleteDeviceToken(tokenId) {
    if (!supabase || !currentUserId) {
      toast.error("Sign in before removing a device token.");
      return;
    }

    setDeviceTokenSaving(true);

    const { error } = await supabase
      .from("device_push_tokens")
      .delete()
      .eq("id", tokenId)
      .eq("user_id", currentUserId);

    setDeviceTokenSaving(false);

    if (error) {
      toast.error(error.message || "Could not remove device token.");
      return;
    }

    setDeviceTokens((prev) => prev.filter((tokenRow) => tokenRow.id !== tokenId));
    toast.success("Device token removed.");
  }

  async function handleEmailSignIn() {
    if (!supabase) return;

    const email = authEmail.trim();
    if (!email) {
      toast.error("Enter your email to get a magic link.");
      return;
    }

    setAuthSubmitting(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });

    setAuthSubmitting(false);

    if (error) {
      toast.error(error.message || "Could not send your magic link.");
      return;
    }

    toast.success("Magic link sent. Open it on this device to sign in.");
  }

  async function handleSignOut() {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message || "Could not sign out.");
      return;
    }

    setTasks([]);
    setSelectedTask(null);
    setActiveModule("home");
    toast.success("Signed out.");
  }

  async function handleClaimLegacyTasks() {
    if (!supabase) return;

    setShowLegacyClaimCard(false);
    setClaimingLegacyTasks(true);
    const { data, error } = await supabase.rpc("claim_unowned_tasks");
    setClaimingLegacyTasks(false);

    if (error) {
      toast.error(error.message || "Could not claim legacy tasks.");
      return;
    }

    fetchTasks();

    const claimedCount = Number(data) || 0;
    if (!claimedCount) {
      toast("No legacy tasks were available to claim.");
      return;
    }

    toast.success(`Claimed ${claimedCount} task${claimedCount === 1 ? "" : "s"} from your older setup.`);
  }

  async function fetchTasks() {
    if (!supabase || !currentUser) {
      setTasks([]);
      return;
    }

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching tasks:", error);
      toast.error("Could not load tasks");
      return;
    }

    setTasks(data || []);
  }

  useEffect(() => {
    if (!supabase || !currentUserId) {
      setTasks([]);
      return undefined;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
        const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", currentUserId)
        .order("start_time", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Error fetching tasks:", error);
        toast.error("Could not load tasks");
        return;
      }

      setTasks(data || []);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!supabase || !currentUserId) {
      setNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
      setDeviceTokens([]);
      setNotificationStats((prev) => ({
        ...prev,
        queuedReminderCount: 0,
        nextReminderAt: null,
        upcomingReminders: [],
      }));
      setNotificationSettingsLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadNotificationData() {
      setNotificationSettingsLoading(true);

      const [settingsResult, remindersResult, tokensResult] = await Promise.all([
        supabase
          .from("user_notification_settings")
          .select(
            "reminders_enabled, default_reminder_offset_minutes, timezone, quiet_hours_start, quiet_hours_end"
          )
          .eq("user_id", currentUserId)
          .maybeSingle(),
        supabase
          .from("task_reminders")
          .select("id, task_title, scheduled_for, status")
          .eq("user_id", currentUserId)
          .eq("status", "pending")
          .order("scheduled_for", { ascending: true })
          .limit(5),
        supabase
          .from("device_push_tokens")
          .select("id, token, platform, device_label, disabled_at, created_at")
          .eq("user_id", currentUserId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      if (!settingsResult.error) {
        setNotificationSettings({
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...(settingsResult.data || {}),
        });
      }

      if (!remindersResult.error) {
        const upcomingReminders = Array.isArray(remindersResult.data)
          ? remindersResult.data.map((row) => ({
              id: String(row.id),
              taskTitle: row.task_title || "Untitled task",
              scheduledFor: row.scheduled_for || null,
              status: row.status || "pending",
            }))
          : [];

        setNotificationStats((prev) => ({
          ...prev,
          queuedReminderCount: upcomingReminders.length,
          nextReminderAt: upcomingReminders[0]?.scheduledFor || null,
          upcomingReminders,
        }));
      }

      if (!tokensResult.error) {
        setDeviceTokens(
          Array.isArray(tokensResult.data)
            ? tokensResult.data.map((row) => ({
                id: String(row.id),
                token: row.token || "",
                platform: row.platform || "unknown",
                deviceLabel: row.device_label || "",
                disabledAt: row.disabled_at || null,
                createdAt: row.created_at || null,
              }))
            : []
        );
      }

      setNotificationSettingsLoading(false);
    }

    loadNotificationData().catch((error) => {
      if (cancelled) return;
      setNotificationSettingsLoading(false);
      toast.error(error instanceof Error ? error.message : "Could not load notification settings.");
    });

    return () => {
      cancelled = true;
    };
  }, [currentUserId, tasks]);

  useEffect(() => {
    setAiPlanSuggestions([]);
    setAiPlanSummary("");
    setAiPlanError("");
  }, [tasks]);

  useEffect(() => {
    setAiPlanSuggestions([]);
    setAiPlanSummary("");
    setAiPlanError("");
  }, [aiPlanningPrompt]);

  const {
    actionableProjectTasks,
    actionableWorkflowBuckets,
    aiPlanningContext,
    filteredPlannerTasks,
    hiddenHomeUpcomingCount,
    hiddenProjectCount,
    homeOverdueTasks,
    homeRecentlyCompletedTasks,
    homeStats,
    kanbanStatusByTask,
    plannerFocusStats,
    plannerStats,
    todayPlanSuggestions,
    visibleHomeUpcomingTasks,
    workflowSummaryCards,
  } = useTaskInsights({
    tasks,
    plannerSearch,
    plannerCategory,
    showCompletedTasks,
    visiblePriorities,
    aiPlanningPrompt,
  });

  const activePlanSuggestions = planMode === "ai" ? aiPlanSuggestions : todayPlanSuggestions;

  function openModule(moduleId) {
    if (moduleId === "planner" || moduleId === "projects" || moduleId === "notes") {
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
    if (!currentUserId) {
      toast.error("Sign in before creating a task.");
      return;
    }

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
      user_id: currentUserId,
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
      const response = await fetch(getCanvasScanUrl(session), {
        method: "POST",
        headers: getCanvasScanHeaders(session),
        body: JSON.stringify({
          days: 14,
          includeOverdue: false,
        }),
      });

      const result = await readJsonResponse(response, "Canvas scan");

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

  async function handleGenerateAiPlan() {
    if (aiPlanning) return;

    if (!aiPlanningContext.tasks.length) {
      toast("Add a few unscheduled tasks before asking AI to build a plan.");
      return;
    }

    if (!aiPlanningContext.freeWindows.length) {
      toast("There are no open windows left this week for AI to schedule.");
      return;
    }

    setPlanMode("ai");
    setAiPlanning(true);
    setAiPlanError("");

    try {
      const response = await fetch(getAiPlanUrl(), {
        method: "POST",
        headers: getSupabaseFunctionHeaders(session),
        body: JSON.stringify(aiPlanningContext),
      });

      const result = await readJsonResponse(response, "AI planner");
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "AI planning failed.");
      }

      const taskMap = new Map(tasks.map((task) => [String(task.id), task]));
      const suggestions = Array.isArray(result.suggestions)
        ? result.suggestions
            .map((suggestion) => {
              const task = taskMap.get(String(suggestion.taskId));
              if (!task) return null;

              const start = new Date(suggestion.start);
              const end = new Date(suggestion.end);
              if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
                return null;
              }

              return {
                task,
                start,
                end,
                bucket: getTaskWorkflowBucket(task),
                preferredWindow: task.preferred_time_window || "any",
                rationale: String(suggestion.rationale || ""),
              };
            })
            .filter(Boolean)
        : [];

      setAiPlanSummary(String(result.summary || ""));
      setAiPlanSuggestions(suggestions);

      if (!suggestions.length) {
        toast("AI reviewed your day but did not find a clean schedule to apply.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI planning failed.";
      setAiPlanError(message);
      setAiPlanSuggestions([]);
      toast.error(message);
    } finally {
      setAiPlanning(false);
    }
  }

  async function handleAiTaskCapture() {
    if (aiCapturing) return;

    if (!currentUserId) {
      toast.error("Sign in before using AI task capture.");
      return;
    }

    const prompt = aiCapturePrompt.trim();
    if (!prompt) {
      toast("Describe what you want DayLy to add first.");
      return;
    }

    setAiCapturing(true);

    try {
      const response = await fetch(getAiCaptureUrl(), {
        method: "POST",
        headers: getSupabaseFunctionHeaders(session),
        body: JSON.stringify({
          userPrompt: prompt,
          now: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
        }),
      });

      const result = await readJsonResponse(response, "AI task capture");
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "AI task capture failed.");
      }

      const rows = (Array.isArray(result.tasks) ? result.tasks : [])
        .map((suggestion) => toTaskInsertFromAiSuggestion(suggestion, currentUserId))
        .filter(Boolean);

      if (!rows.length) {
        toast("AI could not turn that into valid tasks yet. Try adding clearer days and times.");
        return;
      }

      const { error } = await supabase.from("tasks").insert(rows);
      if (error) {
        throw error;
      }

      setAiCapturePrompt("");
      toast.success(`Added ${rows.length} task${rows.length === 1 ? "" : "s"} from your AI request.`);
      fetchTasks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI task capture failed.");
    } finally {
      setAiCapturing(false);
    }
  }

  async function handleApplyPlanMyDay(planSuggestions = activePlanSuggestions) {
    if (!planSuggestions.length || applyingPlan) return;

    setApplyingPlan(true);

    try {
      for (const suggestion of planSuggestions) {
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

      toast.success(planMode === "ai" ? "Applied your AI plan for the week." : "Applied your plan for the week.");
      setPlannerPanel("overview");
      setPlanMode("smart");
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

      {showDeploymentConfig ? (
        <div className="home-page">
          <section className="home-header">
            <div className="home-brand">
              <img src={logo} alt="DayLy logo" className="home-logo" />
              <div>
                <div className="home-kicker">Deployment Setup Required</div>
                <h1>DayLy</h1>
                <p className="home-header-copy">
                  The app loaded, but Supabase environment variables are missing in this deployment.
                </p>
              </div>
            </div>
          </section>

          <section className="home-surface home-panel">
            <div className="surface-header">
              <div>
                <div className="home-kicker">Fix In Amplify</div>
                <h2>Set your environment variables</h2>
              </div>
            </div>

            <div className="error-banner">{supabaseConfigError}</div>

            <div className="deployment-help">
              <p>Add these environment variables in Amplify Hosting:</p>
              <code>VITE_SUPABASE_URL</code>
              <code>VITE_SUPABASE_ANON_KEY</code>
              <p>Then redeploy the app.</p>
            </div>
          </section>
        </div>
      ) : authLoading ? (
        <div className="home-page">
          <section className="home-header">
            <div className="home-brand">
              <img src={logo} alt="DayLy logo" className="home-logo" />
              <div>
                <div className="home-kicker">Connecting</div>
                <h1>DayLy</h1>
                <p className="home-header-copy">Checking your workspace session...</p>
              </div>
            </div>
          </section>
        </div>
      ) : !session ? (
        <div className="home-page">
          <header className="home-header">
            <div className="home-brand">
              <img src={logo} alt="DayLy logo" className="home-logo" />
              <div>
                <div className="home-kicker">Private Workspace</div>
                <h1>DayLy</h1>
                <p className="home-header-copy">
                  Sign in once and your planner, reminders, and future mobile app will stay in sync.
                </p>
              </div>
            </div>

            <div className="home-header-actions">
              <button className="topbar-btn" onClick={toggleTheme}>
                {theme === "light" ? "Dark Mode" : "Light Mode"}
              </button>
            </div>
          </header>

          <section className="home-surface home-panel auth-surface">
            <div className="surface-header">
              <div>
                <div className="home-kicker">Sign In</div>
                <h2>Open your DayLy workspace</h2>
              </div>
            </div>

            <p className="auth-copy">
              Use Supabase magic-link sign-in so your web app and mobile companion can share the same
              private tasks, reminders, and schedule.
            </p>

            <div className="auth-form">
              <input
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
              />
              <button className="btn primary" onClick={handleEmailSignIn} disabled={authSubmitting}>
                {authSubmitting ? "Sending..." : "Send Magic Link"}
              </button>
            </div>

            <div className="deployment-help">
              <p>Use the same email on every device so your planner data and reminder settings stay unified.</p>
            </div>
          </section>
        </div>
      ) : activeModule === "home" ? (
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
              <div className="home-user-pill">{currentUser?.email || "Signed in"}</div>
              <button className="topbar-btn" onClick={() => setActiveModule("planner")}>
                Open Planner
              </button>
              <button className="topbar-btn" onClick={toggleTheme}>
                {theme === "light" ? "Dark Mode" : "Light Mode"}
              </button>
              <button className="topbar-btn" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          </header>

          {tasks.length === 0 && showLegacyClaimCard && (
            <section className="home-surface home-panel auth-empty-state">
              <div>
                <div className="home-kicker">Migration Helper</div>
                <h2>Need older tasks in this new private workspace?</h2>
                <p className="auth-copy">
                  If you used DayLy before sign-in was added, you can claim your unowned tasks once and
                  attach them to this account.
                </p>
              </div>

              <button className="btn ghost" onClick={handleClaimLegacyTasks} disabled={claimingLegacyTasks}>
                {claimingLegacyTasks ? "Claiming..." : "Claim Legacy Tasks"}
              </button>
            </section>
          )}

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
                  {visibleHomeUpcomingTasks.length} visible
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

            <div className="sidebar-user-meta">
              <div className="sidebar-section-label">Signed In</div>
              <div className="sidebar-user-email">{currentUser?.email || "Unknown user"}</div>
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
              <button
                className={`sidebar-btn ${isNotesModule ? "active" : ""}`}
                onClick={() => setActiveModule("notes")}
              >
                Notes and Docs
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
                  if (isNotesModule) {
                    setNotesCreateSignal((prev) => prev + 1);
                    return;
                  }

                  setModalInitialDateTime(new Date());
                  setShowModal(true);
                }}
              >
                {isNotesModule ? "+ New Doc" : isProjectsModule ? "+ Add Work Task" : "+ Add Task"}
              </button>

              {!isNotesModule && (
                <button className="sidebar-btn" onClick={handleCanvasScan} disabled={canvasScanning}>
                  {canvasScanning ? "Scanning Canvas..." : "Scan Canvas"}
                </button>
              )}

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
              <button className="sidebar-btn" onClick={handleSignOut}>
                Sign Out
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
            ) : isProjectsModule ? (
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
            ) : (
              <header className="topbar">
                <div>
                  <div className="topbar-title">Notes and Docs</div>
                  <div className="topbar-subtitle">
                    Draft ideas, study, and work through tasks with music and context in one place.
                  </div>
                </div>
                <button className="topbar-btn" onClick={() => setNotesCreateSignal((prev) => prev + 1)}>
                  New Doc
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

                            <section className="planner-ai-prompt-card">
                              <label className="planner-ai-prompt-label" htmlFor="ai-capture-prompt">
                                Add with AI
                              </label>
                              <textarea
                                id="ai-capture-prompt"
                                className="planner-ai-prompt-input"
                                placeholder="Example: Add my classes every Monday and Wednesday from 9:30 AM to 10:45 AM, gym every Tuesday and Thursday at 6 PM for 1 hour, and a work shift Friday from 2 PM to 6 PM."
                                value={aiCapturePrompt}
                                onChange={(event) => setAiCapturePrompt(event.target.value)}
                              />
                              <div className="planner-ai-prompt-help">
                                Tell DayLy everything you want added in plain English. Include days, times, and whether it repeats.
                              </div>
                              <div className="planner-plan-action-row">
                                <button
                                  className="btn ghost"
                                  onClick={handleAiTaskCapture}
                                  disabled={aiCapturing}
                                >
                                  {aiCapturing ? "Adding..." : "Create Tasks with AI"}
                                </button>
                              </div>
                            </section>
                          </section>
                        )}

                        {plannerPanel === "autoPlan" && (
                          <section className="planner-plan-board">
                            <div className="planner-plan-header">
                              <div>
                                <span className="planner-quick-add-kicker">Auto Plan</span>
                                <h3>{planMode === "ai" ? "AI-assisted schedule for this week" : "Suggested schedule for this week"}</h3>
                                <p>
                                  {planMode === "ai"
                                    ? "OpenAI is ranking the best work to schedule into this week's open windows while keeping the plan realistic."
                                    : "DayLy is placing overdue, due-soon, and unscheduled work into open time slots across the week."}
                                </p>
                                {planMode === "ai" && aiPlanSummary && (
                                  <div className="planner-ai-summary">{aiPlanSummary}</div>
                                )}
                              </div>
                              <div className="planner-plan-actions">
                                <div className="planner-plan-mode-toggle">
                                  <button
                                    className={`btn ${planMode === "smart" ? "primary" : "ghost"}`}
                                    onClick={() => setPlanMode("smart")}
                                  >
                                    Smart Plan
                                  </button>
                                  <button
                                    className={`btn ${planMode === "ai" ? "primary" : "ghost"}`}
                                    onClick={() => setPlanMode("ai")}
                                  >
                                    AI Assist
                                  </button>
                                </div>
                                <div className="planner-plan-action-row">
                                  <button
                                    className="btn ghost"
                                    onClick={handleGenerateAiPlan}
                                    disabled={aiPlanning}
                                  >
                                    {aiPlanning ? "Thinking..." : "Generate AI Plan"}
                                  </button>
                                  <button
                                    className="btn primary"
                                    onClick={() => handleApplyPlanMyDay(activePlanSuggestions)}
                                    disabled={applyingPlan || !activePlanSuggestions.length}
                                  >
                                    {applyingPlan ? "Applying..." : planMode === "ai" ? "Apply AI Plan" : "Apply Plan"}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {planMode === "ai" && (
                              <section className="planner-ai-prompt-card">
                                <label className="planner-ai-prompt-label" htmlFor="ai-planning-prompt">
                                  Tell DayLy what kind of plan you want
                                </label>
                                <textarea
                                  id="ai-planning-prompt"
                                  className="planner-ai-prompt-input"
                                  placeholder="Examples: Prioritize school first and keep tonight light. Focus on overdue work before anything else. Build me a low-stress plan with one hard task and a few quick wins."
                                  value={aiPlanningPrompt}
                                  onChange={(event) => setAiPlanningPrompt(event.target.value)}
                                />
                                <div className="planner-ai-prompt-help">
                                  DayLy will use your prompt as guidance, but it will only schedule tasks and open time windows that already exist in your workspace.
                                </div>
                              </section>
                            )}

                            {planMode === "ai" && aiPlanError && (
                              <div className="error-banner">{aiPlanError}</div>
                            )}

                            <div className="planner-plan-list">
                              {activePlanSuggestions.length ? (
                                activePlanSuggestions.map((suggestion) => (
                                  <article key={suggestion.task.id} className="planner-plan-item">
                                    <div className="planner-plan-time">
                                      <div className="planner-plan-day">{formatPlanSuggestionDay(suggestion.start)}</div>
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
                                      {planMode === "ai" && suggestion.rationale && (
                                        <div className="planner-plan-rationale">{suggestion.rationale}</div>
                                      )}
                                    </div>
                                  </article>
                                ))
                              ) : (
                                <div className="planner-agenda-empty">
                                  {planMode === "ai"
                                    ? "No AI schedule yet. Generate a plan after adding unscheduled work and leaving some open time this week."
                                    : "No smart scheduling suggestions right now. Add unscheduled work with duration estimates to generate a weekly plan."}
                                </div>
                              )}
                            </div>
                          </section>
                        )}
                      </div>
                    </section>
                  )}
                </>
              ) : isProjectsModule ? (
                <ProjectKanbanBoard
                  tasks={actionableProjectTasks}
                  statusByTask={kanbanStatusByTask}
                  workflowBucketByTask={Object.fromEntries(
                    actionableProjectTasks.map((task) => [String(task.id), getTaskWorkflowBucket(task)])
                  )}
                  onTaskClick={handleTaskClick}
                  onStatusChange={handleKanbanStatusChange}
                />
              ) : (
                <NotesDocsWorkspace
                  tasks={tasks}
                  onTaskClick={handleTaskClick}
                  createSignal={notesCreateSignal}
                />
              )}
            </div>

            {showModal && (
              <AddTaskModal
                initialDateTime={modalInitialDateTime}
                onClose={() => setShowModal(false)}
                onCreated={handleTaskCreated}
                currentUserId={currentUserId}
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
              key={`${currentUserId}:${notificationSettings.reminders_enabled}:${notificationSettings.default_reminder_offset_minutes}:${notificationSettings.timezone}:${notificationSettings.quiet_hours_start || ""}:${notificationSettings.quiet_hours_end || ""}:${settingsOpen ? "open" : "closed"}`}
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              theme={theme}
              toggleTheme={toggleTheme}
              currentUserEmail={currentUser?.email || ""}
              notificationSettings={notificationSettings}
              notificationSettingsLoading={notificationSettingsLoading}
              notificationSettingsSaving={notificationSettingsSaving}
              notificationStats={notificationStats}
              deviceTokens={deviceTokens}
              deviceTokenSaving={deviceTokenSaving}
              onSaveNotificationSettings={handleSaveNotificationSettings}
              onRegisterDeviceToken={handleRegisterDeviceToken}
              onDeleteDeviceToken={handleDeleteDeviceToken}
            />
          </main>
        </div>
      )}
    </>
  );
}
