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

function normalizeKanbanStatus(value) {
  if (value === "todo" || value === "in_progress" || value === "done") {
    return value;
  }
  return "todo";
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

  const monthTasks = tasks.filter((task) => visiblePriorities[task.priority || "medium"]);

  const homeStats = useMemo(() => {
    const highPriorityCount = tasks.filter((t) => t.priority === "high").length;
    const timedCount = tasks.filter((t) => t.start_time && t.end_time).length;
    return {
      total: tasks.length,
      high: highPriorityCount,
      timed: timedCount,
    };
  }, [tasks]);

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
        normalizeKanbanStatus(task.kanban_status),
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

  function handleTaskClick(task) {
    setSelectedTask(task);
  }

  function handleTaskCreated() {
    setShowModal(false);
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
      const response = await fetch("/api/canvas-scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          days: 14,
          includeOverdue: false,
        }),
      });

      const result = await response.json();

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

  return (
    <>
      <Toaster position="top-right" />

      {activeModule === "home" ? (
        <div className="home-page">
          <header className="home-header">
            <div className="home-brand">
              <img src={logo} alt="DayLy logo" className="home-logo" />
              <div>
                <div className="home-kicker">Multi-Use Workspace</div>
                <h1>DayLy Platform</h1>
              </div>
            </div>

            <button className="topbar-btn" onClick={toggleTheme}>
              {theme === "light" ? "Enable Dark Mode" : "Disable Dark Mode"}
            </button>
          </header>

          <section className="home-hero">
            <h2>Choose your workflow</h2>
            <p>
              Start from one central hub and expand into planners, project boards, habits, and
              more.
            </p>
          </section>

          <section className="home-stats">
            <article className="home-stat-card">
              <span>Total Tasks</span>
              <strong>{homeStats.total}</strong>
            </article>
            <article className="home-stat-card">
              <span>High Priority</span>
              <strong>{homeStats.high}</strong>
            </article>
            <article className="home-stat-card">
              <span>Timed Tasks</span>
              <strong>{homeStats.timed}</strong>
            </article>
          </section>

          <section className="module-grid">
            {MODULES.map((module) => {
              const live = module.status === "Live";
              return (
                <article key={module.id} className={`module-card ${live ? "live" : ""}`}>
                  <div className="module-status">{module.status}</div>
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

            {isProjectsModule && (
              <div className="kanban-summary">
                Showing {actionableProjectTasks.length} work-focused tasks.
                {hiddenProjectCount > 0 && ` ${hiddenProjectCount} routine tasks are hidden.`}
              </div>
            )}
          </aside>

          <main className="main">
            {isPlannerModule ? (
              <header className="topbar">
                <div className="topbar-left">
                  <button
                    className="topbar-btn"
                    onClick={() => {
                      const d = new Date(currentDate);
                      calendarView === "week"
                        ? d.setDate(d.getDate() - 7)
                        : d.setMonth(d.getMonth() - 1);
                      setCurrentDate(d);
                    }}
                  >
                    Prev
                  </button>

                  <button className="topbar-btn" onClick={() => setCurrentDate(new Date())}>
                    Today
                  </button>

                  <button
                    className="topbar-btn"
                    onClick={() => {
                      const d = new Date(currentDate);
                      calendarView === "week"
                        ? d.setDate(d.getDate() + 7)
                        : d.setMonth(d.getMonth() + 1);
                      setCurrentDate(d);
                    }}
                  >
                    Next
                  </button>
                </div>

                <div className="topbar-title">
                  {currentDate.toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </header>
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
                <FullCalendarView
                  tasks={calendarView === "month" ? monthTasks : tasks}
                  view={calendarView}
                  currentDate={currentDate}
                  onTimeSlotClick={handleTimeSlotClick}
                  onTaskClick={handleTaskClick}
                  onEventTimeChange={handleEventTimeChange}
                />
              ) : (
                <ProjectKanbanBoard
                  tasks={actionableProjectTasks}
                  statusByTask={kanbanStatusByTask}
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
