"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type DatePickerStrings = {
  previousMonth: string;
  nextMonth: string;
  today: string;
  pickDate: string;
  continue_: string;
};

type DatePickerProps = {
  locale: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  strings: DatePickerStrings;
  onSubmit: (isoDate: string) => void;
};

function toIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIso(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function clamp(date: Date, min: Date | null, max: Date | null) {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

/** 1 = Monday … 7 = Sunday, following the locale's week when the browser knows it. */
function firstDayOfWeek(locale: string) {
  try {
    const info = (new Intl.Locale(locale) as Intl.Locale & { weekInfo?: { firstDay?: number }; getWeekInfo?: () => { firstDay?: number } });
    const first = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    if (first && first >= 1 && first <= 7) return first;
  } catch {
    // Fall through to the default.
  }
  return 1;
}

export function DatePicker({ locale, min, max, disabled, strings, onSubmit }: DatePickerProps) {
  const minDate = useMemo(() => parseIso(min), [min]);
  const maxDate = useMemo(() => parseIso(max), [max]);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const [selected, setSelected] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(clamp(today, minDate, maxDate)));

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(viewMonth),
    [locale, viewMonth],
  );
  const selectedLabel = useMemo(
    () => (selected ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(selected) : ""),
    [locale, selected],
  );
  const firstDay = useMemo(() => firstDayOfWeek(locale), [locale]);
  const weekdays = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    // 5 Jan 2026 is a Monday; walk from the locale's first weekday.
    return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2026, 0, 5 + ((firstDay - 1 + index) % 7))));
  }, [firstDay, locale]);

  const days = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const jsDay = first.getDay(); // 0 = Sunday
    const isoDay = jsDay === 0 ? 7 : jsDay; // 1 = Monday … 7 = Sunday
    const leading = (isoDay - firstDay + 7) % 7;
    const count = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= count; day += 1) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [firstDay, viewMonth]);

  const inRange = (date: Date) => !(minDate && date < minDate) && !(maxDate && date > maxDate);
  const previousMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  const nextMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  const canGoBack = !minDate || previousMonth >= startOfMonth(minDate);
  const canGoForward = !maxDate || nextMonth <= startOfMonth(maxDate);
  const todayAvailable = inRange(today);

  return (
    <div className="chat-datepicker" role="group" aria-label={strings.pickDate}>
      <div className="chat-datepicker-head">
        <button type="button" aria-label={strings.previousMonth} disabled={disabled || !canGoBack} onClick={() => setViewMonth(previousMonth)}>
          <ChevronLeft size={16} />
        </button>
        <strong aria-live="polite">{monthLabel}</strong>
        <button type="button" aria-label={strings.nextMonth} disabled={disabled || !canGoForward} onClick={() => setViewMonth(nextMonth)}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="chat-datepicker-grid" role="grid">
        {weekdays.map((weekday) => (
          <span className="chat-datepicker-weekday" role="columnheader" key={weekday}>{weekday}</span>
        ))}
        {days.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} aria-hidden />;
          const iso = toIso(date);
          const isSelected = selected !== null && toIso(selected) === iso;
          const isToday = toIso(today) === iso;
          const available = inRange(date);
          return (
            <button
              type="button"
              role="gridcell"
              key={iso}
              className={`chat-datepicker-day${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
              aria-selected={isSelected}
              aria-label={new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(date)}
              disabled={disabled || !available}
              onClick={() => setSelected(date)}
            >
              {new Intl.NumberFormat(locale).format(date.getDate())}
            </button>
          );
        })}
      </div>
      <div className="chat-datepicker-foot">
        <button
          type="button"
          className="chat-datepicker-today"
          disabled={disabled || !todayAvailable}
          onClick={() => {
            setSelected(today);
            setViewMonth(startOfMonth(today));
          }}
        >
          {strings.today}
        </button>
        <span className="chat-datepicker-selected">{selectedLabel || strings.pickDate}</span>
        <button type="button" className="primary-button" disabled={disabled || !selected} onClick={() => selected && onSubmit(toIso(selected))}>
          {strings.continue_}
        </button>
      </div>
    </div>
  );
}
