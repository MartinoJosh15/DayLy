import { useMemo } from "react";
import {
  buildPlanningWindows,
  buildSmartPlanSuggestions,
  formatPlanSuggestionDay,
  getAutoPlanCandidates,
  getTaskSourceDate,
  getTaskWorkflowBucket,
  isDashboardActionableTask,
  normalizeKanbanStatus,
} from "../utils/planning";

const ACTIONABLE_PROJECT_CATEGORIES = ["school", "work"];
const ACTIONABLE_PROJECT_KEYWORDS = ["homework", "assignment", "project", "essay", "lab", "exam", "study"];
const ROUTINE_EXCLUDE_KEYWORDS = ["gym", "class", "lecture", "workout", "practice"];
const HOME_UPCOMING_LIMIT = 5;
const WORKFLOW_BUCKET_ORDER = ["inbox", "today", "upcoming", "overdue", "done"];
const AI_MAX_SUGGESTIONS = 8;

export default function useTaskInsights({
  tasks,
  plannerSearch,
  plannerCategory,
  showCompletedTasks,
  visiblePriorities,
  aiPlanningPrompt,
}) {
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
  }, [plannerCategory, plannerSearch, tasks, visiblePriorities]);

  const filteredPlannerTasks = useMemo(() => {
    if (showCompletedTasks) return basePlannerTasks;
    return basePlannerTasks.filter((task) => !task.completed_at);
  }, [basePlannerTasks, showCompletedTasks]);

  const homeStats = useMemo(() => {
    const highPriorityCount = tasks.filter((task) => task.priority === "high").length;
    const timedCount = tasks.filter((task) => task.start_time && task.end_time).length;
    const completedCount = tasks.filter((task) => Boolean(task.completed_at)).length;
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

  const todayPlanSuggestions = useMemo(() => buildSmartPlanSuggestions(tasks), [tasks]);

  const aiPlanningContext = useMemo(() => {
    const now = new Date();
    const windows = buildPlanningWindows(tasks, now);
    const candidates = getAutoPlanCandidates(tasks, now, { includeUpcoming: true })
      .slice(0, 12)
      .map((task) => ({
        id: String(task.id),
        title: task.title || "Untitled task",
        category: task.category || "other",
        priority: task.priority || "medium",
        bucket: getTaskWorkflowBucket(task, now),
        estimatedDurationMinutes: task.estimated_duration_minutes || 60,
        preferredTimeWindow: task.preferred_time_window || "any",
        dueDate: task.due_date || null,
        description: String(task.description || "").slice(0, 400),
      }));

    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      now: now.toISOString(),
      userPrompt: aiPlanningPrompt.trim(),
      maxSuggestions: AI_MAX_SUGGESTIONS,
      freeWindows: windows.map((window) => ({
        start: window.start.toISOString(),
        end: window.end.toISOString(),
        label: `${formatPlanSuggestionDay(window.start)} - ${window.start.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })} - ${window.end.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}`,
      })),
      tasks: candidates,
    };
  }, [aiPlanningPrompt, tasks]);

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

  return {
    actionableProjectTasks,
    actionableWorkflowBuckets,
    aiPlanningContext,
    basePlannerTasks,
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
  };
}
