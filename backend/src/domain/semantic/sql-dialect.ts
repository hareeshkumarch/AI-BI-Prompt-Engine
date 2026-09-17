import type { SqlDialect } from "../prompt-engine/types";
import type { Aggregation, TimeGrain } from "./semantic-model";
import { QueryCompileError } from "./query-plan";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quoteIdentifier(name: string, dialect: SqlDialect) {
  if (!IDENTIFIER.test(name)) {
    throw new QueryCompileError("INVALID_IDENTIFIER", `"${name}" is not a valid SQL identifier.`);
  }
  return dialect === "mysql" ? `\`${name}\`` : `"${name}"`;
}

export function qualify(table: string, column: string, dialect: SqlDialect) {
  return `${quoteIdentifier(table, dialect)}.${quoteIdentifier(column, dialect)}`;
}

export function placeholder(dialect: SqlDialect, index: number) {
  return dialect === "mysql" || dialect === "sqlite" ? "?" : `$${index}`;
}

const MONTH_START: Record<TimeGrain, string> = {
  second: "%Y-%m-%d %H:%M:%S",
  minute: "%Y-%m-%d %H:%M:00",
  hour: "%Y-%m-%d %H:00:00",
  day: "%Y-%m-%d",
  week: "%Y-%W",
  month: "%Y-%m-01",
  quarter: "%Y-%m-01",
  year: "%Y-01-01",
};

export function truncateToGrain(expression: string, grain: TimeGrain, dialect: SqlDialect) {
  if (dialect === "mysql") {
    if (grain === "quarter") return `MAKEDATE(YEAR(${expression}), 1) + INTERVAL (QUARTER(${expression}) - 1) QUARTER`;
    if (grain === "week") return `DATE_SUB(DATE(${expression}), INTERVAL WEEKDAY(${expression}) DAY)`;
    return `DATE_FORMAT(${expression}, '${MONTH_START[grain]}')`;
  }
  if (dialect === "sqlite") {
    if (grain === "week") return `DATE(${expression}, 'weekday 1', '-7 days')`;
    if (grain === "quarter") return `DATE(strftime('%Y', ${expression}) || '-' || printf('%02d', ((CAST(strftime('%m', ${expression}) AS INTEGER) - 1) / 3) * 3 + 1 ) || '-01')`;
    return `strftime('${MONTH_START[grain]}', ${expression})`;
  }
  return `DATE_TRUNC('${grain}', ${expression})`;
}

export function aggregate(expression: string, aggregation: Aggregation, dialect: SqlDialect) {
  switch (aggregation) {
    case "sum":
      return `SUM(${expression})`;
    case "avg":
      return `AVG(${expression})`;
    case "min":
      return `MIN(${expression})`;
    case "max":
      return `MAX(${expression})`;
    case "count":
      return `COUNT(${expression})`;
    case "count_distinct":
      return `COUNT(DISTINCT ${expression})`;
    case "median":
      return percentile(expression, 0.5, dialect);
    case "p90":
      return percentile(expression, 0.9, dialect);
    case "p95":
      return percentile(expression, 0.95, dialect);
    case "none":
      return expression;
  }
}

function percentile(expression: string, fraction: number, dialect: SqlDialect) {
  if (dialect === "mysql" || dialect === "sqlite") {
    throw new QueryCompileError(
      "UNSUPPORTED_AGGREGATION",
      `Percentile aggregation is not available for the ${dialect} dialect.`,
    );
  }
  return `PERCENTILE_CONT(${fraction}) WITHIN GROUP (ORDER BY ${expression})`;
}

export function supportsAggregation(aggregation: Aggregation, dialect: SqlDialect) {
  if (["median", "p90", "p95"].includes(aggregation)) return dialect !== "mysql" && dialect !== "sqlite";
  return true;
}
