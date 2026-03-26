import { useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import rrulePlugin from "@fullcalendar/rrule";

const CATEGORY_COLORS = {
  school: "#A7C7E7",
  work: "#C6E5B1",
  personal: "#F7DDAA",
  health: "#F5A6A6",
  errands: "#E8D3FF",
  other: "#E2E2E2",
};

const PRIORITY_COLORS = {
  high: "#dd4a4ac7",
  medium: "#f1c205a6",
  low: "#4ade80d8",
};

const WEEKDAY_MAP = {
  sun: "su",
  mon: "mo",
  tue: "tu",
  wed: "we",
  thu: "th",
  fri: "fr",
  sat: "sa",
};

function normalizeToLocalDate(datePart, timePart) {
  if (!datePart) return null;

  if (timePart && timePart.includes("T")) {
    const d = new Date(timePart);
    return isNaN(d) ? null : d;
  }

  if (!timePart) {
    const d = new Date(datePart);
    return isNaN(d) ? null : d;
  }

  const isoDate = datePart.slice(0, 10);
  const combined = `${isoDate}T${timePart}`;
  const d = new Date(combined);
  return isNaN(d) ? null : d;
}

function diffMinutesFromDates(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) return null;
  const diff = (end.getTime() - start.getTime()) / 60000;
  return diff > 0 ? diff : null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toFloatingLocalISO(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;

  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  );
}

function mapTaskToEvent(task) {
  const start = normalizeToLocalDate(task.due_date, task.start_time);
  const end = normalizeToLocalDate(task.due_date, task.end_time);

  if (!start) {
    console.warn("Skipping invalid task:", task);
    return null;
  }

  const isTimed = !!task.start_time && !!task.end_time;
  const base = {
    id: task.id,
    title: task.title,
    extendedProps: task,
    allDay: !isTimed,
  };

  if (!task.repeat || task.repeat === "none") {
    return {
      ...base,
      start,
      end: isTimed ? end || undefined : undefined,
    };
  }

  const dtstartFloating = isTimed
    ? toFloatingLocalISO(start)
    : start.toISOString().slice(0, 10);

  if (!dtstartFloating) {
    console.warn("Bad dtstart for:", task.title, start);
    return null;
  }

  const rrule = {
    freq:
      task.repeat === "daily"
        ? "daily"
        : task.repeat === "monthly"
          ? "monthly"
          : "weekly",
    dtstart: dtstartFloating,
  };

  if (task.repeat === "weekly" && task.repeat_days?.length) {
    rrule.byweekday = task.repeat_days.map((d) => WEEKDAY_MAP[d]);
  }

  if (task.repeat === "weekdays") {
    rrule.byweekday = ["mo", "tu", "we", "th", "fr"];
  }

  const durationMinutes = isTimed && end ? diffMinutesFromDates(start, end) : null;

  return {
    ...base,
    rrule,
    ...(durationMinutes ? { duration: { minutes: durationMinutes } } : {}),
  };
}

export default function FullCalendarView({
  tasks = [],
  view,
  currentDate,
  onTimeSlotClick,
  onTaskClick,
  onEventTimeChange,
}) {
  const calendarRef = useRef(null);
  const events = tasks.map(mapTaskToEvent).filter(Boolean);

  useEffect(() => {
    if (!calendarRef.current) return;
    calendarRef.current.getApi().gotoDate(currentDate);
  }, [currentDate]);

  useEffect(() => {
    if (!calendarRef.current) return;
    calendarRef.current
      .getApi()
      .changeView(
        view === "month"
          ? "dayGridMonth"
          : view === "day"
            ? "timeGridDay"
            : "timeGridWeek"
      );
  }, [view]);

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin, rrulePlugin]}
      timeZone="local"
      initialView={
        view === "month"
          ? "dayGridMonth"
          : view === "day"
            ? "timeGridDay"
            : "timeGridWeek"
      }
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
          color = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.other;
        }

        if (viewType === "dayGridMonth") {
          color = PRIORITY_COLORS[task.priority] || "#E5E7EB";
        }

        if (color) {
          info.el.style.backgroundColor = color;
          info.el.style.borderColor = color;
          info.el.style.color = "#1f2937";
        }

        if (task.completed_at) {
          info.el.style.opacity = "0.45";
          info.el.style.filter = "grayscale(0.2)";
          info.el.style.textDecoration = "line-through";
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
