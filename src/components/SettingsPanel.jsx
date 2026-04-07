import { useMemo, useState } from "react";

const REMINDER_OFFSET_OPTIONS = [
  { value: "5", label: "5 minutes before" },
  { value: "10", label: "10 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
];

const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

function formatReminderDateTime(value, timezone) {
  if (!value) return "No reminders queued";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No reminders queued";

  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || "America/New_York",
  });
}

function buildDraftSettings(notificationSettings) {
  const nextQuietStart = notificationSettings?.quiet_hours_start || "22:00";
  const nextQuietEnd = notificationSettings?.quiet_hours_end || "07:00";

  return {
    remindersEnabled: Boolean(notificationSettings?.reminders_enabled ?? true),
    defaultReminderOffset: String(notificationSettings?.default_reminder_offset_minutes ?? 15),
    timezone: notificationSettings?.timezone || "America/New_York",
    quietHoursEnabled: Boolean(
      notificationSettings?.quiet_hours_start && notificationSettings?.quiet_hours_end
    ),
    quietHoursStart: nextQuietStart.slice(0, 5),
    quietHoursEnd: nextQuietEnd.slice(0, 5),
  };
}

export default function SettingsPanel({
  open,
  onClose,
  theme,
  toggleTheme,
  currentUserEmail = "",
  notificationSettings,
  notificationSettingsLoading = false,
  notificationSettingsSaving = false,
  notificationStats,
  deviceTokens = [],
  deviceTokenSaving = false,
  onSaveNotificationSettings,
  onRegisterDeviceToken,
  onDeleteDeviceToken,
}) {
  const initialDraft = buildDraftSettings(notificationSettings);
  const [remindersEnabled, setRemindersEnabled] = useState(initialDraft.remindersEnabled);
  const [defaultReminderOffset, setDefaultReminderOffset] = useState(initialDraft.defaultReminderOffset);
  const [timezone, setTimezone] = useState(initialDraft.timezone);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(initialDraft.quietHoursEnabled);
  const [quietHoursStart, setQuietHoursStart] = useState(initialDraft.quietHoursStart);
  const [quietHoursEnd, setQuietHoursEnd] = useState(initialDraft.quietHoursEnd);
  const [deviceToken, setDeviceToken] = useState("");
  const [devicePlatform, setDevicePlatform] = useState("ios");
  const [deviceLabel, setDeviceLabel] = useState("");

  const nextReminderLabel = useMemo(
    () => formatReminderDateTime(notificationStats?.nextReminderAt, timezone),
    [notificationStats?.nextReminderAt, timezone]
  );

  if (!open) return null;

  async function handleSave() {
    if (!onSaveNotificationSettings) return;

    await onSaveNotificationSettings({
      reminders_enabled: remindersEnabled,
      default_reminder_offset_minutes: Number(defaultReminderOffset) || 15,
      timezone,
      quiet_hours_start: quietHoursEnabled ? quietHoursStart : null,
      quiet_hours_end: quietHoursEnabled ? quietHoursEnd : null,
    });
  }

  async function handleRegisterToken() {
    if (!onRegisterDeviceToken) return;

    await onRegisterDeviceToken({
      token: deviceToken,
      platform: devicePlatform,
      deviceLabel,
    });

    setDeviceToken("");
    setDeviceLabel("");
  }

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />

      <aside className="side-panel">
        <header className="panel-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose}>
            X
          </button>
        </header>

        <div className="panel-body">
          <div className="form-group">
            <label>Appearance</label>
            <button className="btn ghost" type="button" onClick={toggleTheme}>
              Switch to {theme === "light" ? "Dark" : "Light"} mode
            </button>
          </div>

          <div className="card-section">
            <div className="form-group">
              <label>Notifications</label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={remindersEnabled}
                  onChange={(event) => setRemindersEnabled(event.target.checked)}
                  disabled={notificationSettingsLoading || notificationSettingsSaving}
                />
                Enable reminders for this account
              </label>
            </div>

            <div className="row">
              <div className="col">
                <label>Default reminder timing</label>
                <select
                  value={defaultReminderOffset}
                  onChange={(event) => setDefaultReminderOffset(event.target.value)}
                  disabled={!remindersEnabled || notificationSettingsLoading || notificationSettingsSaving}
                >
                  {REMINDER_OFFSET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col">
                <label>Timezone</label>
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  disabled={notificationSettingsLoading || notificationSettingsSaving}
                >
                  {TIMEZONE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={quietHoursEnabled}
                  onChange={(event) => setQuietHoursEnabled(event.target.checked)}
                  disabled={!remindersEnabled || notificationSettingsLoading || notificationSettingsSaving}
                />
                Use quiet hours
              </label>
            </div>

            {quietHoursEnabled && (
              <div className="row">
                <div className="col">
                  <label>Quiet hours start</label>
                  <input
                    type="time"
                    value={quietHoursStart}
                    onChange={(event) => setQuietHoursStart(event.target.value)}
                    disabled={!remindersEnabled || notificationSettingsLoading || notificationSettingsSaving}
                  />
                </div>

                <div className="col">
                  <label>Quiet hours end</label>
                  <input
                    type="time"
                    value={quietHoursEnd}
                    onChange={(event) => setQuietHoursEnd(event.target.value)}
                    disabled={!remindersEnabled || notificationSettingsLoading || notificationSettingsSaving}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="card-section">
            <div className="form-group">
              <label>Reminder Overview</label>
              {currentUserEmail ? (
                <div className="settings-meta-text">Signed in as {currentUserEmail}</div>
              ) : (
                <div className="settings-meta-text">Sign in to save reminder settings.</div>
              )}
            </div>

            <div className="settings-stats-grid">
              <article className="settings-stat-card">
                <span>Tasks with reminders</span>
                <strong>{notificationStats?.enabledTaskCount ?? 0}</strong>
              </article>
              <article className="settings-stat-card">
                <span>Queued reminders</span>
                <strong>{notificationStats?.queuedReminderCount ?? 0}</strong>
              </article>
            </div>

            <div className="settings-meta-block">
              <span className="settings-meta-label">Next reminder</span>
              <strong>{nextReminderLabel}</strong>
            </div>

            <div className="settings-reminder-list">
              {notificationStats?.upcomingReminders?.length ? (
                notificationStats.upcomingReminders.map((reminder) => (
                  <div key={reminder.id} className="settings-reminder-item">
                    <div className="settings-reminder-title">{reminder.taskTitle}</div>
                    <div className="settings-reminder-time">
                      {formatReminderDateTime(reminder.scheduledFor, timezone)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="planner-agenda-empty">
                  No pending reminders yet. Turn reminders on for tasks to start building your queue.
                </div>
              )}
            </div>
          </div>

          <div className="card-section">
            <div className="form-group">
              <label>Device Tokens</label>
              <div className="settings-meta-text">
                Paste a real Expo push token from a test device to let the reminder worker deliver pushes.
              </div>
            </div>

            <div className="form-group">
              <label>Expo push token</label>
              <textarea
                className="settings-token-input"
                placeholder="ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
                value={deviceToken}
                onChange={(event) => setDeviceToken(event.target.value)}
                disabled={!currentUserEmail || deviceTokenSaving}
              />
            </div>

            <div className="row">
              <div className="col">
                <label>Platform</label>
                <select
                  value={devicePlatform}
                  onChange={(event) => setDevicePlatform(event.target.value)}
                  disabled={!currentUserEmail || deviceTokenSaving}
                >
                  <option value="ios">iOS</option>
                  <option value="android">Android</option>
                  <option value="web">Web</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>

              <div className="col">
                <label>Device label</label>
                <input
                  value={deviceLabel}
                  placeholder="My iPhone"
                  onChange={(event) => setDeviceLabel(event.target.value)}
                  disabled={!currentUserEmail || deviceTokenSaving}
                />
              </div>
            </div>

            <div className="settings-token-actions">
              <button
                className="btn ghost"
                type="button"
                onClick={handleRegisterToken}
                disabled={!currentUserEmail || !deviceToken.trim() || deviceTokenSaving}
              >
                {deviceTokenSaving ? "Saving token..." : "Save device token"}
              </button>
            </div>

            <div className="settings-reminder-list">
              {deviceTokens.length ? (
                deviceTokens.map((tokenRow) => (
                  <div key={tokenRow.id} className="settings-reminder-item">
                    <div className="settings-token-row">
                      <div>
                        <div className="settings-reminder-title">
                          {tokenRow.deviceLabel || tokenRow.platform || "Unnamed device"}
                        </div>
                        <div className="settings-reminder-time">
                          {tokenRow.token.slice(0, 22)}
                          {tokenRow.token.length > 22 ? "..." : ""}
                        </div>
                      </div>
                      <button
                        className="btn ghost settings-token-delete"
                        type="button"
                        onClick={() => onDeleteDeviceToken?.(tokenRow.id)}
                        disabled={deviceTokenSaving}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="planner-agenda-empty">
                  No device tokens saved yet. Without one, `send-reminders` can queue reminders but cannot deliver pushes.
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="panel-footer">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="btn primary"
            onClick={handleSave}
            disabled={!currentUserEmail || notificationSettingsLoading || notificationSettingsSaving}
          >
            {notificationSettingsSaving ? "Saving..." : "Save settings"}
          </button>
        </footer>
      </aside>
    </>
  );
}
