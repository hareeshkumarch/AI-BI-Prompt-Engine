import { engineDialect, runCompiledQuery } from "../execution/query-service";
import { compileQuery } from "./query-compiler";
import { channel, createChartSpec } from "./chart-spec";
import { toFilterNode, withoutField, type FilterSet } from "./filter-set";
import { activeModel, ExploreError } from "./explore-service";
import { fieldByName, MEASURE_ROLES } from "./semantic-model";

export type FilterValuesInput = {
  field: string;
  search?: string;
  limit?: number;
  filters?: FilterSet | null;
};

export type FilterValuesResult = {
  field: string;
  values: { value: string; count: number }[];
  truncated: boolean;
  cascadedFrom: string[];
};

const MAX_VALUES = 200;

export async function getFilterValues(
  input: FilterValuesInput,
  options: { signal?: AbortSignal } = {},
): Promise<FilterValuesResult> {
  const model = activeModel();
  const field = fieldByName(model, input.field);
  if (!field) throw new ExploreError("UNKNOWN_FIELD", `Field "${input.field}" is not in the semantic model.`);
  if (MEASURE_ROLES.includes(field.role)) {
    throw new ExploreError("NOT_A_DIMENSION", `"${input.field}" is a measure; it has no value list.`);
  }

  // A field never constrains its own option list, or picking one value would hide the rest.
  const cascade = withoutField(input.filters, input.field);
  const search = input.search?.trim();
  const scoped: FilterSet = search
    ? {
        ...cascade,
        clauses: [...cascade.clauses, { kind: "condition", field: input.field, operator: "contains", values: [search] }],
      }
    : cascade;

  const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? 50)), MAX_VALUES);
  const counter = model.fields.find((item) => item.role === "IDENTIFIER" && item.table === model.baseTable)
    ?? model.fields.find((item) => MEASURE_ROLES.includes(item.role));

  const spec = createChartSpec({
    id: `filter-values-${input.field}`,
    chartType: "table",
    modelId: model.id,
    dimensions: [channel(input.field)],
    measures: counter ? [channel(counter.name, { aggregation: "count" })] : [],
    filters: toFilterNode(scoped),
    sort: counter ? [{ field: counter.name, direction: "desc" }] : [{ field: input.field, direction: "asc" }],
    limit: limit + 1,
  });

  const compiled = compileQuery(model, spec, { dialect: engineDialect() });
  const executed = await runCompiledQuery(compiled, { signal: options.signal, maxRows: limit + 1 });

  const truncated = executed.rows.length > limit;
  return {
    field: input.field,
    values: executed.rows.slice(0, limit).map((row) => ({
      value: String(row[input.field] ?? ""),
      count: counter ? Number(row[counter.name]) || 0 : 0,
    })),
    truncated,
    cascadedFrom: [...new Set(cascade.clauses.map((clause) => clause.field))],
  };
}
