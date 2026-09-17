import { describe, expect, it } from "vitest";
import { demoSemanticModel } from "../demo-warehouse";
import { channel, createChartSpec, type ChartSpec } from "../chart-spec";
import { validateChartSpec } from "../chart-spec-validator";
import { relativeDate, topN, where } from "../filter-ast";

const spec = (over: Partial<ChartSpec> = {}): ChartSpec =>
  createChartSpec({ id: "c1", chartType: "bar", modelId: "northstar", ...over });

const validate = (over: Partial<ChartSpec>, dialect?: "postgresql" | "sqlite") =>
  validateChartSpec(demoSemanticModel, spec(over), dialect ? { dialect } : {});

const codes = (over: Partial<ChartSpec>, dialect?: "postgresql" | "sqlite") =>
  validate(over, dialect).issues.map((issue) => issue.code);

const valid = {
  dimensions: [channel("status")],
  measures: [channel("net_revenue", { aggregation: "sum" })],
  encoding: { x: channel("status"), y: [channel("net_revenue", { aggregation: "sum" })], series: null, color: null, size: null, theta: null, tooltip: [] },
};

describe("validateChartSpec", () => {
  it("accepts a well-formed spec", () => {
    expect(validate(valid)).toEqual({ valid: true, issues: [] });
  });

  it("rejects SUM over a name", () => {
    expect(codes({ dimensions: [channel("status")], measures: [channel("company_name", { aggregation: "sum" })] }))
      .toContain("AGGREGATION_NOT_ALLOWED");
  });

  it("rejects an unknown field", () => {
    expect(codes({ dimensions: [channel("nope")], measures: [channel("net_revenue")] })).toContain("UNKNOWN_FIELD");
  });

  it("rejects a measure on a dimension channel and a dimension on a measure channel", () => {
    expect(codes({
      ...valid,
      encoding: { ...valid.encoding, series: channel("net_revenue", { aggregation: "sum" }) },
    })).toContain("NOT_A_DIMENSION");
    expect(codes({
      ...valid,
      encoding: { ...valid.encoding, size: channel("status") },
    })).toContain("NOT_A_MEASURE");
  });

  it("rejects a time grain on a non-temporal field", () => {
    expect(codes({ dimensions: [channel("status", { grain: "month" })], measures: [channel("net_revenue")] }))
      .toContain("INVALID_TIME_GRAIN");
  });

  it("enforces the chart's field-count requirements", () => {
    expect(codes({ chartType: "scatter", dimensions: [], measures: [channel("net_revenue")] })).toContain("TOO_FEW_MEASURES");
    expect(codes({ chartType: "pie", dimensions: [channel("status"), channel("segment")], measures: [channel("net_revenue")] }))
      .toContain("TOO_MANY_DIMENSIONS");
  });

  it("rejects a sort over a field the chart does not project", () => {
    expect(codes({ ...valid, sort: [{ field: "mrr", direction: "desc" }] })).toContain("INVALID_SORT");
  });

  it("rejects an invalid limit", () => {
    expect(codes({ ...valid, limit: 0 })).toContain("INVALID_LIMIT");
  });

  it("checks filter operators against the field type", () => {
    expect(codes({ ...valid, filters: where("net_revenue", "contains", "abc") })).toContain("INVALID_FILTER");
    expect(codes({ ...valid, filters: where("status", "gt", 5) })).toContain("INVALID_FILTER");
    expect(codes({ ...valid, filters: where("status", "between", 1) })).toContain("INVALID_FILTER");
    expect(codes({ ...valid, filters: where("status", "eq", "paid") })).toEqual([]);
  });

  it("restricts date filters to time dimensions", () => {
    expect(codes({ ...valid, filters: relativeDate("status", "last_7_days") })).toContain("INVALID_FILTER");
    expect(codes({ ...valid, filters: relativeDate("ordered_at", "last_7_days") })).toEqual([]);
  });

  it("requires Top-N to rank by a measure", () => {
    expect(codes({ ...valid, filters: topN("status", "company_name", 5) })).toContain("NOT_A_MEASURE");
    expect(codes({ ...valid, filters: topN("status", "net_revenue", 0) })).toContain("INVALID_FILTER");
  });

  it("flags an aggregation the target dialect cannot compute", () => {
    expect(codes({ dimensions: [channel("status")], measures: [channel("net_revenue", { aggregation: "median" })] }, "sqlite"))
      .toContain("AGGREGATION_UNSUPPORTED");
    expect(codes({ dimensions: [channel("status")], measures: [channel("net_revenue", { aggregation: "median" })] }, "postgresql"))
      .toEqual([]);
  });

  it("rejects an unknown drill level", () => {
    expect(codes({ ...valid, interaction: { ...spec().interaction, drillPath: ["not_a_field"] } }))
      .toContain("UNKNOWN_DRILL_FIELD");
  });
});
