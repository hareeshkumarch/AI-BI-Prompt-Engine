import type { SqlDialect } from "../prompt-engine/types";

export type ResultColumnRole = "dimension" | "measure" | "unknown";

export type ResultColumn = {
  name: string;
  role: ResultColumnRole;
  sourceField: string | null;
};

export type ExecutionStats = {
  engine: string;
  dialect: SqlDialect;
  queryTimeMs: number;
  databaseTimeMs: number;
  rowsReturned: number;
  bytesReturned: number;
  truncated: boolean;
  cacheHit: boolean;
};

export type ExecutionResult = {
  columns: ResultColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  stats: ExecutionStats;
};

export type ExecuteOptions = {
  signal?: AbortSignal;
  timeoutMs: number;
  maxRows: number;
};

export type RawResult = {
  columnNames: string[];
  rows: Record<string, unknown>[];
  databaseTimeMs: number;
};

export interface QueryExecutor {
  readonly name: string;
  readonly dialect: SqlDialect;
  execute(sql: string, params: unknown[], options: ExecuteOptions): Promise<RawResult>;
  close(): Promise<void>;
}

export type ExecutionErrorCode =
  | "TIMEOUT"
  | "CANCELLED"
  | "ROW_LIMIT"
  | "ENGINE_ERROR"
  | "NOT_CONFIGURED";

export class QueryExecutionError extends Error {
  readonly code: ExecutionErrorCode;
  readonly engine: string;

  constructor(code: ExecutionErrorCode, engine: string, message: string) {
    super(message);
    this.name = "QueryExecutionError";
    this.code = code;
    this.engine = engine;
  }
}
