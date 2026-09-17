import type { RelativeDateRange } from "./filter-ast";

export type DateWindow = { from: Date; to: Date };

const DAY = 86_400_000;

const startOfDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
const startOfWeek = (date: Date) => {
  const day = startOfDay(date);
  const weekday = (day.getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
};
const startOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const addMonths = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
const startOfQuarter = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
const startOfYear = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), 0, 1));

const lastDays = (now: Date, count: number): DateWindow => {
  const today = startOfDay(now);
  return { from: addDays(today, -(count - 1)), to: addDays(today, 1) };
};

export function resolveRelativeDate(range: RelativeDateRange, now: Date = new Date()): DateWindow {
  const today = startOfDay(now);

  switch (range) {
    case "today":
      return { from: today, to: addDays(today, 1) };
    case "yesterday":
      return { from: addDays(today, -1), to: today };
    case "last_7_days":
      return lastDays(now, 7);
    case "last_30_days":
      return lastDays(now, 30);
    case "last_90_days":
      return lastDays(now, 90);
    case "this_week":
      return { from: startOfWeek(now), to: addDays(startOfWeek(now), 7) };
    case "previous_week":
      return { from: addDays(startOfWeek(now), -7), to: startOfWeek(now) };
    case "this_month":
      return { from: startOfMonth(now), to: addMonths(now, 1) };
    case "previous_month":
      return { from: addMonths(now, -1), to: startOfMonth(now) };
    case "this_quarter": {
      const start = startOfQuarter(now);
      return { from: start, to: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1)) };
    }
    case "previous_quarter": {
      const start = startOfQuarter(now);
      return { from: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 3, 1)), to: start };
    }
    case "this_year":
      return { from: startOfYear(now), to: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)) };
    case "previous_year":
      return { from: new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)), to: startOfYear(now) };
    case "year_to_date":
      return { from: startOfYear(now), to: addDays(today, 1) };
    case "quarter_to_date":
      return { from: startOfQuarter(now), to: addDays(today, 1) };
    case "month_to_date":
      return { from: startOfMonth(now), to: addDays(today, 1) };
  }
}

export const RELATIVE_DATE_LABELS: Record<RelativeDateRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_week: "This week",
  previous_week: "Previous week",
  this_month: "This month",
  previous_month: "Previous month",
  this_quarter: "This quarter",
  previous_quarter: "Previous quarter",
  this_year: "This year",
  previous_year: "Previous year",
  year_to_date: "Year to date",
  month_to_date: "Month to date",
  quarter_to_date: "Quarter to date",
};
