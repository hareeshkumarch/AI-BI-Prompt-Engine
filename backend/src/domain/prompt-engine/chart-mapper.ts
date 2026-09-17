import { CHART_CATALOG, type CandidateContext, type ChartDefinition, type ChartFamily, type ChartType, type ColorJob } from "./chart-catalog";
import type { DataProfile, FieldProfile, FieldType, TemporalGrain } from "./data-profile";

export type FieldRef = {
  field: string;
  type: FieldType;
  grain: TemporalGrain | null;
};

export type ChartEncoding = {
  chartType: ChartType;
  label: string;
  family: ChartFamily;
  rationale: string;
  x: FieldRef | null;
  y: FieldRef[];
  series: FieldRef | null;
  size: FieldRef | null;
  orientation: "vertical" | "horizontal";
  stack: "none" | "stacked" | "normalized";
  colorJob: ColorJob;
  score: number;
};

export type ChartRecommendation = {
  primary: ChartEncoding;
  alternatives: ChartEncoding[];
  profile: DataProfile;
};

const LONG_LABEL = 8;
const MAX_ALTERNATIVES = 6;

const toRef = (field: FieldProfile): FieldRef => ({
  field: field.name,
  type: field.type,
  grain: field.temporalGrain,
});

const fieldsOf = (profile: DataProfile, names: string[]) =>
  names.map((name) => profile.fields.find((field) => field.name === name)).filter((field): field is FieldProfile => !!field);

function averageLabelLength(field: FieldProfile | null) {
  if (!field || field.sampleValues.length === 0) return 0;
  return field.sampleValues.reduce((total, value) => total + value.length, 0) / field.sampleValues.length;
}

function withinGate(count: number, [min, max]: [number, number]) {
  return count >= min && count <= max;
}

function bind(definition: ChartDefinition, profile: DataProfile): ChartEncoding | null {
  const temporalFields = fieldsOf(profile, profile.temporal);
  const axisFields = [...temporalFields, ...fieldsOf(profile, profile.dimensions)];
  const measureFields = fieldsOf(profile, profile.measures);

  if (!withinGate(axisFields.length, definition.axes)) return null;
  if (!withinGate(temporalFields.length, definition.temporal)) return null;
  if (profile.rowCount < definition.minRows || profile.rowCount > definition.maxRows) return null;

  const longFormat = definition.seriesFrom !== "none" && definition.seriesFrom !== "measures" && axisFields.length > 1;
  const seriesField = longFormat ? axisFields[1] ?? null : null;
  if (definition.seriesFrom === "dimension" && !seriesField) return null;
  if (definition.seriesFrom === "either" && !seriesField && measureFields.length < 2) return null;

  const measureCap = longFormat ? 1 : definition.measures[1];
  const boundMeasures = measureFields.slice(0, measureCap);
  if (boundMeasures.length < (longFormat ? 1 : definition.measures[0])) return null;

  const axis = axisFields[0] ?? null;
  // A category cap limits distinguishable marks; a time axis is allowed to be long.
  if (axis && axis.type !== "temporal" && axis.distinctCount > definition.maxCategories) return null;
  if (seriesField && seriesField.distinctCount > definition.maxCategories) return null;

  const context: CandidateContext = { profile, category: axis, series: seriesField, measures: boundMeasures };
  if (definition.accepts && !definition.accepts(context)) return null;

  const isRelationship = definition.family === "relationship";
  let x: FieldRef | null = axis ? toRef(axis) : null;
  let y: FieldRef[] = boundMeasures.map(toRef);
  let size: FieldRef | null = null;

  if (isRelationship) {
    x = toRef(boundMeasures[0]!);
    y = [toRef(boundMeasures[1]!)];
    size = definition.id === "bubble" ? toRef(boundMeasures[2]!) : null;
  } else if (definition.id === "histogram") {
    x = toRef(boundMeasures[0]!);
    y = [];
  } else if (definition.id === "kpi") {
    x = null;
  }

  return {
    chartType: definition.id,
    label: definition.label,
    family: definition.family,
    rationale: definition.needs,
    x,
    y,
    series: seriesField ? toRef(seriesField) : null,
    size,
    orientation: definition.id === "bar_horizontal" ? "horizontal" : "vertical",
    stack: definition.id === "stacked_bar_100" ? "normalized" : definition.id.startsWith("stacked") ? "stacked" : "none",
    colorJob: definition.colorJob,
    score: definition.baseScore,
  };
}

function adjust(encoding: ChartEncoding, definition: ChartDefinition, profile: DataProfile) {
  const category = profile.fields.find((field) => field.name === encoding.x?.field) ?? null;
  const labelLength = averageLabelLength(category);
  const crowded = (category?.distinctCount ?? profile.rowCount) > LONG_LABEL || labelLength > LONG_LABEL;
  let score = definition.baseScore;

  if (definition.id === "bar_horizontal") score += crowded ? 12 : -14;
  if (definition.id === "bar") score += crowded ? -10 : 8;
  if (definition.id === "treemap" && (category?.distinctCount ?? 0) > 12) score += 10;
  if (definition.id === "line" && profile.rowCount >= 4) score += 6;
  if (definition.id === "area" && encoding.y.length === 1 && profile.rowCount >= 4) score += 4;
  if (definition.family === "relationship" && encoding.y.length > 0) {
    score += profile.fields.filter((field) => field.continuous).length >= 2 ? 6 : -4;
  }
  if (definition.id === "radar" && (category?.distinctCount ?? 0) < 3) score -= 20;

  return { ...encoding, score };
}

export function recommendCharts(profile: DataProfile): ChartRecommendation {
  const scored = CHART_CATALOG
    .map((definition) => {
      const encoding = bind(definition, profile);
      return encoding ? adjust(encoding, definition, profile) : null;
    })
    .filter((encoding): encoding is ChartEncoding => encoding !== null)
    .sort((a, b) => b.score - a.score);

  const fallback = scored.find((encoding) => encoding.chartType === "table")!;
  const [primary, ...rest] = scored;

  return {
    primary: primary ?? fallback,
    alternatives: rest.slice(0, MAX_ALTERNATIVES),
    profile,
  };
}
