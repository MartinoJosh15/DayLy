export default function PriorityFilter({ visible, onChange }) {
    function toggle(priority) {
        onChange({
            ...visible,
            [priority]: !visible[priority],
        });
    }

    return (
        <div className="priority-filter">
            <div className="priority-filter-title">Priority</div>

            <div className="priority-option" onClick={() => toggle("high")}>
                <span className="priority-dot high" />
                <span className="priority-label">High</span>
                <input
                    type="checkbox"
                    checked={visible.high}
                    readOnly
                />
            </div>

            <div className="priority-option" onClick={() => toggle("medium")}>
                <span className="priority-dot medium" />
                <span className="priority-label">Medium</span>
                <input
                    type="checkbox"
                    checked={visible.medium}
                    readOnly
                />
            </div>

            <div className="priority-option" onClick={() => toggle("low")}>
                <span className="priority-dot low" />
                <span className="priority-label">Low</span>
                <input
                    type="checkbox"
                    checked={visible.low}
                    readOnly
                />
            </div>
        </div>
    );
}