import { chartDefinition } from "../prompt-engine/chart-catalog";
import { channelRefs, DIMENSION_CHANNELS, MEASURE_CHANNELS, type ChannelRef, type ChartSpec, type EncodingChannel } from "./chart-spec";
import { ORDERED_ONLY_OPERATORS, OPERATOR_ARITY, TEXT_ONLY_OPERATORS, type FilterNode } from "./filter-ast";
import { supportsAggregation } from "./sql-dialect";
import type { SqlDialect } from "../prompt-engine/types";
import {
  allowsAggregation,
  DIMENSION_ROLES,
  fieldByName,
  isMetric,
  MEASURE_ROLES,
  metricByName,
  type SemanticField,
  type SemanticModel,
} from "./semantic-model";

export type Severity = "error" | "warning";

export type ValidationIssue = {
  code: string;
  message: string;
  path: string;
  severity: Severity;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

const ORDERED_TYPES = ["currency", "percent", "number", "integer", "duration", "datetime", "date"];
const TEXT_TYPES = ["category", "text", "geography", "id"];

export function validateChartSpec(
  model: SemanticModel,
  spec: ChartSpec,
  options: { dialect?: SqlDialect } = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string, path: string, severity: Severity = "error") =>
    issues.push({ code, message, path, severity });

  const lookup = (name: string) => fieldByName(model, name) ?? metricByName(model, name);

  if (spec.modelId !== model.id) {
    add("MODEL_MISMATCH", `Spec targets model "${spec.modelId}" but was validated against "${model.id}".`, "modelId");
  }

  const definition = chartDefinition(spec.chartType);
  if (!definition) {
    add("UNKNOWN_CHART_TYPE", `"${spec.chartType}" is not a known chart type.`, "chartType");
  }

  const checkRef = (ref: ChannelRef, path: string, channel: EncodingChannel | null) => {
    const entry = lookup(ref.field);
    if (!entry) {
      add("UNKNOWN_FIELD", `Field "${ref.field}" is not in the semantic model.`, path);
      return;
    }

    const metric = isMetric(entry);
    const role = metric ? "METRIC" : (entry as SemanticField).role;
    const isMeasureLike = metric || MEASURE_ROLES.includes(role);
    const isDimensionLike = !metric && DIMENSION_ROLES.includes(role);

    const aggregatable = ref.aggregation !== "none" && allowsAggregation(entry, ref.aggregation);
    if (channel && MEASURE_CHANNELS.includes(channel) && !isMeasureLike && !aggregatable) {
      add("NOT_A_MEASURE", `Channel "${channel}" needs a measure but "${ref.field}" is a ${role.toLowerCase()}.`, path);
    }
    if (channel && DIMENSION_CHANNELS.includes(channel) && isMeasureLike && channel !== "x") {
      add("NOT_A_DIMENSION", `Channel "${channel}" needs a dimension but "${ref.field}" is a measure.`, path);
    }

    if (ref.aggregation !== "none") {
      if (!allowsAggregation(entry, ref.aggregation)) {
        add(
          "AGGREGATION_NOT_ALLOWED",
          `"${ref.field}" does not allow the ${ref.aggregation} aggregation.`,
          path,
        );
      } else if (options.dialect && !supportsAggregation(ref.aggregation, options.dialect)) {
        add(
          "AGGREGATION_UNSUPPORTED",
          `The ${options.dialect} dialect cannot compute ${ref.aggregation}.`,
          path,
        );
      }
    }

    if (ref.grain && (metric || (entry as SemanticField).role !== "TIME_DIMENSION")) {
      add("INVALID_TIME_GRAIN", `Time grain "${ref.grain}" applies only to a time dimension, not "${ref.field}".`, path);
    }

    if (!metric && isDimensionLike && ref.aggregation === "none" && channel && MEASURE_CHANNELS.includes(channel)) {
      add("MISSING_AGGREGATION", `Channel "${channel}" needs an aggregation for "${ref.field}".`, path);
    }
  };

  spec.dimensions.forEach((ref, index) => checkRef(ref, `dimensions[${index}]`, null));
  spec.measures.forEach((ref, index) => {
    checkRef(ref, `measures[${index}]`, "y");
    const entry = lookup(ref.field);
    if (entry && !isMetric(entry) && ref.aggregation === "none" && entry.defaultAggregation === "none") {
      add("MISSING_AGGREGATION", `Measure "${ref.field}" has no aggregation and no default.`, `measures[${index}]`);
    }
  });

  for (const { channel, ref } of channelRefs(spec.encoding)) {
    checkRef(ref, `encoding.${channel}`, channel);
  }

  if (definition) {
    const dimensionCount = spec.dimensions.length;
    const measureCount = spec.measures.length;
    if (measureCount < definition.measures[0]) {
      add("TOO_FEW_MEASURES", `${definition.label} needs at least ${definition.measures[0]} measure(s); got ${measureCount}.`, "measures");
    }
    if (measureCount > definition.measures[1]) {
      add("TOO_MANY_MEASURES", `${definition.label} accepts at most ${definition.measures[1]} measure(s); got ${measureCount}.`, "measures");
    }
    if (dimensionCount < definition.axes[0]) {
      add("TOO_FEW_DIMENSIONS", `${definition.label} needs at least ${definition.axes[0]} dimension(s); got ${dimensionCount}.`, "dimensions");
    }
    if (dimensionCount > definition.axes[1]) {
      add("TOO_MANY_DIMENSIONS", `${definition.label} accepts at most ${definition.axes[1]} dimension(s); got ${dimensionCount}.`, "dimensions");
    }
  }

  validateFilter(spec.filters, "filters");

  const projected = new Set([...spec.dimensions, ...spec.measures].map((ref) => ref.field));
  spec.sort.forEach((entry, index) => {
    if (!projected.has(entry.field)) {
      add("INVALID_SORT", `Cannot sort by "${entry.field}" — it is not projected by this chart.`, `sort[${index}]`);
    }
  });

  if (!Number.isInteger(spec.limit) || spec.limit < 1) {
    add("INVALID_LIMIT", `Limit must be a positive integer; got ${spec.limit}.`, "limit");
  }

  for (const level of spec.interaction.drillPath) {
    if (!lookup(level)) add("UNKNOWN_DRILL_FIELD", `Drill level "${level}" is not in the semantic model.`, "interaction.drillPath");
  }

  function validateFilter(node: FilterNode | null, path: string) {
    if (!node) return;
    switch (node.kind) {
      case "and":
      case "or":
        node.children.forEach((child, index) => validateFilter(child, `${path}.children[${index}]`));
        return;
      case "not":
        validateFilter(node.child, `${path}.child`);
        return;
      case "top_n": {
        if (!lookup(node.field)) add("UNKNOWN_FIELD", `Filter field "${node.field}" is not in the semantic model.`, path);
        const measure = lookup(node.measure);
        if (!measure) add("UNKNOWN_FIELD", `Top-N measure "${node.measure}" is not in the semantic model.`, path);
        else if (!isMetric(measure) && !MEASURE_ROLES.includes(measure.role)) {
          add("NOT_A_MEASURE", `Top-N must rank by a measure; "${node.measure}" is a ${measure.role.toLowerCase()}.`, path);
        }
        if (!Number.isInteger(node.n) || node.n < 1) add("INVALID_FILTER", `Top-N needs a positive count; got ${node.n}.`, path);
        return;
      }
      case "relative_date":
      case "absolute_date": {
        const entry = lookup(node.field);
        if (!entry) {
          add("UNKNOWN_FIELD", `Filter field "${node.field}" is not in the semantic model.`, path);
          return;
        }
        if (isMetric(entry) || entry.role !== "TIME_DIMENSION") {
          add("INVALID_FILTER", `Date filters apply only to a time dimension, not "${node.field}".`, path);
        }
        return;
      }
      case "condition": {
        const entry = lookup(node.field);
        if (!entry) {
          add("UNKNOWN_FIELD", `Filter field "${node.field}" is not in the semantic model.`, path);
          return;
        }
        const arity = OPERATOR_ARITY[node.operator];
        if (!arity) {
          add("INVALID_FILTER", `Unknown operator "${node.operator}".`, path);
          return;
        }
        if (node.values.length < arity.min || node.values.length > arity.max) {
          add("INVALID_FILTER", `Operator "${node.operator}" does not accept ${node.values.length} value(s).`, path);
        }
        const semanticType = isMetric(entry) ? "number" : entry.semanticType;
        if (TEXT_ONLY_OPERATORS.includes(node.operator) && !TEXT_TYPES.includes(semanticType)) {
          add("INVALID_FILTER", `Operator "${node.operator}" needs a text field; "${node.field}" is ${semanticType}.`, path);
        }
        if (ORDERED_ONLY_OPERATORS.includes(node.operator) && !ORDERED_TYPES.includes(semanticType)) {
          add("INVALID_FILTER", `Operator "${node.operator}" needs an ordered field; "${node.field}" is ${semanticType}.`, path);
        }
        return;
      }
    }
  }

  return { valid: issues.every((issue) => issue.severity !== "error"), issues };
}
