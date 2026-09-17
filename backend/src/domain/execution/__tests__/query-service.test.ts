import { afterAll, describe, expect, it } from "vitest";
import { demoSemanticModel } from "../../semantic/demo-warehouse";
import { channel, createChartSpec, type ChartSpec } from "../../semantic/chart-spec";
import { and, relativeDate, topN, where } from "../../semantic/filter-ast";
import { compileQuery } from "../../semantic/query-compiler";
import { duckDbExecutor } from "../duckdb-executor";
import { runCompiledQuery, runSql } from "../query-service";
import { QueryExecutionError } from "../types";

const spec = (over: Partial<ChartSpec> = {}): ChartSpec =>
  createChartSpec({ id: "c1", chartType: "bar", modelId: "northstar", ...over });

const execute = (over: Partial<ChartSpec>) =>
  runCompiledQuery(compileQuery(demoSemanticModel, spec(over), { dialect: "duckdb", now: new Date("2026-09-17T12:00:00Z") }));

afterAll(async () => {
  await duckDbExecutor().close();
});

describe("query execution against the seeded warehouse", () => {
  it("aggregates 20k orders down to a handful of rows", async () => {
    const result = await execute({
      dimensions: [channel("status")],
      measures: [channel("net_revenue", { aggregation: "sum" })],
    });
    expect(result.rows.length).toBeGreaterThan(1);
    expect(result.rows.length).toBeLessThan(10);
    expect(result.columns.map((column) => column.name)).toEqual(["status", "net_revenue"]);
    expect(result.columns.find((column) => column.name === "net_revenue")?.role).toBe("measure");
    expect(typeof result.rows[0]?.["net_revenue"]).toBe("number");
  });

  it("returns every row count as a JSON-safe number, not a BigInt", async () => {
    const result = await execute({
      dimensions: [channel("segment")],
      measures: [channel("order_id", { aggregation: "count" })],
    });
    for (const row of result.rows) expect(typeof row["order_id"]).toBe("number");
    expect(JSON.stringify(result.rows)).toContain("order_id");
  });

  it("buckets a real time series by month", async () => {
    const result = await execute({
      dimensions: [channel("ordered_at", { grain: "month" })],
      measures: [channel("net_revenue", { aggregation: "sum" })],
      sort: [{ field: "ordered_at", direction: "asc" }],
      limit: 40,
    });
    expect(result.rows.length).toBeGreaterThan(12);
    expect(String(result.rows[0]?.["ordered_at"])).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("joins across tables and honours a parameterized filter", async () => {
    const all = await execute({
      dimensions: [channel("segment")],
      measures: [channel("net_revenue", { aggregation: "sum" })],
    });
    const filtered = await execute({
      dimensions: [channel("segment")],
      measures: [channel("net_revenue", { aggregation: "sum" })],
      filters: and(where("segment", "eq", "enterprise"), where("status", "neq", "refunded")),
    });
    expect(all.rows).toHaveLength(3);
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0]?.["segment"]).toBe("enterprise");
    expect(Number(filtered.rows[0]?.["net_revenue"])).toBeLessThan(Number(all.rows.find((row) => row["segment"] === "enterprise")?.["net_revenue"]));
  });

  it("applies Top-N as a bounded subquery", async () => {
    const result = await execute({
      dimensions: [channel("company_name")],
      measures: [channel("net_revenue", { aggregation: "sum" })],
      filters: topN("company_name", "net_revenue", 5),
      limit: 100,
    });
    expect(result.rows).toHaveLength(5);
  });

  it("applies a relative date window", async () => {
    const result = await execute({
      dimensions: [channel("status")],
      measures: [channel("net_revenue", { aggregation: "sum" })],
      filters: relativeDate("ordered_at", "this_year"),
    });
    expect(result.rowCount).toBeGreaterThanOrEqual(0);
  });

  it("reports timings, row counts and the engine", async () => {
    const result = await execute({
      dimensions: [channel("status")],
      measures: [channel("net_revenue", { aggregation: "sum" })],
    });
    expect(result.stats.engine).toBe("duckdb");
    expect(result.stats.dialect).toBe("duckdb");
    expect(result.stats.databaseTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.queryTimeMs).toBeGreaterThanOrEqual(result.stats.databaseTimeMs);
    expect(result.stats.rowsReturned).toBe(result.rows.length);
    expect(result.stats.bytesReturned).toBeGreaterThan(0);
    expect(result.stats.cacheHit).toBe(false);
  });

  it("truncates at the row ceiling instead of streaming everything", async () => {
    const compiled = compileQuery(demoSemanticModel, spec({
      dimensions: [channel("order_id")],
      measures: [channel("net_revenue", { aggregation: "sum" })],
      limit: 5000,
    }), { dialect: "duckdb", maxLimit: 5000 });
    const result = await runCompiledQuery(compiled, { maxRows: 50 });
    expect(result.rows).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(result.stats.truncated).toBe(true);
  });

  it("surfaces engine errors as a typed failure", async () => {
    await expect(runSql("SELECT * FROM does_not_exist")).rejects.toBeInstanceOf(QueryExecutionError);
  });

  it("cancels an in-flight query when the caller aborts", async () => {
    const controller = new AbortController();
    const pending = runSql(
      "SELECT COUNT(*) FROM range(1, 400000000) a, range(1, 40) b",
      { signal: controller.signal, timeoutMs: 30_000 },
    );
    setTimeout(() => controller.abort(), 60);
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("stops a query that exceeds the timeout", async () => {
    await expect(
      runSql("SELECT COUNT(*) FROM range(1, 400000000) a, range(1, 40) b", { timeoutMs: 80 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
