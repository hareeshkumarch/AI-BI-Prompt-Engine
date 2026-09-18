import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it } from "vitest";
import { DashboardStore, dashboardStore, setDashboardStore } from "../store";
import {
  addPage,
  addWidget,
  createDashboard,
  deleteDashboard,
  deletePage,
  deleteWidget,
  duplicateWidget,
  getDashboard,
  listDashboards,
  listRevisions,
  reorderWidgets,
  restoreRevision,
  updateDashboard,
  updateWidget,
} from "../dashboard-service";
import { emptyFilterSet } from "../../semantic/filter-set";
import { DashboardError } from "../types";

const revenueQuery = {
  dimensions: [{ field: "segment" }],
  measures: [{ field: "net_revenue", aggregation: "sum" as const }],
  filters: emptyFilterSet(),
  sort: [],
  limit: 200,
};

const seed = async () => {
  const dashboard = await createDashboard({ name: "Revenue" });
  const page = dashboard.pages[0]!;
  return { dashboard, pageId: page.id };
};

beforeEach(() => {
  setDashboardStore(new DashboardStore(null));
});

describe("dashboards", () => {
  it("creates one with a first page and returns it in the list", async () => {
    const dashboard = await createDashboard({ name: "  Revenue  ", description: "Money" });
    expect(dashboard.name).toBe("Revenue");
    expect(dashboard.pages).toHaveLength(1);
    expect(dashboard.version).toBe(1);

    const list = await listDashboards();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Revenue", pageCount: 1, widgetCount: 0 });
    expect(list[0]).not.toHaveProperty("pages");
  });

  it("falls back to a placeholder name and bumps the version on edit", async () => {
    const created = await createDashboard({ name: "   " });
    expect(created.name).toBe("Untitled dashboard");
    const renamed = await updateDashboard(created.id, { name: "Q3" });
    expect(renamed.name).toBe("Q3");
    expect(renamed.version).toBe(2);
    expect(renamed.updatedAt >= created.updatedAt).toBe(true);
  });

  it("clamps the refresh interval", async () => {
    const { dashboard } = await seed();
    expect((await updateDashboard(dashboard.id, { refreshIntervalSeconds: 1 })).refreshIntervalSeconds).toBe(10);
    expect((await updateDashboard(dashboard.id, { refreshIntervalSeconds: 99999 })).refreshIntervalSeconds).toBe(3600);
  });

  it("reports a missing dashboard rather than throwing a bare error", async () => {
    await expect(getDashboard("nope")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(deleteDashboard("nope")).rejects.toBeInstanceOf(DashboardError);
  });
});

describe("pages", () => {
  it("adds and removes pages but keeps at least one", async () => {
    const { dashboard } = await seed();
    const withTwo = await addPage(dashboard.id);
    expect(withTwo.pages).toHaveLength(2);
    expect(withTwo.pages[1]?.name).toBe("Page 2");

    const backToOne = await deletePage(dashboard.id, withTwo.pages[1]!.id);
    expect(backToOne.pages).toHaveLength(1);
    await expect(deletePage(dashboard.id, backToOne.pages[0]!.id)).rejects.toMatchObject({ code: "LAST_PAGE" });
  });
});

describe("widgets", () => {
  it("adds a widget and validates its fields against the semantic model", async () => {
    const { dashboard, pageId } = await seed();
    const next = await addWidget(dashboard.id, pageId, { title: "By segment", query: revenueQuery });
    const widget = next.pages[0]!.widgets[0]!;
    expect(widget.title).toBe("By segment");
    expect(widget.size).toBe("medium");
    expect(widget.position).toBe(0);
    expect(widget.query.limit).toBe(200);
  });

  it("refuses unknown fields and empty selections", async () => {
    const { dashboard, pageId } = await seed();
    await expect(
      addWidget(dashboard.id, pageId, { query: { ...revenueQuery, dimensions: [{ field: "not_a_field" }] } }),
    ).rejects.toMatchObject({ code: "UNKNOWN_FIELD", status: 400 });
    await expect(
      addWidget(dashboard.id, pageId, { query: { dimensions: [], measures: [] } }),
    ).rejects.toMatchObject({ code: "EMPTY_WIDGET" });
  });

  it("clamps the row limit", async () => {
    const { dashboard, pageId } = await seed();
    const next = await addWidget(dashboard.id, pageId, { query: { ...revenueQuery, limit: 10_000 } });
    expect(next.pages[0]!.widgets[0]!.query.limit).toBe(5000);
  });

  it("duplicates a widget directly after the original and renumbers", async () => {
    const { dashboard, pageId } = await seed();
    await addWidget(dashboard.id, pageId, { title: "A", query: revenueQuery });
    const two = await addWidget(dashboard.id, pageId, { title: "B", query: revenueQuery });
    const first = two.pages[0]!.widgets[0]!;

    const copied = await duplicateWidget(dashboard.id, pageId, first.id);
    const widgets = copied.pages[0]!.widgets;
    expect(widgets.map((item) => item.title)).toEqual(["A", "A (copy)", "B"]);
    expect(widgets.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("reorders widgets and rejects an incomplete order", async () => {
    const { dashboard, pageId } = await seed();
    await addWidget(dashboard.id, pageId, { title: "A", query: revenueQuery });
    const two = await addWidget(dashboard.id, pageId, { title: "B", query: revenueQuery });
    const [a, b] = two.pages[0]!.widgets;

    const reordered = await reorderWidgets(dashboard.id, pageId, [b!.id, a!.id]);
    expect(reordered.pages[0]!.widgets.map((item) => item.title)).toEqual(["B", "A"]);
    await expect(reorderWidgets(dashboard.id, pageId, [a!.id])).rejects.toMatchObject({ code: "INVALID_ORDER" });
  });

  it("renumbers remaining widgets after a delete", async () => {
    const { dashboard, pageId } = await seed();
    await addWidget(dashboard.id, pageId, { title: "A", query: revenueQuery });
    await addWidget(dashboard.id, pageId, { title: "B", query: revenueQuery });
    const three = await addWidget(dashboard.id, pageId, { title: "C", query: revenueQuery });

    const removed = await deleteWidget(dashboard.id, pageId, three.pages[0]!.widgets[0]!.id);
    expect(removed.pages[0]!.widgets.map((item) => item.position)).toEqual([0, 1]);
    expect(removed.pages[0]!.widgets.map((item) => item.title)).toEqual(["B", "C"]);
  });

  it("updates a widget without touching the rest of the page", async () => {
    const { dashboard, pageId } = await seed();
    const added = await addWidget(dashboard.id, pageId, { title: "A", query: revenueQuery });
    const widgetId = added.pages[0]!.widgets[0]!.id;

    const updated = await updateWidget(dashboard.id, pageId, widgetId, { size: "full", chartType: "bar" });
    const widget = updated.pages[0]!.widgets[0]!;
    expect(widget.size).toBe("full");
    expect(widget.chartType).toBe("bar");
    expect(widget.query.measures[0]?.field).toBe("net_revenue");
  });
});

describe("version history", () => {
  it("retains prior versions and restores one", async () => {
    const created = await createDashboard({ name: "First" });
    await updateDashboard(created.id, { name: "Second" });
    await updateDashboard(created.id, { name: "Third" });

    const history = await listRevisions(created.id);
    expect(history.map((item) => item.version)).toEqual([2, 1]);

    const restored = await restoreRevision(created.id, 1);
    expect(restored.name).toBe("First");
    expect(restored.version).toBe(4);
    expect(restored.createdAt).toBe(created.createdAt);
  });

  it("reports an unretained version", async () => {
    const { dashboard } = await seed();
    await expect(restoreRevision(dashboard.id, 99)).rejects.toMatchObject({ code: "REVISION_NOT_FOUND" });
  });
});

describe("durable store", () => {
  it("survives a reload from disk", async () => {
    const path = `${tmpdir()}/dashboards-${randomUUID()}.json`;
    setDashboardStore(new DashboardStore(path));

    const created = await createDashboard({ name: "Persisted" });
    await addWidget(created.id, created.pages[0]!.id, { title: "W", query: revenueQuery });
    await dashboardStore().flush();

    setDashboardStore(new DashboardStore(path));
    const reloaded = await listDashboards();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toMatchObject({ name: "Persisted", widgetCount: 1 });

    await rm(path, { force: true });
  });

  it("upgrades records saved before filters became a tree", async () => {
    const path = `${tmpdir()}/legacy-${randomUUID()}.json`;
    await writeFile(path, JSON.stringify({
      dashboards: [{
        id: "legacy",
        name: "Legacy",
        description: "",
        modelId: "northstar",
        pages: [{
          id: "page-1",
          name: "Page 1",
          position: 0,
          widgets: [{
            id: "widget-1",
            title: "W",
            chartType: null,
            size: "medium",
            position: 0,
            query: { ...revenueQuery, filters: [{ field: "status", operator: "eq", values: ["paid"] }] },
          }],
        }],
        refreshMode: "manual",
        refreshIntervalSeconds: 60,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      revisions: {},
    }), "utf8");
    setDashboardStore(new DashboardStore(path));

    const dashboard = await getDashboard("legacy");
    expect(dashboard.filters).toEqual(emptyFilterSet());
    expect(dashboard.pages[0]!.filters).toEqual(emptyFilterSet());
    expect(dashboard.pages[0]!.widgets[0]!.query.filters).toEqual({
      combinator: "and",
      clauses: [{ kind: "condition", field: "status", operator: "eq", values: ["paid"] }],
      groups: [],
    });

    await rm(path, { force: true });
  });

  it("starts empty when the file is missing or unreadable", async () => {
    setDashboardStore(new DashboardStore(`${tmpdir()}/missing-${randomUUID()}.json`));
    expect(await listDashboards()).toEqual([]);

    const corrupt = `${tmpdir()}/corrupt-${randomUUID()}.json`;
    await writeFile(corrupt, "{ not json", "utf8");
    setDashboardStore(new DashboardStore(corrupt));
    expect(await listDashboards()).toEqual([]);
    await rm(corrupt, { force: true });
  });
});
