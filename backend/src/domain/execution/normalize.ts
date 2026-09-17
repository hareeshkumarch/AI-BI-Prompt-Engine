import type { PlanColumn } from "../semantic/query-plan";
import type { ResultColumn, RawResult } from "./types";

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;

export function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const text = String(value);
    if (ISO_LIKE.test(text)) return text.replace(" ", "T").replace(/T00:00:00(\.0+)?$/, "");
    const asNumber = Number(text);
    return Number.isFinite(asNumber) && text.trim() !== "" ? asNumber : text;
  }
  return value;
}

export function normalizeRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) normalized[key] = normalizeValue(value);
    return normalized;
  });
}

export function describeColumns(columnNames: string[], planColumns: PlanColumn[]): ResultColumn[] {
  return columnNames.map((name) => {
    const planColumn = planColumns.find((column) => column.alias.replace(/^["`]|["`]$/g, "") === name);
    return {
      name,
      role: planColumn?.role ?? "unknown",
      sourceField: planColumn?.sourceField ?? null,
    };
  });
}

export function estimateBytes(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return 0;
  const sampleSize = Math.min(rows.length, 20);
  const sample = JSON.stringify(rows.slice(0, sampleSize)).length;
  return Math.round((sample / sampleSize) * rows.length);
}

export function normalizeResult(raw: RawResult, planColumns: PlanColumn[]) {
  return {
    columns: describeColumns(raw.columnNames, planColumns),
    rows: normalizeRows(raw.rows),
  };
}
