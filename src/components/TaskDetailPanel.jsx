import React, { useState } from "react";
import { supabase } from "../utils/supabase";
import { toast } from "react-hot-toast";

const WEEKDAY_OPTIONS = [
  { value: "mon", label: "M" },
  { value: "tue", label: "T" },
  { value: "wed", label: "W" },
  { value: "thu", label: "Th" },
  { value: "fri", label: "F" },
  { value: "sat", label: "Sa" },
  { value: "sun", label: "Su" },
];

const TIME_WINDOW_OPTIONS = [
  { value: "any", label: "Any time" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

function formatLocalDate(d) {
  return d.toLocaleDateString("en-CA");
}

function formatLocalTime(d) {
  return d.toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TaskDetailPanelContent({ task, onClose, onUpdated, onDeleted, onCompletionToggle }) {
  const isTimedInitial = !!task.start_time;
  const startObj = task.start_time ? new Date(task.start_time) : null;
  const endObj = task.end_time ? new Date(task.end_time) : null;

  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState(task.category || "personal");
  const [priority, setPriority] = useState(task.priority || "medium");
  const [description, setDescription] = useState(task.description || "");
  const [isTimed, setIsTimed] = useState(isTimedInitial);
  const [date, setDate] = useState(
    startObj
      ? formatLocalDate(startObj)
      : task.due_date
        ? formatLocalDate(new Date(task.due_date))
        : ""
  );
  const [startTime, setStartTime] = useState(
    startObj ? formatLocalTime(startObj) : "09:00"
  );
  const [endTime, setEndTime] = useState(
    endObj ? formatLocalTime(endObj) : "10:00"
  );
  const [repeat, setRepeat] = useState(task.repeat || "none");
  const [repeatDays, setRepeatDays] = useState(task.repeat_days || []);
  const [isCompleted, setIsCompleted] = useState(Boolean(task.completed_at));
  const [estimatedDuration, setEstimatedDuration] = useState(
    task.estimated_duration_minutes || (isTimedInitial ? 60 : 45)
  );
  const [preferredTimeWindow, setPreferredTimeWindow] = useState(
    task.preferred_time_window || "any"
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");

    if (!title.trim()) {
      setSaving(false);
      setError("Title is required");
      return;
    }

    if (repeat === "weekly" && !repeatDays.length) {
      setSaving(false);
      setError("Choose at least one day for a weekly repeat");
      return;
    }

    let startIso = null;
    let endIso = null;
    const dueIso = new Date(`${date}T00:00`).toISOString();

    if (isTimed) {
      const startDt = new Date(`${date}T${startTime}`);
      const endDt = new Date(`${date}T${endTime}`);

      if (endDt <= startDt) {
        setSaving(false);
        setError("End time must be after start time");
        return;
      }

      startIso = startDt.toISOString();
      endIso = endDt.toISOString();
    }

    const { error: updateErr } = await supabase
      .from("tasks")
      .update({
        title,
        category,
        priority,
        description,
        repeat,
        repeat_days: repeat === "weekly" ? repeatDays : [],
        estimated_duration_minutes: Number(estimatedDuration) || null,
        preferred_time_window: preferredTimeWindow,
        start_time: startIso,
        end_time: endIso,
        due_date: dueIso,
      })
      .eq("id", task.id);

    setSaving(false);

    if (updateErr) {
      toast.error(updateErr.message);
      return;
    }

    toast.success("Task updated");
    onUpdated?.();
    onClose();
  }

  async function handleDelete() {
    if (!window.confirm("Delete this task?")) return;

    const { error: deleteErr } = await supabase.from("tasks").delete().eq("id", task.id);

    if (deleteErr) {
      toast.error(deleteErr.message);
      return;
    }

    onDeleted?.();
    toast.success("Task deleted");
    onClose();
  }

  async function handleCompletionChange(nextValue) {
    setIsCompleted(nextValue);

    const result = await onCompletionToggle?.(task.id, nextValue);
    if (result === false) {
      setIsCompleted(!nextValue);
    }
  }

  function toggleRepeatDay(day) {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day]
    );
  }

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />

      <aside className="side-panel">
        <header className="panel-header">
          <h2>Edit Task</h2>
          <button className="icon-btn" onClick={onClose}>
            X
          </button>
        </header>

        <div className="panel-body">
          {error && <div className="error-banner">{error}</div>}

          <div className="form-group">
            <label>Title</label>
            <input
              className="input-lg"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="row">
            <div className="col">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="personal">Personal</option>
                <option value="school">School</option>
                <option value="work">Work</option>
                <option value="health">Health</option>
                <option value="errands">Errands</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="col">
              <label>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="card-section">
            <div className="row">
              <div className="col">
                <label>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              {isTimed && (
                <>
                  <div className="col">
                    <label>Start</label>
                    <input
                      type="time"
                      step="900"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>

                  <div className="col">
                    <label>End</label>
                    <input
                      type="time"
                      step="900"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={isTimed}
                onChange={(e) => setIsTimed(e.target.checked)}
              />
              Has specific time
            </label>
          </div>

          <div className="form-group">
            <label>Repeat</label>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {repeat === "weekly" && (
            <div className="form-group">
              <label>Repeat on</label>
              <div className="weekday-picker">
                {WEEKDAY_OPTIONS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={`weekday-chip ${repeatDays.includes(day.value) ? "active" : ""}`}
                    onClick={() => toggleRepeatDay(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="card-section">
            <div className="row">
              <div className="col">
                <label>Estimated duration</label>
                <select
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(e.target.value)}
                >
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                  <option value="180">3 hours</option>
                </select>
              </div>

              <div className="col">
                <label>Preferred time</label>
                <select
                  value={preferredTimeWindow}
                  onChange={(e) => setPreferredTimeWindow(e.target.value)}
                >
                  {TIME_WINDOW_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={isCompleted}
                onChange={(e) => handleCompletionChange(e.target.checked)}
              />
              Mark task as completed
            </label>
          </div>
        </div>

        <footer className="panel-footer">
          <button className="btn ghost" onClick={handleDelete}>
            Delete
          </button>

          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </footer>
      </aside>
    </>
  );
}

export default function TaskDetailPanel(props) {
  if (!props.task) return null;
  return <TaskDetailPanelContent {...props} />;
}
