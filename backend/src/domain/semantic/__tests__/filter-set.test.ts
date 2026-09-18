import { describe, expect, it } from "vitest";
import { demoSemanticModel } from "../demo-warehouse";
import { channel, createChartSpec } from "../chart-spec";
import { compileQuery } from "../query-compiler";
import { emptyFilterSet, fieldsInSet, toFilterNode, withoutField, type FilterSet } from "../filter-set";

const compile = (filters: FilterSet) =>
  compileQuery(
    demoSemanticModel,
    createChartSpec({
      id: "c1",
      chartType: "bar",
      modelId: "northstar",
      dimensions: [channel("status")],
      measures: [channel("net_revenue", { aggregation: "sum" })],
      filters: toFilterNode(filters),
    }),
    { dialect: "duckdb", now: new Date("2026-09-17T12:00:00Z") },
  );

describe("toFilterNode", () => {
  it("returns nothing for an empty set", () => {
    expect(toFilterNode(emptyFilterSet())).toBeNull();
    expect(toFilterNode(null)).toBeNull();
  });

  it("ANDs top-level clauses", () => {
    const { sql, params } = compile({
      combinator: "and",
      clauses: [
        { kind: "condition", field: "segment", operator: "eq", values: ["enterprise"] },
        { kind: "condition", field: "net_revenue", operator: "gt", values: [100] },
      ],
    });
    expect(sql).toContain('WHERE ("customers"."segment" = $1 AND "orders"."net_revenue" > $2)');
    expect(params).toEqual(["enterprise", 100]);
  });

  it("ORs a group and ANDs it with the rest — the spec's own example shape", () => {
    const { sql } = compile({
      combinator: "and",
      clauses: [{ kind: "condition", field: "segment", operator: "eq", values: ["enterprise"] }],
      groups: [
        {
          combinator: "or",
          clauses: [
            { kind: "condition", field: "status", operator: "eq", values: ["paid"] },
            { kind: "condition", field: "status", operator: "eq", values: ["fulfilled"] },
          ],
        },
      ],
    });
    expect(sql).toContain('"customers"."segment" = $1');
    expect(sql).toContain('("orders"."status" = $2 OR "orders"."status" = $3)');
  });

  it("negates a clause and a whole group", () => {
    expect(compile({
      combinator: "and",
      clauses: [{ kind: "condition", field: "status", operator: "eq", values: ["refunded"], negate: true }],
    }).sql).toContain('NOT ("orders"."status" = $1)');

    expect(compile({
      combinator: "and",
      clauses: [],
      groups: [{
        combinator: "or",
        negate: true,
        clauses: [
          { kind: "condition", field: "status", operator: "eq", values: ["refunded"] },
          { kind: "condition", field: "status", operator: "eq", values: ["cancelled"] },
        ],
      }],
    }).sql).toContain('NOT (("orders"."status" = $1 OR "orders"."status" = $2))');
  });

  it("carries relative dates, absolute ranges and Top-N", () => {
    const relative = compile({ combinator: "and", clauses: [{ kind: "relative_date", field: "ordered_at", range: "last_7_days" }] });
    expect(relative.params).toEqual(["2026-09-11T00:00:00.000Z", "2026-09-18T00:00:00.000Z"]);

    const absolute = compile({ combinator: "and", clauses: [{ kind: "absolute_date", field: "ordered_at", from: "2026-01-01", to: "2026-02-01" }] });
    expect(absolute.params).toEqual(["2026-01-01", "2026-02-01"]);

    const ranked = compile({ combinator: "and", clauses: [{ kind: "top_n", field: "company_name", measure: "net_revenue", direction: "top", n: 5 }] });
    expect(ranked.sql).toContain("LIMIT 5)");
  });

  it("drops clauses that are not yet complete", () => {
    const { sql } = compile({
      combinator: "and",
      clauses: [
        { kind: "condition", field: "segment", operator: "eq", values: [""] },
        { kind: "condition", field: "status", operator: "eq", values: ["paid"] },
      ],
    });
    expect(sql).toContain('"orders"."status" = $1');
    expect(sql).not.toContain("$2");
  });

  it("keeps value-less operators even with no values", () => {
    expect(compile({ combinator: "and", clauses: [{ kind: "condition", field: "status", operator: "is_null", values: [] }] }).sql)
      .toContain('"orders"."status" IS NULL');
  });
});

describe("set helpers", () => {
  const set: FilterSet = {
    combinator: "and",
    clauses: [{ kind: "condition", field: "segment", operator: "eq", values: ["enterprise"] }],
    groups: [{ combinator: "or", clauses: [{ kind: "condition", field: "status", operator: "eq", values: ["paid"] }] }],
  };

  it("lists every referenced field, including a Top-N measure", () => {
    expect(fieldsInSet(set).sort()).toEqual(["segment", "status"]);
    expect(fieldsInSet({ combinator: "and", clauses: [{ kind: "top_n", field: "company_name", measure: "net_revenue", direction: "top", n: 3 }] }).sort())
      .toEqual(["company_name", "net_revenue"]);
  });

  it("removes one field and prunes any group it empties", () => {
    const without = withoutField(set, "status");
    expect(fieldsInSet(without)).toEqual(["segment"]);
    expect(without.groups).toEqual([]);
  });
});
