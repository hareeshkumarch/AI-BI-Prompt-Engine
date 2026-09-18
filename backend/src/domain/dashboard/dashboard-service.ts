import { randomUUID } from "node:crypto";
import { activeModel, normalizeFilters } from "../semantic/explore-service";
import { fieldByName, metricByName } from "../semantic/semantic-model";
import { emptyFilterSet, fieldsInSet, type FilterSet } from "../semantic/filter-set";
import { dashboardStore } from "./store";
import {
  DashboardError,
  type Dashboard,
  type DashboardPage,
  type DashboardSummary,
  type Widget,
  type WidgetQuery,
  type WidgetSize,
} from "./types";

const SIZES: WidgetSize[] = ["small", "medium", "large", "full"];
const MAX_NAME = 120;

const now = () => new Date().toISOString();

const trimName = (value: string, fallback: string) => {
  const trimmed = value.trim().slice(0, MAX_NAME);
  return trimmed || fallback;
};

function assertQuery(query: WidgetQuery) {
  const model = activeModel();
  const known = (name: string) => !!(fieldByName(model, name) ?? metricByName(model, name));
  const referenced = [
    ...query.dimensions.map((item) => item.field),
    ...query.measures.map((item) => item.field),
    ...fieldsInSet(query.filters),
    ...query.sort.map((item) => item.field),
  ];
  const unknown = referenced.filter((name) => !known(name));
  if (unknown.length > 0) {
    throw new DashboardError("UNKNOWN_FIELD", 400, `Unknown field(s): ${[...new Set(unknown)].join(", ")}.`);
  }
  if (query.dimensions.length === 0 && query.measures.length === 0) {
    throw new DashboardError("EMPTY_WIDGET", 400, "A widget needs at least one field.");
  }
}

function normalizeQuery(input: Partial<WidgetQuery> | undefined): WidgetQuery {
  return {
    dimensions: input?.dimensions ?? [],
    measures: input?.measures ?? [],
    filters: normalizeFilters(input?.filters),
    sort: input?.sort ?? [],
    limit: Math.min(Math.max(1, Math.trunc(input?.limit ?? 200)), 5000),
  };
}

function assertFilterFields(filters: FilterSet) {
  const model = activeModel();
  const unknown = fieldsInSet(filters).filter((name) => !fieldByName(model, name) && !metricByName(model, name));
  if (unknown.length > 0) {
    throw new DashboardError("UNKNOWN_FIELD", 400, `Unknown field(s): ${[...new Set(unknown)].join(", ")}.`);
  }
}

function reposition<T extends { position: number }>(items: T[]): T[] {
  return items
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((item, index) => ({ ...item, position: index }));
}

function summarize(dashboard: Dashboard): DashboardSummary {
  const { pages, ...rest } = dashboard;
  return {
    ...rest,
    pageCount: pages.length,
    widgetCount: pages.reduce((total, page) => total + page.widgets.length, 0),
  };
}

// Records written before filters became a tree carry a flat array, or nothing at all.
function normalizeDashboard(dashboard: Dashboard): Dashboard {
  return {
    ...dashboard,
    filters: normalizeFilters(dashboard.filters),
    pages: dashboard.pages.map((page) => ({
      ...page,
      filters: normalizeFilters(page.filters),
      widgets: page.widgets.map((widget) => ({ ...widget, query: { ...widget.query, filters: normalizeFilters(widget.query.filters) } })),
    })),
  };
}

async function load(id: string): Promise<Dashboard> {
  const dashboard = await dashboardStore().get(id);
  if (!dashboard) throw new DashboardError("NOT_FOUND", 404, `Dashboard "${id}" does not exist.`);
  return normalizeDashboard(dashboard);
}

function pageOf(dashboard: Dashboard, pageId: string): DashboardPage {
  const page = dashboard.pages.find((item) => item.id === pageId);
  if (!page) throw new DashboardError("PAGE_NOT_FOUND", 404, `Page "${pageId}" does not exist.`);
  return page;
}

async function commit(dashboard: Dashboard): Promise<Dashboard> {
  const next: Dashboard = { ...dashboard, version: dashboard.version + 1, updatedAt: now() };
  return dashboardStore().save(next);
}

