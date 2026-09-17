import { randomUUID } from "node:crypto";
import { demoConnection, schemaCatalog } from "./catalog";
import { contextualizeSchema } from "./schema-contextualizer";
import { enforceReadOnlySql, UnsafeSqlError } from "./sql-guardrails";
import { generateSql } from "./llm-provider";
import { synthesizeInsight } from "./insight-synthesizer";
import type {
  DataConnection,
  QueryResult,
  QueryRun,
  QueryRunInput,
  RepairRunInput,
  SchemaContext,
  SqlDialect,
} from "./types";

const MAX_RETAINED_RUNS = 200;

const runs = new Map<string, QueryRun>();

function storeRun(run: QueryRun) {
  runs.delete(run.id);
  runs.set(run.id, run);
  while (runs.size > MAX_RETAINED_RUNS) {
    const oldest = runs.keys().next();
    if (oldest.done) break;
    runs.delete(oldest.value);
  }
  return run;
}

const demoRows = {
  trend: [
    { month: "2026-01", revenue: 384200 },
    { month: "2026-02", revenue: 421900 },
    { month: "2026-03", revenue: 467500 },
    { month: "2026-04", revenue: 492800 },
    { month: "2026-05", revenue: 538400 },
    { month: "2026-06", revenue: 581200 },
  ],
  customers: [
    { company_name: "Acme Labs", total_spend: 218400 },
    { company_name: "Trellis Health", total_spend: 196200 },
    { company_name: "Summit Retail", total_spend: 174800 },
    { company_name: "Kite Systems", total_spend: 158900 },
    { company_name: "Morrow Finance", total_spend: 143700 },
  ],
  kpi: [{ revenue: 2886000, order_count: 184203 }],
} satisfies Record<string, Record<string, unknown>[]>;

export function getConnections(): DataConnection[] {
  return [demoConnection];
}

export function getContext(
  question = "",
  dialect: SqlDialect = "postgresql",
  requestedTable?: string,
  search?: string,
): SchemaContext {
  return contextualizeSchema(question, dialect, requestedTable, search);
}

function resultFor(question: string, sql: string): QueryResult {
  const normalized = `${question} ${sql}`.toLowerCase();
  const rows = normalized.includes("company_name") || normalized.includes("customer") ? demoRows.customers : normalized.includes("month") || normalized.includes("date_trunc") ? demoRows.trend : demoRows.kpi;
  return {
    columns: Object.keys(rows[0] ?? {}),
    rows,
    rowCount: rows.length,
    truncated: false,
  };
}

function stage(
  id: QueryRun["stages"][number]["id"],
  label: string,
  status: QueryRun["stages"][number]["status"],
  detail: string,
  durationMs: number,
) {
  return { id, label, status, detail, durationMs };
}

