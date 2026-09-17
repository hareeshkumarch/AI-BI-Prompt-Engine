import type { ChartType } from "./chart-catalog";
import type { ChartEncoding } from "./chart-mapper";
import type { DataProfile } from "./data-profile";

export type SqlDialect =
  | "postgresql"
  | "mysql"
  | "snowflake"
  | "sqlite"
  | "duckdb";

export type SemanticType = "dimension" | "measure" | "time" | "key" | "text";

export type ColumnMetric = {
  nullRate: number;
  cardinality: number;
  min: number | null;
  max: number | null;
  sampleValues: string[];
};

export type SchemaColumn = {
  name: string;
  dataType: string;
  nullable: boolean;
  semanticType: SemanticType;
  description: string;
  metrics: ColumnMetric;
};

export type ForeignKey = {
  fromColumn: string;
  toTable: string;
  toColumn: string;
};

export type SchemaTable = {
  name: string;
  rowCount: number;
  relevance: number;
  columns: SchemaColumn[];
  foreignKeys: ForeignKey[];
};

export type SchemaContext = {
  generatedAt: string;
  dialect: SqlDialect;
  tokenEstimate: number;
  totalTables: number;
  selectedTables: number;
  tables: SchemaTable[];
};

export type DataConnection = {
  id: string;
  name: string;
  kind: SqlDialect;
  host: string;
  status: "connected" | "degraded" | "disconnected";
  latencyMs: number;
  lastIntrospectedAt: string;
  tables: number;
};

export type PipelineStage = {
  id:
    | "contextualize"
    | "generate_sql"
    | "validate"
    | "execute"
    | "repair"
    | "synthesize";
  label: string;
  status: "queued" | "running" | "completed" | "failed" | "skipped";
  durationMs: number;
  detail: string;
};

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
};

export type InsightOutput = {
  insights: string[];
  chartType: ChartType;
  encoding: ChartEncoding;
  alternatives: ChartEncoding[];
  dataProfile: DataProfile;
  confidence: number;
};

export type QueryRun = {
  id: string;
  question: string;
  status: "completed" | "clarification_needed" | "failed" | "running";
  chartType: string;
  rowCount: number;
  createdAt: string;
  durationMs: number;
  connectionId: string;
  dialect: string;
  stages: PipelineStage[];
  targetedTables: string[];
  sql: string;
  sqlExplanation: string;
  clarification: string | null;
  result: QueryResult | null;
  insight: InsightOutput | null;
  error: string | null;
};

export type QueryRunInput = {
  question: string;
  connectionId: string;
  mode: "analyst" | "sql_only";
};

export type RepairRunInput = {
  instruction: string;
};