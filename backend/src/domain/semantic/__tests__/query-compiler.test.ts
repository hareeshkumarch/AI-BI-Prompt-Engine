import { describe, expect, it } from "vitest";
import { demoSemanticModel } from "../demo-warehouse";
import { channel, createChartSpec, type ChartSpec } from "../chart-spec";
import { and, not, or, relativeDate, topN, where } from "../filter-ast";
import { compileQuery } from "../query-compiler";
import { QueryCompileError } from "../query-plan";

const spec = (over: Partial<ChartSpec> = {}): ChartSpec =>
  createChartSpec({ id: "c1", chartType: "bar", modelId: "northstar", ...over });

const compile = (over: Partial<ChartSpec>, dialect: "postgresql" | "mysql" | "sqlite" = "postgresql") =>
  compileQuery(demoSemanticModel, spec(over), { dialect, now: new Date("2026-09-17T12:00:00Z") });

const byStatus = { dimensions: [channel("status")], measures: [channel("net_revenue")] };

describe("compileQuery", () => {
  it("aggregates a measure by a dimension server-side", () => {
    const { sql } = compile({ ...byStatus, measures: [channel("net_revenue", { aggregation: "sum" })], limit: 20 });
    expect(sql).toContain('SELECT "orders"."status" AS "status", SUM("orders"."net_revenue") AS "net_revenue"');
    expect(sql).toContain('FROM "orders"');
    expect(sql).toContain('GROUP BY "orders"."status"');
    expect(sql).toContain('ORDER BY SUM("orders"."net_revenue") DESC');
    expect(sql).toContain("LIMIT 20");
  });

  it("falls back to the field's default aggregation", () => {
    expect(compile(byStatus).sql).toContain('SUM("orders"."net_revenue")');
  });

  it("buckets a time dimension to the requested grain per dialect", () => {
    const timeSpec = { dimensions: [channel("ordered_at", { grain: "month" as const })], measures: [channel("net_revenue")] };
    expect(compile(timeSpec).sql).toContain(`DATE_TRUNC('month', "orders"."ordered_at")`);
    expect(compile(timeSpec, "mysql").sql).toContain("DATE_FORMAT(`orders`.`ordered_at`, '%Y-%m-01')");
    expect(compile(timeSpec, "sqlite").sql).toContain(`strftime('%Y-%m-01', "orders"."ordered_at")`);
  });

  it("joins to a related table when a field needs it", () => {
    const { sql } = compile({ dimensions: [channel("company_name")], measures: [channel("net_revenue")] });
    expect(sql).toContain('FROM "orders"');
    expect(sql).toContain('LEFT JOIN "customers" ON "orders"."customer_id" = "customers"."customer_id"');
  });

  it("parameterizes filter values instead of inlining them", () => {
    const { sql, params } = compile({
      ...byStatus,
      filters: and(where("segment", "eq", "enterprise"), where("net_revenue", "gt", 100)),
    });
    expect(sql).toContain('WHERE ("customers"."segment" = $1 AND "orders"."net_revenue" > $2)');
    expect(params).toEqual(["enterprise", 100]);
    expect(sql).not.toContain("enterprise");
  });

  it("compiles nested AND / OR / NOT logic", () => {
    const { sql, params } = compile({
      ...byStatus,
      filters: and(
        where("segment", "eq", "enterprise"),
        not(or(where("status", "eq", "refunded"), where("status", "eq", "cancelled"))),
      ),
    });
    expect(sql).toContain('NOT (("orders"."status" = $2 OR "orders"."status" = $3))');
    expect(params).toEqual(["enterprise", "refunded", "cancelled"]);
  });

  it("resolves a relative date range into bounded timestamps", () => {
    const { sql, params } = compile({
      dimensions: [channel("ordered_at", { grain: "day" })],
      measures: [channel("net_revenue")],
      filters: relativeDate("ordered_at", "last_7_days"),
    });
    expect(sql).toContain('"orders"."ordered_at" >= $1 AND "orders"."ordered_at" < $2');
    expect(params[0]).toBe("2026-09-11T00:00:00.000Z");
    expect(params[1]).toBe("2026-09-18T00:00:00.000Z");
  });

  it("compiles Top-N into a bounded subquery", () => {
    const { sql } = compile({
      dimensions: [channel("company_name")],
      measures: [channel("net_revenue")],
      filters: topN("company_name", "net_revenue", 5),
    });
    expect(sql).toContain('"customers"."company_name" IN (SELECT "customers"."company_name"');
    expect(sql).toContain("LIMIT 5)");
  });

  it("uses an explicit sort when one is given", () => {
    expect(compile({ ...byStatus, sort: [{ field: "status", direction: "asc" }] }).sql)
      .toContain('ORDER BY "orders"."status" ASC');
  });

  it("clamps the limit to the configured ceiling", () => {
    const compiled = compileQuery(demoSemanticModel, spec({ ...byStatus, limit: 1_000_000 }), {
      dialect: "postgresql",
      maxLimit: 500,
    });
    expect(compiled.plan.limit).toBe(500);
  });

  it("inlines a metric expression without re-aggregating it", () => {
    expect(compile({ dimensions: [channel("status")], measures: [channel("average_order_value")] }).sql)
      .toContain('SUM("orders"."net_revenue") / NULLIF(COUNT("orders"."order_id"), 0)');
  });

  it("refuses to aggregate a dimension as a measure", () => {
    expect(() => compile({ dimensions: [channel("status")], measures: [channel("company_name", { aggregation: "sum" })] }))
      .toThrow(QueryCompileError);
  });

  it("refuses an unknown field and an empty projection", () => {
    expect(() => compile({ dimensions: [channel("nope")], measures: [channel("net_revenue")] })).toThrow(/not in the semantic model/);
    expect(() => compile({})).toThrow(/at least one dimension or measure/);
  });

  it("refuses a percentile aggregation the dialect cannot compute", () => {
    expect(() => compile({ dimensions: [channel("status")], measures: [channel("net_revenue", { aggregation: "median" })] }, "sqlite"))
      .toThrow(/not available for the sqlite dialect/);
  });
});
