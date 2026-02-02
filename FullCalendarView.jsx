import { useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import rrulePlugin from "@fullcalendar/rrule";

/* ================== CONFIG ================== */

const CATEGORY_COLORS = {
    school: "#A7C7E7",
    work: "#C6E5B1",
    personal: "#F7DDAA",
    health: "#F5A6A6",
    errands: "#E8D3FF",
    other: "#E2E2E2"
};

const PRIORITY_COLORS = {
    high: "#dd4a4ac7",
    medium: "#f1c205a6",
    low: "#4ade80d8"
};

const WEEKDAY_MAP = {
    sun: "su",
    mon: "mo",
    tue: "tu",
    wed: "we",
    thu: "th",
    fri: "fr",
    sat: "sa"
};

/* ================== HELPERS ================== */

function diffMinutes(task) {
    if (!task.start_time || !task.end_time) return 30;
    const start = new Date(task.start_time);
    const end = new Date(task.end_time);
    return Math.max(15, (end - start) / 60000);
}

function mapTaskToEvent(task) {
    const base = {
        id: task.id,
        title: task.title,
        extendedProps: task,
        allDay: !task.start_time
    };

    if (!task.repeat || task.repeat === "none") {
        return {
            ...base,
            start: task.start_time || task.due_date,
            end: task.end_time || undefined
        };
    }

    if (task.repeat === "daily") {
        return {
            ...base,
            rrule: {
                freq: "daily",
                dtstart: task.start_time || task.due_date
            },
            duration: task.start_time
                ? { minutes: diffMinutes(task) }
                : undefined
        };
    }

    if (task.repeat === "weekly") {
        return {
            ...base,
            rrule: {
                freq: "weekly",
                byweekday: (task.repeat_days || []).map(
                    (d) => WEEKDAY_MAP[d]
                ),
                dtstart: task.start_time || task.due_date
            },
            duration: task.start_time
                ? { minutes: diffMinutes(task) }
                : undefined
        };
    }

    if (task.repeat === "weekdays") {
        return {
            ...base,
            rrule: {
                freq: "weekly",
                byweekday: ["mo", "tu", "we", "th", "fr"],
                dtstart: task.start_time || task.due_date
            },
            duration: task.start_time
                ? { minutes: diffMinutes(task) }
                : undefined
        };
    }

    if (task.repeat === "monthly") {
        return {
            ...base,
            rrule: {
                freq: "monthly",
                dtstart: task.start_time || task.due_date
            },
            duration: task.start_time
                ? { minutes: diffMinutes(task) }
                : undefined
        };
    }

    return null;
}

/* ================== COMPONENT ================== */

export default function FullCalendarView({
    tasks = [],
    view,                // "week" | "month"
    currentDate,
    onTimeSlotClick,
    onTaskClick,
    onEventTimeChange
}) {
    const calendarRef = useRef(null);

    const events = tasks.map(mapTaskToEvent).filter(Boolean);

    /* ---- Imperative date control (STABLE) ---- */
    useEffect(() => {
        if (!calendarRef.current) return;

        const api = calendarRef.current.getApi();
        api.gotoDate(currentDate);
    }, [currentDate.getTime()]);

    /* ---- View switching (NO REMOUNT) ---- */
    useEffect(() => {
        if (!calendarRef.current) return;

        const api = calendarRef.current.getApi();
        api.changeView(
            view === "month" ? "dayGridMonth" : "timeGridWeek"
        );
    }, [view]);

    return (
        <FullCalendar
            ref={calendarRef}
            plugins={[
                timeGridPlugin,
                dayGridPlugin,
                interactionPlugin,
                rrulePlugin
            ]}
            timeZone="local"

            initialView={view === "month" ? "dayGridMonth" : "timeGridWeek"}
            headerToolbar={false}
            height="100%"
            expandRows
            nowIndicator

            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            slotDuration="00:15:00"
            allDaySlot

            events={events}

            eventDidMount={(info) => {
                const task = info.event.extendedProps;
                const viewType = info.view.type;

                let color;

                if (viewType === "timeGridWeek") {
                    color =
                        CATEGORY_COLORS[task.category] ||
                        CATEGORY_COLORS.other;
                }

                if (viewType === "dayGridMonth") {
                    color =
                        PRIORITY_COLORS[task.priority] ||
                        "#E5E7EB";
                }

                if (color) {
                    info.el.style.backgroundColor = color;
                    info.el.style.borderColor = color;
                    info.el.style.color = "#1f2937";
                }
            }}

            dateClick={(info) => {
                onTimeSlotClick(new Date(info.date));
            }}

            eventClick={(info) => {
                onTaskClick(info.event.extendedProps);
            }}

            eventDrop={(info) => {
                onEventTimeChange?.({
                    event: info.event,
                    revert: info.revert,
                });
            }}

            eventResize={(info) => {
                onEventTimeChange?.({
                    event: info.event,
                    revert: info.revert,
                });
            }}

            editable
            eventStartEditable
            eventDurationEditable
            eventResizableFromStart
            eventOverlap={false}
        />
    );
}
