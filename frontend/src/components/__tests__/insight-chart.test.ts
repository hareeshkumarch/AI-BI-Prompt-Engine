import { describe, expect, it } from "vitest";
import { bin, normalize, shape } from "../insight-chart";
import type { ChartEncoding, QueryResult } from "@workspace/api-client-react";

const ref = (field: string) => ({ field, type: "quantitative", grain: null }) as ChartEncoding["x"];

const encoding = (over: Partial<ChartEncoding>): ChartEncoding =>
  ({
    chartType: "bar", label: "", family: "comparison", rationale: "",
    x: null, y: [], series: null, size: null,
    orientation: "vertical", stack: "none", colorJob: "categorical", score: 0, ...over,
  }) as ChartEncoding;

const result = (columns: string[], rows: Record<string, unknown>[]): QueryResult =>
  ({ columns, rows, rowCount: rows.length, truncated: false });

describe("shape", () => {
  it("maps wide-format measures to one series per column", () => {
    const { data, keys } = shape(
      encoding({ x: ref("month"), y: [ref("revenue")!, ref("refunds")!] }),
      result(["month", "revenue", "refunds"], [
        { month: "2026-01", revenue: 100, refunds: 10 },
        { month: "2026-02", revenue: 120, refunds: 12 },
      ]),
    );
    expect(keys).toEqual(["revenue", "refunds"]);
    expect(data).toEqual([
      { __label: "2026-01", revenue: 100, refunds: 10 },
      { __label: "2026-02", revenue: 120, refunds: 12 },
    ]);
  });

  it("pivots long-format rows into one series per dimension value", () => {
    const { data, keys } = shape(
      encoding({ x: ref("month"), y: [ref("revenue")!], series: ref("segment") }),
      result(["month", "segment", "revenue"], [
        { month: "2026-01", segment: "enterprise", revenue: 100 },
        { month: "2026-01", segment: "startup", revenue: 50 },
        { month: "2026-02", segment: "enterprise", revenue: 120 },
        { month: "2026-02", segment: "startup", revenue: 60 },
      ]),
    );
    expect(keys).toEqual(["enterprise", "startup"]);
    expect(data).toEqual([
      { __label: "2026-01", enterprise: 100, startup: 50 },
      { __label: "2026-02", enterprise: 120, startup: 60 },
    ]);
  });

  it("coerces non-numeric measures to zero rather than NaN", () => {
    const { data } = shape(
      encoding({ x: ref("name"), y: [ref("value")!] }),
      result(["name", "value"], [{ name: "a", value: null }, { name: "b", value: "oops" }]),
    );
    expect(data.map((row) => row["value"])).toEqual([0, 0]);
  });
});

describe("normalize", () => {
  it("converts each row to percentages that sum to 100", () => {
    const { data } = normalize({
      keys: ["a", "b"],
      data: [{ __label: "x", a: 30, b: 70 }, { __label: "y", a: 1, b: 3 }],
    });
    expect(data[0]).toMatchObject({ a: 30, b: 70 });
    expect(data[1]).toMatchObject({ a: 25, b: 75 });
  });

  it("does not divide by zero on an all-zero row", () => {
    const { data } = normalize({ keys: ["a"], data: [{ __label: "x", a: 0 }] });
    expect(data[0]!["a"]).toBe(0);
  });
});

describe("bin", () => {
  it("buckets values and preserves the total count", () => {
    const bins = bin([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((sum, item) => sum + item.count, 0)).toBe(10);
  });

  it("puts the maximum in the last bucket", () => {
    const bins = bin([0, 0, 0, 100], 4);
    expect(bins[3]!.count).toBe(1);
    expect(bins[0]!.count).toBe(3);
  });

  it("returns nothing for an empty series", () => {
    expect(bin([])).toEqual([]);
  });
});
