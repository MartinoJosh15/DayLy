export default function TaskDetailModal({ task, onClose }) {
    if (!task) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="task-modal" onClick={(e) => e.stopPropagation()}>
                <h2>{task.title}</h2>

                <p><strong>Category:</strong> {task.category}</p>
                <p><strong>Priority:</strong> {task.priority}</p>
                <p><strong>Description:</strong> {task.description || "No description"}</p>

                <p>
                    <strong>Start:</strong> {new Date(task.start_time).toLocaleString()}
                </p>

                <p>
                    <strong>End:</strong> {new Date(task.end_time).toLocaleString()}
                </p>

                <button onClick={onClose} className="close-btn">Close</button>
            </div>
        </div>
    );
}
