export type FieldRole =
  | "DIMENSION"
  | "MEASURE"
  | "TIME_DIMENSION"
  | "IDENTIFIER"
  | "GEOGRAPHY"
  | "BOOLEAN"
  | "TEXT"
  | "DERIVED_FIELD"
  | "METRIC";

export type SemanticType =
  | "currency"
  | "percent"
  | "number"
  | "integer"
  | "duration"
  | "datetime"
  | "date"
  | "geography"
  | "category"
  | "text"
  | "boolean"
  | "id";

export type Aggregation =
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "count"
  | "count_distinct"
  | "median"
  | "p90"
  | "p95"
  | "none";

export type TimeGrain =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type GeographyLevel = "country" | "state" | "city" | "postal_code" | "latitude" | "longitude";

export type FormatRule = {
  kind: "number" | "currency" | "percent" | "datetime" | "text";
  decimals: number;
  compact: boolean;
  currency: string | null;
  unit: string | null;
};

export type SemanticField = {
  name: string;
  label: string;
  description: string;
  table: string;
  column: string;
  role: FieldRole;
  semanticType: SemanticType;
  defaultAggregation: Aggregation;
  allowedAggregations: Aggregation[];
  format: FormatRule;
  synonyms: string[];
  geographyLevel: GeographyLevel | null;
  sensitive: boolean;
  hidden: boolean;
};

export type Metric = {
  name: string;
  label: string;
  description: string;
  expression: string;
  dependsOn: string[];
  format: FormatRule;
  synonyms: string[];
};

export type Hierarchy = {
  name: string;
  label: string;
  levels: string[];
};

export type Relationship = {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  cardinality: "one_to_one" | "one_to_many" | "many_to_one";
};

export type SemanticModel = {
  id: string;
  label: string;
  description: string;
  baseTable: string;
  fields: SemanticField[];
  metrics: Metric[];
  hierarchies: Hierarchy[];
  relationships: Relationship[];
};

export const NUMERIC_AGGREGATIONS: Aggregation[] = ["sum", "avg", "min", "max", "count", "count_distinct", "median", "p90", "p95"];
export const CATEGORICAL_AGGREGATIONS: Aggregation[] = ["count", "count_distinct", "min", "max"];

export const DIMENSION_ROLES: FieldRole[] = ["DIMENSION", "TIME_DIMENSION", "GEOGRAPHY", "BOOLEAN", "TEXT"];
export const MEASURE_ROLES: FieldRole[] = ["MEASURE", "METRIC", "DERIVED_FIELD"];

export const numberFormat = (over: Partial<FormatRule> = {}): FormatRule => ({
  kind: "number",
  decimals: 0,
  compact: true,
  currency: null,
  unit: null,
  ...over,
});

export const currencyFormat = (currency: string): FormatRule => numberFormat({ kind: "currency", decimals: 2, currency });
export const percentFormat = (): FormatRule => numberFormat({ kind: "percent", decimals: 1, compact: false });
export const textFormat = (): FormatRule => numberFormat({ kind: "text", compact: false });
export const datetimeFormat = (): FormatRule => numberFormat({ kind: "datetime", compact: false });

export function fieldByName(model: SemanticModel, name: string): SemanticField | undefined {
  return model.fields.find((field) => field.name === name);
}

export function metricByName(model: SemanticModel, name: string): Metric | undefined {
  return model.metrics.find((metric) => metric.name === name);
}

export function resolve(model: SemanticModel, name: string): SemanticField | Metric | undefined {
  return fieldByName(model, name) ?? metricByName(model, name);
}

export function isMetric(entry: SemanticField | Metric): entry is Metric {
  return "expression" in entry;
}

export function visibleFields(model: SemanticModel) {
  return model.fields.filter((field) => !field.hidden);
}

export function dimensionsOf(model: SemanticModel) {
  return visibleFields(model).filter((field) => DIMENSION_ROLES.includes(field.role));
}

export function measuresOf(model: SemanticModel) {
  return visibleFields(model).filter((field) => MEASURE_ROLES.includes(field.role));
}

export function timeDimensionsOf(model: SemanticModel) {
  return visibleFields(model).filter((field) => field.role === "TIME_DIMENSION");
}

export function geographyFieldsOf(model: SemanticModel) {
  return visibleFields(model).filter((field) => field.role === "GEOGRAPHY");
}

export function hierarchyFor(model: SemanticModel, fieldName: string) {
  return model.hierarchies.find((hierarchy) => hierarchy.levels.includes(fieldName));
}

export function drillTarget(model: SemanticModel, fieldName: string, direction: "down" | "up") {
  const hierarchy = hierarchyFor(model, fieldName);
  if (!hierarchy) return undefined;
  const index = hierarchy.levels.indexOf(fieldName);
  const next = direction === "down" ? index + 1 : index - 1;
  return hierarchy.levels[next];
}

export function allowsAggregation(entry: SemanticField | Metric, aggregation: Aggregation) {
  if (isMetric(entry)) return aggregation === "none";
  if (aggregation === "none") return DIMENSION_ROLES.includes(entry.role) || entry.role === "IDENTIFIER";
  return entry.allowedAggregations.includes(aggregation);
}

export function qualifiedColumn(field: SemanticField) {
  return `${field.table}.${field.column}`;
}

export function searchFields(model: SemanticModel, term: string) {
  const needle = term.trim().toLowerCase();
  if (!needle) return visibleFields(model);
  return visibleFields(model).filter((field) =>
    [field.name, field.label, field.description, ...field.synonyms].some((value) => value.toLowerCase().includes(needle)),
  );
}
