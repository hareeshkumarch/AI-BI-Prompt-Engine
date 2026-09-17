import { describe, expect, it } from "vitest";
import { profileResult } from "../data-profile";
import { recommendCharts } from "../chart-mapper";
import { CHART_CATALOG } from "../chart-catalog";

const recommend = (rows: Record<string, unknown>[]) =>
  recommendCharts(profileResult(Object.keys(rows[0] ?? {}), rows));

const trend = [
  { month: "2026-01", revenue: 384200 },
  { month: "2026-02", revenue: 421900 },
  { month: "2026-03", revenue: 467500 },
  { month: "2026-04", revenue: 492800 },
];

const ranked = [
  { company_name: "Acme Labs", total_spend: 218400 },
  { company_name: "Trellis Health", total_spend: 196200 },
  { company_name: "Summit Retail", total_spend: 174800 },
  { company_name: "Kite Systems", total_spend: 158900 },
];

describe("recommendCharts", () => {
  it("maps a time series to a line and binds the axes", () => {
    const { primary, alternatives } = recommend(trend);
    expect(primary.chartType).toBe("line");
    expect(primary.x?.field).toBe("month");
    expect(primary.x?.grain).toBe("month");
    expect(primary.y.map((ref) => ref.field)).toEqual(["revenue"]);
    expect(alternatives.map((item) => item.chartType)).toContain("bar");
  });

  it("prefers a horizontal bar when category labels are long", () => {
    const { primary } = recommend(ranked);
    expect(primary.chartType).toBe("bar_horizontal");
    expect(primary.orientation).toBe("horizontal");
    expect(primary.x?.field).toBe("company_name");
  });

  it("prefers a vertical bar when labels are short", () => {
    const { primary } = recommend([
      { day: "Mo", visits: 10 },
      { day: "Tu", visits: 14 },
      { day: "We", visits: 9 },
    ]);
    expect(primary.chartType).toBe("bar");
    expect(primary.orientation).toBe("vertical");
  });

  it("maps a single row with no dimension to a KPI", () => {
    const { primary } = recommend([{ revenue: 2886000, order_count: 184203 }]);
    expect(primary.chartType).toBe("kpi");
    expect(primary.x).toBeNull();
    expect(primary.y).toHaveLength(2);
  });

  it("pivots a long-format result into a multi-series line", () => {
    const { primary } = recommend([
      { month: "2026-01", segment: "enterprise", revenue: 100 },
      { month: "2026-01", segment: "startup", revenue: 50 },
      { month: "2026-02", segment: "enterprise", revenue: 120 },
      { month: "2026-02", segment: "startup", revenue: 60 },
    ]);
    expect(primary.chartType).toBe("multi_line");
    expect(primary.x?.field).toBe("month");
    expect(primary.series?.field).toBe("segment");
    expect(primary.y.map((ref) => ref.field)).toEqual(["revenue"]);
  });

  it("maps two measures and no dimension to a scatter", () => {
    const { primary } = recommend([
      { mrr: 99, seats: 3 },
      { mrr: 499, seats: 12 },
      { mrr: 1999, seats: 40 },
      { mrr: 299, seats: 8 },
      { mrr: 899, seats: 22 },
    ]);
    expect(primary.chartType).toBe("scatter");
    expect(primary.x?.field).toBe("mrr");
    expect(primary.y[0]?.field).toBe("seats");
  });

  it("adds a size channel when a third measure is present", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      mrr: 100 * (index + 1),
      seats: 3 * (index + 1),
      accounts: index + 1,
    }));
    const bubble = recommend(rows).alternatives.concat(recommend(rows).primary).find((item) => item.chartType === "bubble");
    expect(bubble?.size?.field).toBe("accounts");
  });

  it("chooses a funnel only for an ordered, decreasing measure", () => {
    const { primary } = recommend([
      { stage: "visited", users: 10000 },
      { stage: "signed_up", users: 4200 },
      { stage: "activated", users: 1800 },
      { stage: "paid", users: 640 },
    ]);
    expect(primary.chartType).toBe("funnel");

    const rising = recommend([
      { stage: "visited", users: 640 },
      { stage: "signed_up", users: 1800 },
      { stage: "activated", users: 4200 },
      { stage: "paid", users: 10000 },
    ]);
    expect(rising.primary.chartType).not.toBe("funnel");
  });

  it("builds a heatmap from two categorical axes and one measure", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      day: ["mon", "tue", "wed"][index % 3],
      hour: String(9 + Math.floor(index / 3)),
      events: 10 + index,
    }));
    const { primary } = recommend(rows);
    expect(primary.chartType).toBe("heatmap");
    expect(primary.x?.field).toBe("day");
    expect(primary.series?.field).toBe("hour");
    expect(primary.colorJob).toBe("sequential");
  });

  it("marks 100% stacked bars as normalized", () => {
    const stacked = recommend([
      { segment: "ent", q1: 10, q2: 20 },
      { segment: "smb", q1: 30, q2: 40 },
    ]).alternatives.find((item) => item.chartType === "stacked_bar_100");
    expect(stacked?.stack).toBe("normalized");
  });

  it("never offers a chart whose data requirements are unmet", () => {
    const { primary, alternatives } = recommend(ranked);
    const offered = [primary, ...alternatives];
    for (const encoding of offered) {
      const definition = CHART_CATALOG.find((item) => item.id === encoding.chartType)!;
      expect(definition).toBeDefined();
      expect(offered.filter((item) => item.chartType === encoding.chartType)).toHaveLength(1);
    }
    expect(offered.map((item) => item.chartType)).not.toContain("scatter");
    expect(offered.map((item) => item.chartType)).not.toContain("line");
    expect(offered.map((item) => item.chartType)).not.toContain("histogram");
  });

  it("always falls back to a table", () => {
    const { primary, alternatives } = recommend([{ note: "just text" }]);
    expect([primary, ...alternatives].map((item) => item.chartType)).toContain("table");
  });
});

describe("long time axes", () => {
  it("still offers a line for a two-year monthly series", () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      month: `2025-${String((index % 12) + 1).padStart(2, "0")}-01`,
      revenue: 100 + index,
    }));
    const { primary } = recommendCharts(profileResult(["month", "revenue"], rows));
    expect(primary.chartType).toBe("line");
  });

  it("pivots a long monthly series split by segment into a multi-series line", () => {
    const rows = Array.from({ length: 72 }, (_, index) => ({
      ordered_at: `2025-${String((index % 24) + 1).padStart(2, "0")}-01`,
      segment: ["enterprise", "mid_market", "startup"][index % 3],
      net_revenue: 1000 + index,
    }));
    const { primary } = recommendCharts(profileResult(["ordered_at", "segment", "net_revenue"], rows));
    expect(primary.chartType).toBe("multi_line");
    expect(primary.series?.field).toBe("segment");
  });
});
