import type { SqlDialect } from "./types";

const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|copy|call|execute|vacuum|attach|detach)\b/i;
const MULTI_STATEMENT = /;\s*\S/;

export class UnsafeSqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeSqlError";
  }
}

export function enforceReadOnlySql(sql: string, dialect: SqlDialect) {
  const normalized = sql.trim().replace(/\s+/g, " ");
  if (!normalized) throw new UnsafeSqlError("SQL cannot be empty.");
  if (!/^(select|with)\b/i.test(normalized)) {
    throw new UnsafeSqlError("Only SELECT and WITH queries are permitted.");
  }
  if (FORBIDDEN.test(normalized)) {
    throw new UnsafeSqlError("The query contains a blocked mutation or administrative keyword.");
  }
  if (MULTI_STATEMENT.test(normalized)) {
    throw new UnsafeSqlError("Multiple SQL statements are not permitted.");
  }
  if (!/\blimit\s+\d+\b/i.test(normalized)) {
    throw new UnsafeSqlError("Every query must include an explicit LIMIT.");
  }
  const limit = Number(normalized.match(/\blimit\s+(\d+)\b/i)?.[1] ?? 0);
  if (limit > 500) throw new UnsafeSqlError("LIMIT cannot exceed 500 rows.");

  if (dialect === "mysql" && /\bilike\b/i.test(normalized)) {
    throw new UnsafeSqlError("ILIKE is not valid for the selected MySQL dialect.");
  }
  if (dialect === "postgresql" && /\btop\s+\d+/i.test(normalized)) {
    throw new UnsafeSqlError("TOP is not valid for the selected PostgreSQL dialect.");
  }
  return normalized;
}