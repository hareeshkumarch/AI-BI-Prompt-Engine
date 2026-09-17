import type { SqlDialect } from "../prompt-engine/types";

export type PlanColumn = {
  expression: string;
  alias: string;
  role: "dimension" | "measure";
  sourceField: string;
};

export type PlanJoin = {
  table: string;
  on: string;
};

export type QueryPlan = {
  dialect: SqlDialect;
  select: PlanColumn[];
  from: string;
  joins: PlanJoin[];
  where: string[];
  groupBy: string[];
  orderBy: string[];
  limit: number;
  params: unknown[];
};

export type CompiledQuery = {
  sql: string;
  params: unknown[];
  plan: QueryPlan;
};

export class QueryCompileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "QueryCompileError";
    this.code = code;
  }
}

export function renderPlan(plan: QueryPlan): string {
  const lines = [
    `SELECT ${plan.select.map((column) => `${column.expression} AS ${column.alias}`).join(", ")}`,
    `FROM ${plan.from}`,
    ...plan.joins.map((join) => `LEFT JOIN ${join.table} ON ${join.on}`),
  ];
  if (plan.where.length > 0) lines.push(`WHERE ${plan.where.join(" AND ")}`);
  if (plan.groupBy.length > 0) lines.push(`GROUP BY ${plan.groupBy.join(", ")}`);
  if (plan.orderBy.length > 0) lines.push(`ORDER BY ${plan.orderBy.join(", ")}`);
  lines.push(`LIMIT ${plan.limit}`);
  return lines.join("\n");
}
