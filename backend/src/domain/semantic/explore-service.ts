import { randomUUID } from "node:crypto";
import { profileResult } from "../prompt-engine/data-profile";
import { recommendCharts } from "../prompt-engine/chart-mapper";
import type { ChartType } from "../prompt-engine/chart-catalog";
import { engineDialect, runCompiledQuery } from "../execution/query-service";
import type { ExecutionStats } from "../execution/types";
import { channel, createChartSpec, DEFAULT_LIMIT, type ChartSpec } from "./chart-spec";
import { validateChartSpec, type ValidationIssue } from "./chart-spec-validator";
import type { ComparisonOperator, FilterValue } from "./filter-ast";
import { emptyFilterSet, toFilterNode, type FilterClause, type FilterSet } from "./filter-set";
import { compileQuery } from "./query-compiler";
import { demoSemanticModel } from "./demo-warehouse";
import { fieldByName, type Aggregation, type SemanticModel, type TimeGrain } from "./semantic-model";

export type ExploreChannelInput = {
  field: string;
  aggregation?: Aggregation;
  grain?: TimeGrain | null;
};

export type ExploreFilterInput = {
  field: string;
  operator: ComparisonOperator;
  values: FilterValue[];
};

export type ExploreQueryInput = {
  chartType?: ChartType | null;
  dimensions: ExploreChannelInput[];
  measures: ExploreChannelInput[];
  filters?: FilterSet | ExploreFilterInput[] | null;
  sort?: { field: string; direction: "asc" | "desc" }[];
  limit?: number;
};

// Dashboards saved before filters became a tree still carry a flat array.
export function normalizeFilters(input: FilterSet | ExploreFilterInput[] | null | undefined): FilterSet {
  if (!input) return emptyFilterSet();
  if (Array.isArray(input)) {
    return {
      combinator: "and",
      clauses: input.map((item): FilterClause => ({
        kind: "condition",
        field: item.field,
        operator: item.operator,
        values: item.values,
      })),
      groups: [],
    };
  }
  return { combinator: input.combinator ?? "and", negate: input.negate, clauses: input.clauses ?? [], groups: input.groups ?? [] };
}

export class ExploreError extends Error {
  readonly code: string;
  readonly issues: ValidationIssue[];

  constructor(code: string, message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "ExploreError";
    this.code = code;
    this.issues = issues;
  }
}

export function activeModel(): SemanticModel {
  return demoSemanticModel;
}

export function describeModel(model: SemanticModel = activeModel()) {
  return {
    id: model.id,
    label: model.label,
    description: model.description,
    baseTable: model.baseTable,
    engine: engineDialect(),
    dialect: engineDialect(),
    fields: model.fields
      .filter((field) => !field.hidden)
      .map((field) => ({
        name: field.name,
        label: field.label,
        description: field.description,
        table: field.table,
        role: field.role,
        semanticType: field.semanticType,
        defaultAggregation: field.defaultAggregation,
        allowedAggregations: field.allowedAggregations,
        format: field.format,
        synonyms: field.synonyms,
        geographyLevel: field.geographyLevel,
      })),
    metrics: model.metrics.map((metric) => ({
      name: metric.name,
      label: metric.label,
      description: metric.description,
      format: metric.format,
    })),
    hierarchies: model.hierarchies,
  };
}

function toSpec(model: SemanticModel, input: ExploreQueryInput): ChartSpec {
  const dimensions = input.dimensions.map((item) =>
    channel(item.field, { aggregation: item.aggregation ?? "none", grain: item.grain ?? null }),
  );
  const measures = input.measures.map((item) => {
    const field = fieldByName(model, item.field);
    return channel(item.field, { aggregation: item.aggregation ?? field?.defaultAggregation ?? "sum" });
  });
  const filters = toFilterNode(normalizeFilters(input.filters));

  return createChartSpec({
    id: randomUUID(),
    chartType: input.chartType ?? "table",
    modelId: model.id,
    dimensions,
    measures,
    filters,
    sort: input.sort ?? [],
    limit: input.limit ?? DEFAULT_LIMIT,
    encoding: {
      x: dimensions[0] ?? null,
      y: measures,
      series: dimensions[1] ?? null,
      color: null,
      size: null,
      theta: null,
      tooltip: [],
    },
  });
}

export async function runExploreQuery(input: ExploreQueryInput, options: { signal?: AbortSignal } = {}) {
  const model = activeModel();
  if (input.dimensions.length === 0 && input.measures.length === 0) {
    throw new ExploreError("EMPTY_SELECTION", "Choose at least one field to query.");
  }

  const spec = toSpec(model, input);
  const dialect = engineDialect();
  const validation = validateChartSpec(model, { ...spec, chartType: "table" }, { dialect });
  if (!validation.valid) {
    throw new ExploreError("INVALID_SELECTION", "This field selection cannot be queried.", validation.issues);
  }

  const compiled = compileQuery(model, spec, { dialect });
  const executed = await runCompiledQuery(compiled, { signal: options.signal });

  const result = {
    columns: executed.columns.map((column) => column.name),
    rows: executed.rows,
    rowCount: executed.rowCount,
    truncated: executed.truncated,
  };
  const profile = profileResult(result.columns, result.rows);
  const recommendation = recommendCharts(profile);
  const requested = input.chartType
    ? [recommendation.primary, ...recommendation.alternatives].find((item) => item.chartType === input.chartType)
    : undefined;

  return {
    sql: compiled.sql,
    result,
    stats: executed.stats satisfies ExecutionStats,
    encoding: requested ?? recommendation.primary,
    alternatives: [recommendation.primary, ...recommendation.alternatives].filter(
      (item) => item.chartType !== (requested ?? recommendation.primary).chartType,
    ),
    dataProfile: profile,
    issues: validation.issues,
  };
}
