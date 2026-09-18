import { describe, expect, it } from "vitest";
import { activeFilters, emptyFilterSet, isClauseComplete, mergeFilterSets, operatorsFor } from "../filter-bar";
import type { FilterClause, FilterSet } from "@workspace/api-client-react";

const condition = (field: string, values: unknown[] = ["a"]): FilterClause =>
  ({ kind: "condition", field, operator: "eq", values }) as FilterClause;

describe("isClauseComplete", () => {
  it("accepts operators that take no value", () => {
    expect(isClauseComplete({ kind: "condition", field: "status", operator: "is_null", values: [] } as FilterClause)).toBe(true);
  });

  it("rejects a condition whose value is still blank", () => {
    expect(isClauseComplete(condition("status", []))).toBe(false);
    expect(isClauseComplete(condition("status", [""]))).toBe(false);
    expect(isClauseComplete(condition("status", ["paid"]))).toBe(true);
  });

  it("needs both ends of an absolute range", () => {
    expect(isClauseComplete({ kind: "absolute_date", field: "ordered_at", from: "2026-01-01", to: "" } as FilterClause)).toBe(false);
    expect(isClauseComplete({ kind: "absolute_date", field: "ordered_at", from: "2026-01-01", to: "2026-06-30" } as FilterClause)).toBe(true);
  });

  it("needs a measure and a positive count for top-n", () => {
    expect(isClauseComplete({ kind: "top_n", field: "segment", measure: "", direction: "top", n: 5 } as FilterClause)).toBe(false);
    expect(isClauseComplete({ kind: "top_n", field: "segment", measure: "net_revenue", direction: "top", n: 0 } as FilterClause)).toBe(false);
    expect(isClauseComplete({ kind: "top_n", field: "segment", measure: "net_revenue", direction: "top", n: 3 } as FilterClause)).toBe(true);
  });
});

describe("activeFilters", () => {
  it("drops half-typed clauses so the query does not refire on every keystroke", () => {
    const set: FilterSet = {
      combinator: "and",
      clauses: [condition("status", ["paid"]), condition("segment", [])],
      groups: [{ combinator: "or", clauses: [condition("company_name", [""])] }],
    };
    const result = activeFilters(set);
    expect(result.clauses.map((clause) => clause.field)).toEqual(["status"]);
    expect(result.groups).toEqual([]);
  });
});

describe("mergeFilterSets", () => {
  it("ands plain scopes together", () => {
    const merged = mergeFilterSets(
      { combinator: "and", clauses: [condition("status")], groups: [] },
      { combinator: "and", clauses: [condition("segment")], groups: [] },
    );
    expect(merged.combinator).toBe("and");
    expect(merged.clauses.map((clause) => clause.field)).toEqual(["status", "segment"]);
    expect(merged.groups).toEqual([]);
  });

  it("keeps an or scope intact by nesting it as a group", () => {
    const merged = mergeFilterSets(
      { combinator: "or", clauses: [condition("status"), condition("segment")], groups: [] },
      { combinator: "and", clauses: [condition("company_name")], groups: [] },
    );
    expect(merged.clauses.map((clause) => clause.field)).toEqual(["company_name"]);
    expect(merged.groups).toEqual([
      { combinator: "or", negate: undefined, clauses: [condition("status"), condition("segment")] },
    ]);
  });

  it("ignores missing scopes", () => {
    expect(mergeFilterSets(null, undefined, emptyFilterSet())).toEqual({ combinator: "and", clauses: [], groups: [] });
  });
});

describe("operatorsFor", () => {
  it("offers range operators on ordered types and text matching on categories", () => {
    expect(operatorsFor("currency")).toContain("between");
    expect(operatorsFor("currency")).not.toContain("contains");
    expect(operatorsFor("category")).toContain("contains");
    expect(operatorsFor("category")).not.toContain("between");
  });
});
