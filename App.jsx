import { useEffect, useState } from "react";
import { supabase } from "./utils/supabase";

import FullCalendarView from "./components/FullCalendarView";
import AddTaskModal from "./components/AddTaskModal";
import TaskDetailPanel from "./components/TaskDetailPanel";
import SettingsPanel from "./components/SettingsPanel";
import PriorityFilter from "./components/PriorityFilter";
import { Toaster, toast } from "react-hot-toast";

import logo from "./assets/Logo.png";

export default function App() {
  /* ================= CORE STATE ================= */

  const [tasks, setTasks] = useState([]);
  const [calendarView, setCalendarView] = useState("week"); // "week" | "month"
  const [currentDate, setCurrentDate] = useState(new Date());

  /* ================= UI STATE ================= */

  const [showModal, setShowModal] = useState(false);
  const [modalInitialDateTime, setModalInitialDateTime] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

  const [theme, setTheme] = useState("light");
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ================= FILTER STATE ================= */

  const [visiblePriorities, setVisiblePriorities] = useState({
    high: true,
    medium: true,
    low: true,
  });

  /* ================= THEME ================= */

  useEffect(() => {
    document.body.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  /* ================= DATA ================= */

  async function fetchTasks() {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching tasks:", error);
      return;
    }

    setTasks(data || []);
  }

  useEffect(() => {
    fetchTasks();
  }, []);

  /* ================= DERIVED DATA ================= */

  const monthTasks = tasks.filter(
    (task) => visiblePriorities[task.priority || "medium"]
  );

  /* ================= HANDLERS ================= */

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

    // Ignore all-day drags for now
    if (!event.start || !event.end || event.allDay) return;

    const startIso = event.start.toISOString();
    const endIso = event.end.toISOString();

    if (hasOverlap(task.id, startIso, endIso)) {
      revert();
      toast.error("That time overlaps another task.");
      return;
    }

    const { error } = await supabase
      .from("tasks")
      .update({
        start_time: startIso,
        end_time: endIso
      })
      .eq("id", task.id);

    if (error) {
      revert();
      alert(error.message);
      return;
    }

    fetchTasks();
  }



  /* ================= RENDER ================= */

  return (
    <>
      <Toaster position="top-right" />

      <div className="app-shell">
        {/* ========== SIDEBAR ========== */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <img src={logo} alt="DayLy logo" className="sidebar-logo" />
            <span className="sidebar-title">DayLy</span>
          </div>

          {/* Views */}
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

          {/* Actions */}
          <div className="sidebar-section-label">Actions</div>
          <div className="sidebar-nav">
            <button
              className="sidebar-btn primary"
              onClick={() => {
                setModalInitialDateTime(new Date());
                setShowModal(true);
              }}
            >
              + Add Task
            </button>
          </div>

          {/* Theme & Settings */}
          <div className="sidebar-section-label">Theme & Settings</div>
          <div className="sidebar-nav">
            <button className="sidebar-btn" onClick={toggleTheme}>
              {theme === "light" ? "Enable Dark Mode" : "Disable Dark Mode"}
            </button>
            <button
              className="sidebar-btn"
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </button>
          </div>

          {/* Priority Filter (MONTH ONLY) */}
          {calendarView === "month" && (
            <>
              <div className="sidebar-section-label">Priority</div>
              <PriorityFilter
                visible={visiblePriorities}
                onChange={setVisiblePriorities}
              />
            </>
          )}
        </aside>

        {/* ========== MAIN ========== */}
        <main className="main">
          <header className="topbar">
            <div className="topbar-left">
              <button
                onClick={() => {
                  const d = new Date(currentDate);
                  calendarView === "week"
                    ? d.setDate(d.getDate() - 7)
                    : d.setMonth(d.getMonth() - 1);
                  setCurrentDate(d);
                }}
              >
                ←
              </button>

              <button onClick={() => setCurrentDate(new Date())}>
                Today
              </button>

              <button
                onClick={() => {
                  const d = new Date(currentDate);
                  calendarView === "week"
                    ? d.setDate(d.getDate() + 7)
                    : d.setMonth(d.getMonth() + 1);
                  setCurrentDate(d);
                }}
              >
                →
              </button>
            </div>

            <div className="topbar-title">
              {currentDate.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </div>
          </header>

          <div className="main-content">
            <FullCalendarView
              tasks={calendarView === "month" ? monthTasks : tasks}
              view={calendarView}
              currentDate={currentDate}
              onTimeSlotClick={handleTimeSlotClick}
              onTaskClick={handleTaskClick}
              onEventTimeChange={handleEventTimeChange}
            />
          </div>

          {/* ========== MODALS ========== */}
          {showModal && (
            <AddTaskModal
              initialDateTime={modalInitialDateTime}
              onClose={() => setShowModal(false)}
              onCreated={handleTaskCreated}
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
    </>
  );
}
