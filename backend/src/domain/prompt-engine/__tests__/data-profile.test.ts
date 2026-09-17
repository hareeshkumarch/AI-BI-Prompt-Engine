import { describe, expect, it } from "vitest";
import { profileResult } from "../data-profile";

const profileOf = (rows: Record<string, unknown>[]) => profileResult(Object.keys(rows[0] ?? {}), rows);

describe("profileResult", () => {
  it("types a month/measure time series", () => {
    const profile = profileOf([
      { month: "2026-01", revenue: 384200 },
      { month: "2026-02", revenue: 421900 },
      { month: "2026-03", revenue: 467500 },
    ]);
    const [month, revenue] = profile.fields;
    expect(month?.type).toBe("temporal");
    expect(month?.temporalGrain).toBe("month");
    expect(revenue?.type).toBe("quantitative");
    expect(revenue?.role).toBe("measure");
    expect(revenue?.monotonic).toBe("increasing");
    expect(revenue?.sum).toBe(1273600);
    expect(profile.signature).toBe("Q1·T1");
  });

  it("separates nominal dimensions from measures", () => {
    const profile = profileOf([
      { company_name: "Acme Labs", total_spend: 218400 },
      { company_name: "Trellis Health", total_spend: 196200 },
    ]);
    expect(profile.dimensions).toEqual(["company_name"]);
    expect(profile.measures).toEqual(["total_spend"]);
    expect(profile.temporal).toEqual([]);
  });

  it("treats a near-unique id column as a key, not a measure", () => {
    const profile = profileOf([
      { order_id: 100492, net_revenue: 124 },
      { order_id: 100493, net_revenue: 580 },
      { order_id: 100494, net_revenue: 1840 },
    ]);
    expect(profile.fields[0]?.type).toBe("identifier");
    expect(profile.fields[0]?.role).toBe("key");
    expect(profile.measures).toEqual(["net_revenue"]);
  });

  it("detects ordinal fields by vocabulary and by name", () => {
    const byVocabulary = profileOf([{ plan: "free" }, { plan: "pro" }, { plan: "enterprise" }]);
    expect(byVocabulary.fields[0]?.type).toBe("ordinal");
    const byName = profileOf([{ tier: "alpha" }, { tier: "omega" }]);
    expect(byName.fields[0]?.type).toBe("ordinal");
  });

  it("detects booleans and a numeric year column", () => {
    const profile = profileOf([
      { is_active: true, fiscal_year: 2024 },
      { is_active: false, fiscal_year: 2025 },
    ]);
    expect(profile.fields[0]?.type).toBe("boolean");
    expect(profile.fields[1]?.type).toBe("temporal");
    expect(profile.fields[1]?.temporalGrain).toBe("year");
  });

  it("does not mistake a plain 4-digit measure for a year", () => {
    const profile = profileOf([{ headcount: 2024 }, { headcount: 1980 }]);
    expect(profile.fields[0]?.type).toBe("quantitative");
  });

  it("records null rate and cardinality", () => {
    const profile = profileOf([
      { segment: "enterprise", mrr: 100 },
      { segment: null, mrr: 200 },
      { segment: "enterprise", mrr: null },
      { segment: "startup", mrr: 400 },
    ]);
    const [segment, mrr] = profile.fields;
    expect(segment?.nullRate).toBe(0.25);
    expect(segment?.distinctCount).toBe(2);
    expect(mrr?.nullRate).toBe(0.25);
    expect(mrr?.min).toBe(100);
    expect(mrr?.max).toBe(400);
  });

  it("recognizes day, quarter and week grains", () => {
    expect(profileOf([{ d: "2026-03-02" }]).fields[0]?.temporalGrain).toBe("day");
    expect(profileOf([{ q: "2026-Q1" }, { q: "2026-Q2" }]).fields[0]?.temporalGrain).toBe("quarter");
    expect(profileOf([{ w: "2026-W03" }, { w: "2026-W04" }]).fields[0]?.temporalGrain).toBe("week");
  });

  it("handles an empty result without throwing", () => {
    const profile = profileResult(["a", "b"], []);
    expect(profile.rowCount).toBe(0);
    expect(profile.fields).toHaveLength(2);
    expect(profile.measures).toEqual([]);
  });
});
