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
  const [location, setLocation] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Title is required");
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
      location: location || null,
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
