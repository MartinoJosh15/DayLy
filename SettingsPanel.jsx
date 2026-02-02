export default function SettingsPanel({ open, onClose, theme, toggleTheme }) {
    if (!open) return null;

    return (
        <>
            <div className="panel-overlay" onClick={onClose} />

            <aside className="side-panel">
                <header className="panel-header">
                    <h2>Settings</h2>
                    <button className="icon-btn" onClick={onClose}>×</button>
                </header>

                <div className="panel-body">
                    <div className="form-group">
                        <label>Appearance</label>
                        <button
                            className="btn ghost"
                            type="button"
                            onClick={toggleTheme}
                        >
                            Switch to {theme === "light" ? "Dark" : "Light"} mode
                        </button>
                    </div>

                    <div className="form-group">
                        <label>Week Start Day</label>
                        <select defaultValue="sunday">
                            <option value="sunday">Sunday</option>
                            <option value="monday">Monday</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Default Category</label>
                        <select defaultValue="personal">
                            <option value="personal">Personal</option>
                            <option value="school">School</option>
                            <option value="work">Work</option>
                            <option value="health">Health</option>
                            <option value="errands">Errands</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>

                <footer className="panel-footer">
                    <span />
                    <button className="btn primary" onClick={onClose}>
                        Done
                    </button>
                </footer>
            </aside>
        </>
    );
}
