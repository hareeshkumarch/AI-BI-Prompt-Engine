import type { DataProfile, FieldProfile } from "./data-profile";

export type ChartType =
  | "kpi"
  | "table"
  | "line"
  | "multi_line"
  | "area"
  | "stacked_area"
  | "bar"
  | "bar_horizontal"
  | "grouped_bar"
  | "stacked_bar"
  | "stacked_bar_100"
  | "pie"
  | "donut"
  | "scatter"
  | "bubble"
  | "histogram"
  | "heatmap"
  | "radar"
  | "funnel"
  | "treemap";

export type ChartFamily =
  | "summary"
  | "trend"
  | "comparison"
  | "composition"
  | "distribution"
  | "relationship";

export type ColorJob = "none" | "categorical" | "sequential" | "ordinal";

export type CandidateContext = {
  profile: DataProfile;
  category: FieldProfile | null;
  series: FieldProfile | null;
  measures: FieldProfile[];
};

export type ChartDefinition = {
  id: ChartType;
  label: string;
  family: ChartFamily;
  needs: string;
  axes: [number, number];
  temporal: [number, number];
  measures: [number, number];
  minRows: number;
  maxRows: number;
  maxCategories: number;
  colorJob: ColorJob;
  seriesFrom: "none" | "measures" | "dimension" | "either";
  baseScore: number;
  accepts?: (context: CandidateContext) => boolean;
};

const ANY = Number.MAX_SAFE_INTEGER;

const nonNegative = (context: CandidateContext) =>
  context.measures.every((measure) => (measure.min ?? 0) >= 0);