export async function executeRun(input: QueryRunInput, questionOverride = input.question, runId?: string): Promise<QueryRun> {
  const started = Date.now();
  const id = runId ?? randomUUID();
  const stages: QueryRun["stages"] = [
    stage("contextualize", "Schema contextualizer", "completed", "Selected relevant tables and pruned metadata to the prompt budget.", 24),
    stage("generate_sql", "Text-to-SQL", "running", "Resolving metric, grain, and dialect.", 0),
    stage("validate", "Policy guardrails", "queued", "Read-only and bounded-query checks.", 0),
    stage("execute", "Query execution", "queued", "Awaiting validated SQL.", 0),
    stage("repair", "Self-healing retry", "skipped", "No repair required.", 0),
    stage("synthesize", "Insight synthesis", "queued", "Building declarative visualization output.", 0),
  ];
  const context = getContext(questionOverride, input.dialect);
  const generated = await generateSql(questionOverride, context);
  stages[1] = stage("generate_sql", "Text-to-SQL", generated.clarification ? "failed" : "completed", generated.clarification ?? "Generated a bounded SQL statement.", Date.now() - started);
  if (generated.clarification) {
    const run: QueryRun = {
      id,
      question: questionOverride,
      status: "clarification_needed",
      chartType: "table",
      rowCount: 0,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      connectionId: input.connectionId,
      dialect: input.dialect,
      stages: stages.map((item, index) => index > 1 ? { ...item, status: "skipped" } : item),
      targetedTables: [],
      sql: "",
      sqlExplanation: generated.explanation,
      clarification: generated.clarification,
      result: null,
      insight: null,
      error: null,
    };
    return storeRun(run);
  }

  try {
    const sql = enforceReadOnlySql(generated.sql, input.dialect);
    stages[2] = stage("validate", "Policy guardrails", "completed", "SELECT-only, single-statement, dialect-compatible, LIMIT <= 500.", 8);
    const result = resultFor(questionOverride, sql);
    stages[3] = stage("execute", "Query execution", "completed", `Returned ${result.rowCount} rows from the bounded result set.`, 34);
    const insight = input.mode === "sql_only" ? null : synthesizeInsight(result);
    stages[5] = stage("synthesize", "Insight synthesis", insight ? "completed" : "skipped", insight ? `Profiled ${result.columns.length} fields and mapped them to a ${insight?.chartType ?? "table"} encoding.` : "SQL-only mode selected.", 18);
    const run: QueryRun = {
      id,
      question: questionOverride,
      status: "completed",
      chartType: insight?.chartType ?? "table",
      rowCount: result.rowCount,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      connectionId: input.connectionId,
      dialect: input.dialect,
      stages,
      targetedTables: generated.targetedTables,
      sql,
      sqlExplanation: generated.explanation,
      clarification: null,
      result,
      insight,
      error: null,
    };
    return storeRun(run);
  } catch (error) {
    const message = error instanceof UnsafeSqlError ? error.message : "Query execution failed.";
    stages[2] = stage("validate", "Policy guardrails", "failed", message, 8);
    stages[3] = stage("execute", "Query execution", "failed", "Execution was blocked before reaching the database.", 0);
    const run: QueryRun = {
      id,
      question: questionOverride,
      status: "failed",
      chartType: "table",
      rowCount: 0,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      connectionId: input.connectionId,
      dialect: input.dialect,
      stages,
      targetedTables: generated.targetedTables,
      sql: generated.sql,
      sqlExplanation: generated.explanation,
      clarification: null,
      result: null,
      insight: null,
      error: message,
    };
    return storeRun(run);
  }
}

export function getRun(id: string) {
  return runs.get(id);
}

export function listRuns() {
  return [...runs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ stages: _stages, ...run }) => run);
}

export async function repairRun(id: string, input: RepairRunInput) {
  const current = runs.get(id);
  if (!current) return undefined;
  const rerun = await executeRun(
    { question: current.question, connectionId: current.connectionId, dialect: current.dialect as SqlDialect, mode: "analyst" },
    `${current.question}. ${input.instruction}`,
    id,
  );
  rerun.stages = rerun.stages.map((item) => item.id === "repair" ? { ...item, status: "completed", detail: "Applied the repair instruction and re-ran validation.", durationMs: 17 } : item);
  return storeRun(rerun);
}

export function getOverview() {
  const allRuns = [...runs.values()];
  const recentRuns = listRuns().slice(0, 4);
  const columnCount = schemaCatalog.reduce((sum, table) => sum + table.columns.length, 0);
  return {
    activeConnection: demoConnection,
    tableCount: schemaCatalog.length,
    columnCount,
    queryCount: allRuns.length,
    averageLatencyMs: allRuns.length ? Math.round(allRuns.reduce((sum, run) => sum + run.durationMs, 0) / allRuns.length) : 86,
    successRate: allRuns.length ? allRuns.filter((run) => run.status === "completed").length / allRuns.length : 1,
    recentRuns,
    systemStatus: "operational" as const,
  };
}