import type { FilterNode } from "./filter-ast";
import type { Aggregation, FormatRule, TimeGrain } from "./semantic-model";
import type { ChartType } from "../prompt-engine/chart-catalog";

export type EncodingChannel = "x" | "y" | "series" | "color" | "size" | "theta" | "row" | "column" | "tooltip";

export type ChannelRef = {
  field: string;
  aggregation: Aggregation;
  grain: TimeGrain | null;
  label: string | null;
};

export type Encoding = {
  x: ChannelRef | null;
  y: ChannelRef[];
  series: ChannelRef | null;
  color: ChannelRef | null;
  size: ChannelRef | null;
  theta: ChannelRef | null;
  tooltip: ChannelRef[];
};

export type SortSpec = {
  field: string;
  direction: "asc" | "desc";
};

export type InteractionConfig = {
  crossFilter: boolean;
  drillDown: boolean;
  drillPath: string[];
  zoom: boolean;
  brush: boolean;
  legendToggle: boolean;
  viewData: boolean;
  downloadData: boolean;
  fullScreen: boolean;
};

export type RendererHint = "auto" | "svg" | "canvas" | "webgl";

export type ChartSpec = {
  id: string;
  title: string;
  chartType: ChartType;
  modelId: string;
  dimensions: ChannelRef[];
  measures: ChannelRef[];
  encoding: Encoding;
  filters: FilterNode | null;
  sort: SortSpec[];
  limit: number;
  timeGrain: TimeGrain | null;
  formatting: Record<string, FormatRule>;
  interaction: InteractionConfig;
  renderer: RendererHint;
};

export const DEFAULT_LIMIT = 500;

export const channel = (field: string, over: Partial<ChannelRef> = {}): ChannelRef => ({
  field,
  aggregation: "none",
  grain: null,
  label: null,
  ...over,
});

export const emptyEncoding = (): Encoding => ({
  x: null,
  y: [],
  series: null,
  color: null,
  size: null,
  theta: null,
  tooltip: [],
});

export const defaultInteraction = (): InteractionConfig => ({
  crossFilter: true,
  drillDown: true,
  drillPath: [],
  zoom: false,
  brush: false,
  legendToggle: true,
  viewData: true,
  downloadData: true,
  fullScreen: true,
});

export function createChartSpec(over: Partial<ChartSpec> & Pick<ChartSpec, "id" | "chartType" | "modelId">): ChartSpec {
  return {
    title: "",
    dimensions: [],
    measures: [],
    encoding: emptyEncoding(),
    filters: null,
    sort: [],
    limit: DEFAULT_LIMIT,
    timeGrain: null,
    formatting: {},
    interaction: defaultInteraction(),
    renderer: "auto",
    ...over,
  };
}

export function channelRefs(encoding: Encoding): { channel: EncodingChannel; ref: ChannelRef }[] {
  const entries: { channel: EncodingChannel; ref: ChannelRef }[] = [];
  if (encoding.x) entries.push({ channel: "x", ref: encoding.x });
  for (const ref of encoding.y) entries.push({ channel: "y", ref });
  if (encoding.series) entries.push({ channel: "series", ref: encoding.series });
  if (encoding.color) entries.push({ channel: "color", ref: encoding.color });
  if (encoding.size) entries.push({ channel: "size", ref: encoding.size });
  if (encoding.theta) entries.push({ channel: "theta", ref: encoding.theta });
  for (const ref of encoding.tooltip) entries.push({ channel: "tooltip", ref });
  return entries;
}

export const MEASURE_CHANNELS: EncodingChannel[] = ["y", "size", "theta"];
export const DIMENSION_CHANNELS: EncodingChannel[] = ["x", "series", "color", "row", "column"];