export async function listDashboards(): Promise<DashboardSummary[]> {
  return (await dashboardStore().list()).map(summarize);
}

export async function getDashboard(id: string): Promise<Dashboard> {
  return load(id);
}

export async function createDashboard(input: { name?: string; description?: string }): Promise<Dashboard> {
  const timestamp = now();
  const dashboard: Dashboard = {
    id: randomUUID(),
    name: trimName(input.name ?? "", "Untitled dashboard"),
    description: (input.description ?? "").trim().slice(0, 500),
    modelId: activeModel().id,
    filters: emptyFilterSet(),
    pages: [{ id: randomUUID(), name: "Page 1", position: 0, filters: emptyFilterSet(), widgets: [] }],
    refreshMode: "manual",
    refreshIntervalSeconds: 60,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return dashboardStore().save(dashboard);
}

export async function updateDashboard(
  id: string,
  input: { name?: string; description?: string; refreshMode?: "manual" | "interval"; refreshIntervalSeconds?: number },
): Promise<Dashboard> {
  const dashboard = await load(id);
  return commit({
    ...dashboard,
    name: input.name === undefined ? dashboard.name : trimName(input.name, dashboard.name),
    description: input.description === undefined ? dashboard.description : input.description.trim().slice(0, 500),
    refreshMode: input.refreshMode ?? dashboard.refreshMode,
    refreshIntervalSeconds: Math.min(3600, Math.max(10, Math.trunc(input.refreshIntervalSeconds ?? dashboard.refreshIntervalSeconds))),
  });
}

export async function setDashboardFilters(id: string, filters: FilterSet): Promise<Dashboard> {
  const dashboard = await load(id);
  assertFilterFields(filters);
  return commit({ ...dashboard, filters });
}

export async function setPageFilters(id: string, pageId: string, filters: FilterSet): Promise<Dashboard> {
  const dashboard = await load(id);
  pageOf(dashboard, pageId);
  assertFilterFields(filters);
  return commit({
    ...dashboard,
    pages: dashboard.pages.map((item) => (item.id === pageId ? { ...item, filters } : item)),
  });
}

export async function deleteDashboard(id: string): Promise<void> {
  const removed = await dashboardStore().remove(id);
  if (!removed) throw new DashboardError("NOT_FOUND", 404, `Dashboard "${id}" does not exist.`);
}

export async function addPage(id: string, name?: string): Promise<Dashboard> {
  const dashboard = await load(id);
  const page: DashboardPage = {
    id: randomUUID(),
    name: trimName(name ?? "", `Page ${dashboard.pages.length + 1}`),
    position: dashboard.pages.length,
    filters: emptyFilterSet(),
    widgets: [],
  };
  return commit({ ...dashboard, pages: [...dashboard.pages, page] });
}

export async function renamePage(id: string, pageId: string, name: string): Promise<Dashboard> {
  const dashboard = await load(id);
  const page = pageOf(dashboard, pageId);
  return commit({
    ...dashboard,
    pages: dashboard.pages.map((item) => (item.id === pageId ? { ...item, name: trimName(name, page.name) } : item)),
  });
}

export async function deletePage(id: string, pageId: string): Promise<Dashboard> {
  const dashboard = await load(id);
  pageOf(dashboard, pageId);
  if (dashboard.pages.length === 1) {
    throw new DashboardError("LAST_PAGE", 400, "A dashboard must keep at least one page.");
  }
  return commit({ ...dashboard, pages: reposition(dashboard.pages.filter((item) => item.id !== pageId)) });
}

export async function addWidget(
  id: string,
  pageId: string,
  input: { title?: string; chartType?: string | null; size?: WidgetSize; query: Partial<WidgetQuery> },
): Promise<Dashboard> {
  const dashboard = await load(id);
  const page = pageOf(dashboard, pageId);
  const query = normalizeQuery(input.query);
  assertQuery(query);

  const widget: Widget = {
    id: randomUUID(),
    title: trimName(input.title ?? "", "Untitled widget"),
    chartType: input.chartType ?? null,
    size: SIZES.includes(input.size as WidgetSize) ? (input.size as WidgetSize) : "medium",
    position: page.widgets.length,
    query,
  };

  return commit({
    ...dashboard,
    pages: dashboard.pages.map((item) => (item.id === pageId ? { ...item, widgets: [...item.widgets, widget] } : item)),
  });
}

export async function updateWidget(
  id: string,
  pageId: string,
  widgetId: string,
  input: { title?: string; chartType?: string | null; size?: WidgetSize; query?: Partial<WidgetQuery> },
): Promise<Dashboard> {
  const dashboard = await load(id);
  const page = pageOf(dashboard, pageId);
  const widget = page.widgets.find((item) => item.id === widgetId);
  if (!widget) throw new DashboardError("WIDGET_NOT_FOUND", 404, `Widget "${widgetId}" does not exist.`);

  const query = input.query ? normalizeQuery({ ...widget.query, ...input.query }) : widget.query;
  if (input.query) assertQuery(query);

  const next: Widget = {
    ...widget,
    title: input.title === undefined ? widget.title : trimName(input.title, widget.title),
    chartType: input.chartType === undefined ? widget.chartType : input.chartType,
    size: SIZES.includes(input.size as WidgetSize) ? (input.size as WidgetSize) : widget.size,
    query,
  };

  return commit({
    ...dashboard,
    pages: dashboard.pages.map((item) =>
      item.id === pageId ? { ...item, widgets: item.widgets.map((entry) => (entry.id === widgetId ? next : entry)) } : item,
    ),
  });
}

export async function duplicateWidget(id: string, pageId: string, widgetId: string): Promise<Dashboard> {
  const dashboard = await load(id);
  const page = pageOf(dashboard, pageId);
  const widget = page.widgets.find((item) => item.id === widgetId);
  if (!widget) throw new DashboardError("WIDGET_NOT_FOUND", 404, `Widget "${widgetId}" does not exist.`);

  const copy: Widget = {
    ...widget,
    id: randomUUID(),
    title: `${widget.title} (copy)`.slice(0, MAX_NAME),
    position: widget.position + 1,
    query: { ...widget.query },
  };
  const widgets = reposition([
    ...page.widgets.map((item) => (item.position > widget.position ? { ...item, position: item.position + 1 } : item)),
    copy,
  ]);

  return commit({
    ...dashboard,
    pages: dashboard.pages.map((item) => (item.id === pageId ? { ...item, widgets } : item)),
  });
}

export async function deleteWidget(id: string, pageId: string, widgetId: string): Promise<Dashboard> {
  const dashboard = await load(id);
  const page = pageOf(dashboard, pageId);
  if (!page.widgets.some((item) => item.id === widgetId)) {
    throw new DashboardError("WIDGET_NOT_FOUND", 404, `Widget "${widgetId}" does not exist.`);
  }
  return commit({
    ...dashboard,
    pages: dashboard.pages.map((item) =>
      item.id === pageId ? { ...item, widgets: reposition(item.widgets.filter((entry) => entry.id !== widgetId)) } : item,
    ),
  });
}

export async function reorderWidgets(id: string, pageId: string, order: string[]): Promise<Dashboard> {
  const dashboard = await load(id);
  const page = pageOf(dashboard, pageId);
  const known = new Set(page.widgets.map((item) => item.id));
  if (order.length !== page.widgets.length || order.some((widgetId) => !known.has(widgetId))) {
    throw new DashboardError("INVALID_ORDER", 400, "The order must list every widget on the page exactly once.");
  }
  const widgets = order.map((widgetId, index) => ({ ...page.widgets.find((item) => item.id === widgetId)!, position: index }));
  return commit({
    ...dashboard,
    pages: dashboard.pages.map((item) => (item.id === pageId ? { ...item, widgets } : item)),
  });
}

export async function listRevisions(id: string) {
  await load(id);
  return (await dashboardStore().revisions(id)).map((revision) => ({
    version: revision.version,
    savedAt: revision.savedAt,
    widgetCount: revision.dashboard.pages.reduce((total, page) => total + page.widgets.length, 0),
  }));
}

export async function restoreRevision(id: string, version: number): Promise<Dashboard> {
  const current = await load(id);
  const revision = (await dashboardStore().revisions(id)).find((item) => item.version === version);
  if (!revision) throw new DashboardError("REVISION_NOT_FOUND", 404, `Version ${version} is not retained.`);
  return commit(normalizeDashboard({ ...revision.dashboard, version: current.version, createdAt: current.createdAt }));
}
