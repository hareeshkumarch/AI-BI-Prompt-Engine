import type { SqlDialect } from "./types";

const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|copy|call|execute|vacuum|attach|detach|set|into|pg_sleep|pg_read_file|load_file|dblink)\b/i;
const MULTI_STATEMENT = /;\s*\S/;
const LIMIT_PATTERN = /\blimit\s+(\d+)\b/gi;

export const MAX_ROW_LIMIT = 500;

export class UnsafeSqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeSqlError";
  }
}

// Single pass so a comment can never hide a statement and a literal can never hide a comment.
function scan(sql: string) {
  let withoutComments = "";
  let checkable = "";

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]!;
    const next = sql[index + 1];

    if (char === "-" && next === "-") {
      const end = sql.indexOf("\n", index);
      index = end === -1 ? sql.length : end;
      withoutComments += " ";
      checkable += " ";
      continue;
    }

    if (char === "/" && next === "*") {
      const end = sql.indexOf("*/", index + 2);
      if (end === -1) throw new UnsafeSqlError("The query contains an unterminated block comment.");
      index = end + 1;
      withoutComments += " ";
      checkable += " ";
      continue;
    }

    if (char === "'" || char === '"') {
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === char) {
          if (sql[cursor + 1] === char) cursor += 2;
          else break;
        } else cursor += 1;
      }
      if (cursor >= sql.length) throw new UnsafeSqlError("The query contains an unterminated string literal.");
      withoutComments += sql.slice(index, cursor + 1);
      checkable += `${char}${char}`;
      index = cursor;
      continue;
    }

    withoutComments += char;
    checkable += char;
  }

  const collapse = (value: string) => value.trim().replace(/\s+/g, " ");
  return { withoutComments: collapse(withoutComments), checkable: collapse(checkable) };
}

function stripSubqueries(sql: string) {
  let depth = 0;
  let output = "";
  for (const char of sql) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) output += char;
  }
  return output;
}

function assertDialect(sql: string, dialect: SqlDialect) {
  if (dialect === "mysql" && /\bilike\b/i.test(sql)) {
    throw new UnsafeSqlError("ILIKE is not valid for the selected MySQL dialect.");
  }
  if (dialect === "postgresql" && /\btop\s+\d+/i.test(sql)) {
    throw new UnsafeSqlError("TOP is not valid for the selected PostgreSQL dialect.");
  }
  if (dialect === "sqlite" && /\bdate_trunc\s*\(/i.test(sql)) {
    throw new UnsafeSqlError("DATE_TRUNC is not available in the selected SQLite dialect.");
  }
  if ((dialect === "snowflake" || dialect === "duckdb") && /\bdate_format\s*\(/i.test(sql)) {
    throw new UnsafeSqlError(`DATE_FORMAT is not valid for the selected ${dialect === "snowflake" ? "Snowflake" : "DuckDB"} dialect.`);
  }
}

export function enforceReadOnlySql(sql: string, dialect: SqlDialect) {
  if (!sql.trim()) throw new UnsafeSqlError("SQL cannot be empty.");

  const { withoutComments, checkable } = scan(sql);
  if (!checkable) throw new UnsafeSqlError("SQL cannot be empty.");

  if (!/^(select|with)\b/i.test(checkable)) {
    throw new UnsafeSqlError("Only SELECT and WITH queries are permitted.");
  }
  if (FORBIDDEN.test(checkable)) {
    throw new UnsafeSqlError("The query contains a blocked mutation or administrative keyword.");
  }
  if (MULTI_STATEMENT.test(checkable)) {
    throw new UnsafeSqlError("Multiple SQL statements are not permitted.");
  }

  const limits = [...checkable.matchAll(LIMIT_PATTERN)].map((match) => Number(match[1]));
  if (limits.some((limit) => limit > MAX_ROW_LIMIT)) {
    throw new UnsafeSqlError(`LIMIT cannot exceed ${MAX_ROW_LIMIT} rows.`);
  }
  if (!/\blimit\s+\d+\b/i.test(stripSubqueries(checkable))) {
    throw new UnsafeSqlError("The outermost query must include an explicit LIMIT.");
  }

  assertDialect(checkable, dialect);
  return withoutComments;
}
