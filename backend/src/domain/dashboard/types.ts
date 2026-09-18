import type { ExploreChannelInput } from "../semantic/explore-service";
import type { FilterSet } from "../semantic/filter-set";

export type WidgetSize = "small" | "medium" | "large" | "full";

export type WidgetQuery = {
  dimensions: ExploreChannelInput[];
  measures: ExploreChannelInput[];
  filters: FilterSet;
  sort: { field: string; direction: "asc" | "desc" }[];
  limit: number;
};

export type Widget = {
  id: string;
  title: string;
  chartType: string | null;
  size: WidgetSize;
  position: number;
  query: WidgetQuery;
};

export type DashboardPage = {
  id: string;
  name: string;
  position: number;
  filters: FilterSet;
  widgets: Widget[];
};

export type RefreshMode = "manual" | "interval";

export type Dashboard = {
  id: string;
  name: string;
  description: string;
  modelId: string;
  filters: FilterSet;
  pages: DashboardPage[];
  refreshMode: RefreshMode;
  refreshIntervalSeconds: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type DashboardSummary = Omit<Dashboard, "pages"> & {
  pageCount: number;
  widgetCount: number;
};

export type DashboardRevision = {
  version: number;
  savedAt: string;
  dashboard: Dashboard;
};

export const WIDGET_SPAN: Record<WidgetSize, number> = {
  small: 3,
  medium: 6,
  large: 9,
  full: 12,
};

export class DashboardError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "DashboardError";
    this.code = code;
    this.status = status;
  }
}
