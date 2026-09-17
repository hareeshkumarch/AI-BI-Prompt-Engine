import { describe, expect, it } from "vitest";
import { enforceReadOnlySql, MAX_ROW_LIMIT, UnsafeSqlError } from "../sql-guardrails";

const reject = (sql: string, dialect: Parameters<typeof enforceReadOnlySql>[1] = "postgresql") =>
  expect(() => enforceReadOnlySql(sql, dialect)).toThrow(UnsafeSqlError);

describe("enforceReadOnlySql", () => {
  it("accepts a bounded single-statement SELECT", () => {
    expect(enforceReadOnlySql("SELECT company_name FROM customers LIMIT 10", "postgresql"))
      .toBe("SELECT company_name FROM customers LIMIT 10");
  });

  it("accepts a CTE whose outermost query is bounded", () => {
    const sql = "WITH recent AS (SELECT * FROM orders) SELECT * FROM recent LIMIT 25";
    expect(enforceReadOnlySql(sql, "postgresql")).toBe(sql);
  });

  it("rejects empty and non-SELECT statements", () => {
    reject("   ");
    reject("DELETE FROM orders LIMIT 1");
    reject("EXPLAIN SELECT 1 LIMIT 1");
  });

  it("rejects mutations and administrative keywords", () => {
    reject("SELECT 1 FROM orders; DROP TABLE orders LIMIT 1");
    reject("SELECT * INTO staging FROM orders LIMIT 10");
    reject("SELECT pg_sleep(10) LIMIT 1");
  });

  it("rejects a second statement hidden after a semicolon", () => {
    reject("SELECT 1 LIMIT 1; SELECT 2 LIMIT 1");
  });

  it("does not flag blocked keywords that appear inside string literals", () => {
    const sql = "SELECT status FROM orders WHERE status = 'update' LIMIT 10";
    expect(enforceReadOnlySql(sql, "postgresql")).toBe(sql);
  });

  it("strips inert comments from the accepted statement", () => {
    expect(enforceReadOnlySql("SELECT 1 /* a note */ FROM orders LIMIT 1", "postgresql"))
      .toBe("SELECT 1 FROM orders LIMIT 1");
    expect(enforceReadOnlySql("SELECT 1 FROM orders LIMIT 1 -- trailing note", "postgresql"))
      .toBe("SELECT 1 FROM orders LIMIT 1");
  });

  it("does not let a line comment hide the statement that follows it", () => {
    reject("SELECT 1 FROM orders LIMIT 1 -- note\n; DROP TABLE orders");
  });

  it("rejects unterminated comments and literals", () => {
    reject("SELECT 1 FROM orders LIMIT 1 /* never closed");
    reject("SELECT 'never closed FROM orders LIMIT 1");
  });

  it("requires a LIMIT on the outermost query, not just a subquery", () => {
    reject("WITH capped AS (SELECT * FROM orders LIMIT 10) SELECT * FROM capped JOIN events USING (customer_id)");
    reject("SELECT * FROM (SELECT customer_id FROM orders LIMIT 5) recent");
  });

  it("rejects any LIMIT above the ceiling, including a later one", () => {
    reject(`SELECT * FROM orders LIMIT ${MAX_ROW_LIMIT + 1}`);
    reject("SELECT * FROM (SELECT 1 LIMIT 10) a JOIN orders USING (id) LIMIT 100000");
  });

  it("enforces dialect-specific syntax rules", () => {
    reject("SELECT * FROM orders WHERE status ILIKE 'paid' LIMIT 10", "mysql");
    reject("SELECT TOP 10 * FROM orders LIMIT 10", "postgresql");
    reject("SELECT DATE_TRUNC('month', ordered_at) FROM orders LIMIT 10", "sqlite");
    reject("SELECT DATE_FORMAT(ordered_at, '%Y') FROM orders LIMIT 10", "snowflake");
    reject("SELECT DATE_FORMAT(ordered_at, '%Y') FROM orders LIMIT 10", "duckdb");
  });

  it("collapses whitespace but preserves the original literals", () => {
    expect(enforceReadOnlySql("SELECT  'a  b'\n FROM t\n LIMIT 1", "postgresql"))
      .toBe("SELECT 'a b' FROM t LIMIT 1");
  });
});
