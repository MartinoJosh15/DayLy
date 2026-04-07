import { useEffect, useMemo, useState } from "react";
import SpotifyPanel from "./SpotifyPanel";

const NOTES_STORAGE_KEY = "dayly.notes.documents";
const NOTES_ACTIVE_STORAGE_KEY = "dayly.notes.active";

function createBlankDoc() {
  const stamp = Date.now();
  return {
    id: String(stamp),
    title: "Untitled note",
    content: "",
    createdAt: new Date(stamp).toISOString(),
    updatedAt: new Date(stamp).toISOString(),
  };
}

function getDefaultDocs() {
  return [
    {
      id: "welcome-note",
      title: "Workspace draft",
      content:
        "# Start here\n\nUse this space for outlines, class notes, project thinking, or task prep.\n\n## Today\n- What matters most?\n- What blockers do you need to clear?\n- What should become a task in DayLy?\n",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

function formatUpdatedAt(value) {
  if (!value) return "Just now";

  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "Just now";
  }
}

function getWordCount(content) {
  return (content.trim().match(/\S+/g) || []).length;
}

export default function NotesDocsWorkspace({
  tasks = [],
  onTaskClick,
  createSignal = 0,
}) {
  const [docs, setDocs] = useState(() => getDefaultDocs());
  const [activeDocId, setActiveDocId] = useState(() => getDefaultDocs()[0].id);

  useEffect(() => {
    try {
      const rawDocs = localStorage.getItem(NOTES_STORAGE_KEY);
      const rawActiveId = localStorage.getItem(NOTES_ACTIVE_STORAGE_KEY);
      const parsedDocs = rawDocs ? JSON.parse(rawDocs) : null;

      if (Array.isArray(parsedDocs) && parsedDocs.length) {
        setDocs(parsedDocs);
        setActiveDocId(
          parsedDocs.some((doc) => doc.id === rawActiveId) ? rawActiveId : parsedDocs[0].id
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(docs));
  }, [docs]);

  useEffect(() => {
    if (activeDocId) {
      localStorage.setItem(NOTES_ACTIVE_STORAGE_KEY, activeDocId);
    }
  }, [activeDocId]);

  useEffect(() => {
    if (!createSignal) return;

    const nextDoc = createBlankDoc();
    setDocs((prev) => [nextDoc, ...prev]);
    setActiveDocId(nextDoc.id);
  }, [createSignal]);

  const activeDoc = useMemo(
    () => docs.find((doc) => doc.id === activeDocId) || docs[0] || createBlankDoc(),
    [docs, activeDocId]
  );

  const noteWordCount = getWordCount(activeDoc?.content || "");
  const noteTasks = useMemo(
    () =>
      tasks
        .filter((task) => !task.completed_at)
        .slice()
        .sort((a, b) => new Date(a.due_date || a.start_time || 0) - new Date(b.due_date || b.start_time || 0))
        .slice(0, 8),
    [tasks]
  );

  function createDoc() {
    const nextDoc = createBlankDoc();
    setDocs((prev) => [nextDoc, ...prev]);
    setActiveDocId(nextDoc.id);
  }

  function updateDoc(patch) {
    const nextUpdatedAt = new Date().toISOString();
    setDocs((prev) =>
      prev.map((doc) =>
        doc.id === activeDoc.id
          ? {
              ...doc,
              ...patch,
              updatedAt: nextUpdatedAt,
            }
          : doc
      )
    );
  }

  function deleteDoc(docId) {
    const remaining = docs.filter((doc) => doc.id !== docId);
    if (!remaining.length) {
      const fallback = createBlankDoc();
      setDocs([fallback]);
      setActiveDocId(fallback.id);
      return;
    }

    setDocs(remaining);
    if (docId === activeDocId) {
      setActiveDocId(remaining[0].id);
    }
  }

  return (
    <section className="notes-workspace">
      <aside className="notes-sidebar-card">
        <div className="notes-card-header">
          <div>
            <div className="notes-kicker">Documents</div>
            <h2>Your writing desk</h2>
          </div>
          <button type="button" className="btn primary notes-new-doc-btn" onClick={createDoc}>
            New Doc
          </button>
        </div>

        <div className="notes-doc-list">
          {docs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className={`notes-doc-card ${doc.id === activeDocId ? "active" : ""}`}
              onClick={() => setActiveDocId(doc.id)}
            >
              <div className="notes-doc-card-topline">
                <span>{formatUpdatedAt(doc.updatedAt)}</span>
                {docs.length > 1 ? (
                  <span
                    className="notes-doc-delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteDoc(doc.id);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        deleteDoc(doc.id);
                      }
                    }}
                  >
                    Delete
                  </span>
                ) : null}
              </div>
              <strong>{doc.title || "Untitled note"}</strong>
              <p>{(doc.content || "Start writing here...").slice(0, 110)}</p>
            </button>
          ))}
        </div>
      </aside>

      <section className="notes-editor-shell">
        <div className="notes-editor-topbar">
          <div>
            <div className="notes-kicker">Doc Editor</div>
            <h2>{activeDoc.title || "Untitled note"}</h2>
          </div>
          <div className="notes-editor-meta">
            <span>{noteWordCount} words</span>
            <span>Saved {formatUpdatedAt(activeDoc.updatedAt)}</span>
          </div>
        </div>

        <input
          className="notes-title-input"
          value={activeDoc.title}
          onChange={(event) => updateDoc({ title: event.target.value })}
          placeholder="Document title"
        />

        <textarea
          className="notes-editor"
          value={activeDoc.content}
          onChange={(event) => updateDoc({ content: event.target.value })}
          placeholder="Write ideas, outline essays, draft project plans, or map out what you need to do next."
        />
      </section>

      <aside className="notes-utility-rail">
        <SpotifyPanel />

        <section className="notes-task-card">
          <div className="notes-card-header">
            <div>
              <div className="notes-kicker">Task Context</div>
              <h2>Keep work in view</h2>
            </div>
          </div>

          <div className="notes-task-list">
            {noteTasks.length ? (
              noteTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="notes-task-item"
                  onClick={() => onTaskClick?.(task)}
                >
                  <strong>{task.title}</strong>
                  <span>
                    {task.category || "other"} •{" "}
                    {task.due_date
                      ? new Date(task.due_date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "No due date"}
                  </span>
                </button>
              ))
            ) : (
              <div className="notes-task-empty">Add tasks in the planner to reference them here while you write.</div>
            )}
          </div>
        </section>
      </aside>
    </section>
  );
}
