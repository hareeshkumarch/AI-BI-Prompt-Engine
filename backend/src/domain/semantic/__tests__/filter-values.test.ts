import { afterAll, describe, expect, it } from "vitest";
import { duckDbExecutor } from "../../execution/duckdb-executor";
import { getFilterValues } from "../filter-values-service";
import type { FilterSet } from "../filter-set";

afterAll(async () => {
  await duckDbExecutor().close();
});

describe("getFilterValues", () => {
  it("returns distinct values with counts, most common first", async () => {
    const result = await getFilterValues({ field: "segment" });
    expect(result.field).toBe("segment");
    expect(result.values.map((item) => item.value).sort()).toEqual(["enterprise", "mid_market", "startup"]);
    expect(result.values[0]!.count).toBeGreaterThan(0);
    expect(result.values[0]!.count).toBeGreaterThanOrEqual(result.values[2]!.count);
    expect(result.truncated).toBe(false);
  });

  it("narrows the list by the other filters in scope", async () => {
    const unfiltered = await getFilterValues({ field: "company_name", limit: 500 });
    const filters: FilterSet = {
      combinator: "and",
      clauses: [{ kind: "condition", field: "segment", operator: "eq", values: ["enterprise"] }],
    };
    const cascaded = await getFilterValues({ field: "company_name", limit: 500, filters });

    expect(cascaded.values.length).toBeLessThan(unfiltered.values.length);
    expect(cascaded.cascadedFrom).toEqual(["segment"]);
  });

  it("does not let a field constrain its own option list", async () => {
    const filters: FilterSet = {
      combinator: "and",
      clauses: [{ kind: "condition", field: "segment", operator: "eq", values: ["enterprise"] }],
    };
    const result = await getFilterValues({ field: "segment", filters });
    expect(result.values.map((item) => item.value).sort()).toEqual(["enterprise", "mid_market", "startup"]);
    expect(result.cascadedFrom).toEqual([]);
  });

  it("filters the options by a search term", async () => {
    const all = await getFilterValues({ field: "company_name", limit: 100 });
    const searched = await getFilterValues({ field: "company_name", search: "Acme", limit: 100 });
    expect(searched.values.length).toBeGreaterThan(0);
    expect(searched.values.length).toBeLessThan(all.values.length);
    expect(searched.values.every((item) => item.value.includes("Acme"))).toBe(true);
  });

  it("marks the result truncated past the requested limit", async () => {
    const result = await getFilterValues({ field: "company_name", limit: 5 });
    expect(result.values).toHaveLength(5);
    expect(result.truncated).toBe(true);
  });

  it("refuses an unknown field and a measure", async () => {
    await expect(getFilterValues({ field: "nope" })).rejects.toMatchObject({ code: "UNKNOWN_FIELD" });
    await expect(getFilterValues({ field: "net_revenue" })).rejects.toMatchObject({ code: "NOT_A_DIMENSION" });
  });
});
