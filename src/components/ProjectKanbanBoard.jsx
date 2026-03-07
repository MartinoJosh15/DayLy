import { useMemo, useState } from "react";

const KANBAN_COLUMNS = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "done", title: "Done" },
];

const PRIORITY_LABELS = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function normalizeKanbanStatus(value) {
  if (value === "todo" || value === "in_progress" || value === "done") {
    return value;
  }

  return "todo";
}

function formatDueDate(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function sortByDueDate(a, b) {
  const aValue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
  const bValue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
  return aValue - bValue;
}

export default function ProjectKanbanBoard({
  tasks = [],
  statusByTask = {},
  onStatusChange,
  onTaskClick,
}) {
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dropColumnId, setDropColumnId] = useState(null);

  const groupedTasks = useMemo(() => {
    const initial = {
      todo: [],
      in_progress: [],
      done: [],
    };

    const sortedTasks = [...tasks].sort(sortByDueDate);
    for (const task of sortedTasks) {
      const mapped = normalizeKanbanStatus(statusByTask[String(task.id)]);
      initial[mapped].push(task);
    }

    return initial;
  }, [tasks, statusByTask]);

  const taskMap = useMemo(() => {
    const map = new Map();
    for (const task of tasks) {
      map.set(String(task.id), task);
    }
    return map;
  }, [tasks]);

  function handleDragStart(event, taskId) {
    const id = String(taskId);
    setDraggedTaskId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function handleDragEnd() {
    setDraggedTaskId(null);
    setDropColumnId(null);
  }

  function handleDragOver(event, columnId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropColumnId !== columnId) {
      setDropColumnId(columnId);
    }
  }

  function handleDrop(event, columnId) {
    event.preventDefault();
    const rawId = event.dataTransfer.getData("text/plain") || draggedTaskId;

    if (!rawId) {
      setDropColumnId(null);
      return;
    }

    const task = taskMap.get(String(rawId));
    const nextStatus = normalizeKanbanStatus(columnId);
    const currentStatus = normalizeKanbanStatus(statusByTask[String(rawId)]);

    if (task && currentStatus !== nextStatus) {
      onStatusChange?.(task.id, nextStatus);
    }

    setDraggedTaskId(null);
    setDropColumnId(null);
  }

  if (!tasks.length) {
    return (
      <div className="kanban-empty-state">
        <h3>No work-focused tasks yet</h3>
        <p>Add school/work tasks or import Canvas assignments to fill this board.</p>
      </div>
    );
  }

  return (
    <div className="kanban-grid">
      {KANBAN_COLUMNS.map((column) => (
        <section key={column.id} className="kanban-column">
          <header className="kanban-column-header">
            <h3>{column.title}</h3>
            <span>{groupedTasks[column.id].length}</span>
          </header>

          <div
            className={`kanban-column-body ${dropColumnId === column.id ? "drag-over" : ""}`}
            onDragOver={(event) => handleDragOver(event, column.id)}
            onDrop={(event) => handleDrop(event, column.id)}
          >
            {groupedTasks[column.id].map((task) => {
              const priority = task.priority || "medium";
              const isDragging = draggedTaskId === String(task.id);
              return (
                <article
                  key={task.id}
                  className={`kanban-card ${isDragging ? "is-dragging" : ""}`}
                  onClick={() => onTaskClick?.(task)}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(event) => handleDragStart(event, task.id)}
                  onDragEnd={handleDragEnd}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onTaskClick?.(task);
                    }
                  }}
                >
                  <div className="kanban-card-title">{task.title}</div>

                  <div className="kanban-card-meta">
                    <span className="kanban-meta-pill">{task.category || "other"}</span>
                    <span className={`kanban-meta-pill priority-${priority}`}>
                      {PRIORITY_LABELS[priority] || "Medium"}
                    </span>
                    <span className="kanban-meta-pill">{formatDueDate(task.due_date)}</span>
                  </div>

                  <div className="kanban-drag-hint">Drag to another column</div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
