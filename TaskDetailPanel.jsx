import React, { useState } from "react";
import { supabase } from "../utils/supabase";
import { toast } from "react-hot-toast";

/* ------------------------------------
   Local date/time helpers
------------------------------------ */

function formatLocalDate(d) {
    return d.toLocaleDateString("en-CA");
}

function formatLocalTime(d) {
    return d.toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit"
    });
}

export default function TaskDetailPanel({
    task,
    onClose,
    onUpdated,
    onDeleted
}) {
    if (!task) return null;

    /* ------------------------------------
       INITIAL STATE
    ------------------------------------ */

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

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    /* ------------------------------------
       SAVE
    ------------------------------------ */

    async function handleSave() {
        setSaving(true);
        setError("");

        let startIso = null;
        let endIso = null;
        let dueIso = null;

        if (isTimed) {
            const startDt = new Date(`${date}T${startTime}`);
            const endDt = new Date(`${date}T${endTime}`);

            startIso = startDt.toISOString();
            endIso = endDt.toISOString();
            dueIso = endIso;
        } else {
            const d = new Date(`${date}T00:00`);
            dueIso = d.toISOString();
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
                start_time: startIso,
                end_time: endIso,
                due_date: dueIso
            })
            .eq("id", task.id);

        setSaving(false);

        if (updateErr) {
            toast.error(updateErr.message);
            setSaving(false);
            return;
        }

        toast.success("Task updated");
        onUpdated?.();
        onClose();
    }

    /* ------------------------------------
       DELETE
    ------------------------------------ */

    async function handleDelete() {
        if (!window.confirm("Delete this task?")) return;

        const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", task.id);

        if (error) {
            toast.error(error.message);
            return;
        }

        onDeleted?.();
        toast.success("Task deleted");
        onClose();
    }

    /* ------------------------------------
       RENDER
    ------------------------------------ */

    return (
        <>
            <div className="panel-overlay" onClick={onClose} />

            <aside className="side-panel">
                <header className="panel-header">
                    <h2>Edit Task</h2>
                    <button className="icon-btn" onClick={onClose}>×</button>
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

                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>

                <footer className="panel-footer">
                    <button className="btn ghost" onClick={handleDelete}>
                        Delete
                    </button>

                    <button
                        className="btn primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? "Saving…" : "Save changes"}
                    </button>
                </footer>
            </aside>
        </>
    );
}