export const CHART_CATALOG: ChartDefinition[] = [
  {
    id: "kpi",
    label: "KPI",
    family: "summary",
    needs: "A single row with one measure — no dimension to break it down by.",
    axes: [0, 0],
    temporal: [0, 0],
    measures: [1, 2],
    minRows: 1,
    maxRows: 1,
    maxCategories: ANY,
    colorJob: "none",
    seriesFrom: "none",
    baseScore: 95,
  },
  {
    id: "line",
    label: "Line",
    family: "trend",
    needs: "One temporal field plus one or more measures, ordered over time.",
    axes: [1, 1],
    temporal: [1, 1],
    measures: [1, 8],
    minRows: 2,
    maxRows: ANY,
    maxCategories: ANY,
    colorJob: "categorical",
    seriesFrom: "measures",
    baseScore: 90,
  },
  {
    id: "multi_line",
    label: "Multi-series line",
    family: "trend",
    needs: "One temporal field, one categorical field to split into series, and one measure.",
    axes: [2, 2],
    temporal: [1, 1],
    measures: [1, 1],
    minRows: 4,
    maxRows: ANY,
    maxCategories: 8,
    colorJob: "categorical",
    seriesFrom: "dimension",
    baseScore: 88,
  },
  {
    id: "area",
    label: "Area",
    family: "trend",
    needs: "One temporal field and exactly one non-negative measure.",
    axes: [1, 1],
    temporal: [1, 1],
    measures: [1, 1],
    minRows: 3,
    maxRows: ANY,
    maxCategories: ANY,
    colorJob: "none",
    seriesFrom: "none",
    baseScore: 74,
    accepts: nonNegative,
  },
  {
    id: "stacked_area",
    label: "Stacked area",
    family: "composition",
    needs: "One temporal field and two or more non-negative measures that sum to a meaningful total.",
    axes: [1, 2],
    temporal: [1, 1],
    measures: [1, 8],
    minRows: 3,
    maxRows: ANY,
    maxCategories: 8,
    colorJob: "categorical",
    seriesFrom: "either",
    baseScore: 78,
    accepts: nonNegative,
  },
  {
    id: "bar",
    label: "Bar",
    family: "comparison",
    needs: "One categorical field and one measure, with few enough categories to label.",
    axes: [1, 1],
    temporal: [0, 1],
    measures: [1, 1],
    minRows: 2,
    maxRows: 24,
    maxCategories: 24,
    colorJob: "none",
    seriesFrom: "none",
    baseScore: 80,
  },
  {
    id: "bar_horizontal",
    label: "Horizontal bar",
    family: "comparison",
    needs: "One categorical field and one measure — preferred when labels are long or numerous.",
    axes: [1, 1],
    temporal: [0, 1],
    measures: [1, 1],
    minRows: 2,
    maxRows: 40,
    maxCategories: 40,
    colorJob: "none",
    seriesFrom: "none",
    baseScore: 82,
  },
  {
    id: "grouped_bar",
    label: "Grouped bar",
    family: "comparison",
    needs: "One categorical field and two to four measures compared side by side on one scale.",
    axes: [1, 2],
    temporal: [0, 1],
    measures: [1, 4],
    minRows: 2,
    maxRows: 12,
    maxCategories: 12,
    colorJob: "categorical",
    seriesFrom: "either",
    baseScore: 76,
  },
  {
    id: "stacked_bar",
    label: "Stacked bar",
    family: "composition",
    needs: "One categorical field and two or more non-negative measures forming a total.",
    axes: [1, 2],
    temporal: [0, 1],
    measures: [1, 8],
    minRows: 2,
    maxRows: 24,
    maxCategories: 24,
    colorJob: "categorical",
    seriesFrom: "either",
    baseScore: 75,
    accepts: nonNegative,
  },
  {
    id: "stacked_bar_100",
    label: "100% stacked bar",
    family: "composition",
    needs: "Same as stacked bar, when the share of each part matters more than the total.",
    axes: [1, 2],
    temporal: [0, 1],
    measures: [1, 8],
    minRows: 2,
    maxRows: 24,
    maxCategories: 24,
    colorJob: "categorical",
    seriesFrom: "either",
    baseScore: 70,
    accepts: nonNegative,
  },
  {
    id: "pie",
    label: "Pie",
    family: "composition",
    needs: "One categorical field with at most six non-negative parts of a single whole.",
    axes: [1, 1],
    temporal: [0, 0],
    measures: [1, 1],
    minRows: 2,
    maxRows: 6,
    maxCategories: 6,
    colorJob: "categorical",
    seriesFrom: "none",
    baseScore: 58,
    accepts: nonNegative,
  },
  {
    id: "donut",
    label: "Donut",
    family: "composition",
    needs: "Same as pie, with the total free to sit in the middle.",
    axes: [1, 1],
    temporal: [0, 0],
    measures: [1, 1],
    minRows: 2,
    maxRows: 6,
    maxCategories: 6,
    colorJob: "categorical",
    seriesFrom: "none",
    baseScore: 57,
    accepts: nonNegative,
  },
  {
    id: "scatter",
    label: "Scatter",
    family: "relationship",
    needs: "Two measures per row — one for each axis — to show how they relate.",
    axes: [0, 1],
    temporal: [0, 0],
    measures: [2, 2],
    minRows: 5,
    maxRows: ANY,
    maxCategories: 3,
    colorJob: "categorical",
    seriesFrom: "none",
    baseScore: 84,
  },
  {
    id: "bubble",
    label: "Bubble",
    family: "relationship",
    needs: "Three measures — two axes plus a non-negative one for mark size.",
    axes: [0, 1],
    temporal: [0, 0],
    measures: [3, 3],
    minRows: 5,
    maxRows: ANY,
    maxCategories: 3,
    colorJob: "categorical",
    seriesFrom: "none",
    baseScore: 80,
    accepts: nonNegative,
  },
  {
    id: "histogram",
    label: "Histogram",
    family: "distribution",
    needs: "One continuous measure across many rows, with no dimension to group by.",
    axes: [0, 0],
    temporal: [0, 0],
    measures: [1, 1],
    minRows: 20,
    maxRows: ANY,
    maxCategories: ANY,
    colorJob: "none",
    seriesFrom: "none",
    baseScore: 86,
    accepts: (context) => context.measures.every((measure) => measure.continuous),
  },
  {
    id: "heatmap",
    label: "Heatmap",
    family: "comparison",
    needs: "Two categorical fields forming a grid, plus one measure for cell intensity.",
    axes: [2, 2],
    temporal: [0, 1],
    measures: [1, 1],
    minRows: 4,
    maxRows: 400,
    maxCategories: 20,
    colorJob: "sequential",
    seriesFrom: "dimension",
    baseScore: 83,
  },
  {
    id: "radar",
    label: "Radar",
    family: "comparison",
    needs: "One categorical field with three to eight comparable axes, plus two or three measures on a shared scale.",
    axes: [1, 1],
    temporal: [0, 0],
    measures: [2, 3],
    minRows: 3,
    maxRows: 8,
    maxCategories: 8,
    colorJob: "categorical",
    seriesFrom: "none",
    baseScore: 52,
  },
  {
    id: "funnel",
    label: "Funnel",
    family: "composition",
    needs: "An ordered stage field and one measure that decreases from stage to stage.",
    axes: [1, 1],
    temporal: [0, 0],
    measures: [1, 1],
    minRows: 3,
    maxRows: 8,
    maxCategories: 8,
    colorJob: "ordinal",
    seriesFrom: "none",
    baseScore: 96,
    accepts: (context) =>
      context.category?.type === "ordinal" && context.measures[0]?.monotonic === "decreasing",
  },
  {
    id: "treemap",
    label: "Treemap",
    family: "composition",
    needs: "One categorical field with many non-negative parts, sized by one measure.",
    axes: [1, 1],
    temporal: [0, 0],
    measures: [1, 1],
    minRows: 4,
    maxRows: 60,
    maxCategories: 60,
    colorJob: "sequential",
    seriesFrom: "none",
    baseScore: 62,
    accepts: nonNegative,
  },
  {
    id: "table",
    label: "Table",
    family: "summary",
    needs: "Anything — the universal fallback when no chart form fits.",
    axes: [0, ANY],
    temporal: [0, ANY],
    measures: [0, ANY],
    minRows: 0,
    maxRows: ANY,
    maxCategories: ANY,
    colorJob: "none",
    seriesFrom: "none",
    baseScore: 10,
  },
];

export const chartDefinition = (id: ChartType) =>
  CHART_CATALOG.find((definition) => definition.id === id);
