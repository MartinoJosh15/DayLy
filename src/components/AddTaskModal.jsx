import React, { useMemo, useState } from "react";
import { supabase } from "../utils/supabase";
import { toast } from "react-hot-toast";

const DEFAULT_CATEGORY_OPTIONS = [
  "school",
  "work",
  "personal",
  "health",
  "errands",
  "other",
];

const CATEGORY_LABELS = {
  school: "School",
  work: "Work",
  personal: "Personal",
  health: "Health",
  errands: "Errands",
  other: "Other",
};

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

function formatLocalTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

export default function AddTaskModal({
  initialDateTime,
  onClose,
  onCreated,
  defaultCategory = "other",
  categoryOptions,
}) {
  const initialDate = initialDateTime
    ? initialDateTime.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const initialTime = initialDateTime ? formatLocalTime(initialDateTime) : "09:00";
  const initialEndTime = initialDateTime ? formatLocalTime(addMinutes(initialDateTime, 60)) : "10:00";

  const categoryList = useMemo(() => {
    const source =
      Array.isArray(categoryOptions) && categoryOptions.length
        ? categoryOptions
        : DEFAULT_CATEGORY_OPTIONS;

    if (source.includes(defaultCategory)) return source;
    return [defaultCategory, ...source];
  }, [categoryOptions, defaultCategory]);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [isTimed, setIsTimed] = useState(true);
  const [startTime, setStartTime] = useState(initialTime);
  const [endTime, setEndTime] = useState(initialEndTime);

  const [category, setCategory] = useState(defaultCategory);
  const [priority, setPriority] = useState("medium");
  const [repeat, setRepeat] = useState("none");
  const [repeatDays, setRepeatDays] = useState([]);
  const [location, setLocation] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState(isTimed ? 60 : 45);
  const [preferredTimeWindow, setPreferredTimeWindow] = useState("any");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    if (repeat === "weekly" && !repeatDays.length) {
      setError("Choose at least one day for a weekly repeat");
      return;
    }

    setSaving(true);
    setError("");

    let startUTC = null;
    let endUTC = null;

    if (isTimed) {
      const localStart = new Date(`${date}T${startTime}`);
      const localEnd = new Date(`${date}T${endTime}`);

      if (localEnd <= localStart) {
        setSaving(false);
        setError("End time must be after start time");
        return;
      }

      startUTC = localStart.toISOString();
      endUTC = localEnd.toISOString();
    }

    const { error: insertError } = await supabase.from("tasks").insert({
      title,
      category,
      priority,
      repeat,
      repeat_days: repeat === "weekly" ? repeatDays : [],
      location: location || null,
      estimated_duration_minutes: Number(estimatedDuration) || null,
      preferred_time_window: preferredTimeWindow,
      due_date: new Date(`${date}T00:00`).toISOString(),
      start_time: startUTC,
      end_time: endUTC,
    });

    setSaving(false);

    if (insertError) {
      toast.error(insertError.message);
      return;
    }

    toast.success("Task added");
    onCreated();
  }

  function toggleRepeatDay(day) {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day]
    );
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />

      <div className="modal-card">
        <header className="modal-header">
          <h2>Add Task</h2>
          <button className="icon-btn" onClick={onClose}>
            X
          </button>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <div className="form-group">
          <label>Title</label>
          <input
            className="input-lg"
            placeholder="Task name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="card-section">
          <div className="row">
            <div className="col">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {isTimed && (
              <>
                <div className="col">
                  <label>Start</label>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>

                <div className="col">
                  <label>End</label>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={isTimed} onChange={(e) => setIsTimed(e.target.checked)} />
            Has specific time
          </label>
        </div>

        <div className="card-section">
          <div className="row">
            <div className="col">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categoryList.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value] || value}
                  </option>
                ))}
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
        </div>

        <div className="form-group">
          <label>Location</label>
          <input placeholder="Optional" value={location} onChange={(e) => setLocation(e.target.value)} />
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

        <footer className="modal-footer">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Add Task"}
          </button>
        </footer>
      </div>
    </>
  );
}
