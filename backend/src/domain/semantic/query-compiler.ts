import type { SqlDialect } from "../prompt-engine/types";
import type { ChannelRef, ChartSpec } from "./chart-spec";
import { OPERATOR_ARITY, type ConditionNode, type FilterNode, type TopNNode } from "./filter-ast";
import { QueryCompileError, type CompiledQuery, type PlanColumn, type PlanJoin, type QueryPlan } from "./query-plan";
import { resolveRelativeDate } from "./relative-date";
import { aggregate, placeholder, qualify, quoteIdentifier, truncateToGrain } from "./sql-dialect";
import {
  fieldByName,
  isMetric,
  metricByName,
  MEASURE_ROLES,
  type SemanticField,
  type SemanticModel,
} from "./semantic-model";

export type CompileOptions = {
  dialect: SqlDialect;
  now?: Date;
  maxLimit?: number;
};

const DEFAULT_MAX_LIMIT = 5000;

type Context = {
  model: SemanticModel;
  dialect: SqlDialect;
  now: Date;
  params: unknown[];
  tables: Set<string>;
};

function requireField(context: Context, name: string): SemanticField {
  const field = fieldByName(context.model, name);
  if (!field) {
    throw new QueryCompileError("UNKNOWN_FIELD", `Field "${name}" is not in the semantic model.`);
  }
  context.tables.add(field.table);
  return field;
}

function columnExpression(context: Context, ref: ChannelRef): string {
  const metric = metricByName(context.model, ref.field);
  if (metric) {
    for (const dependency of metric.dependsOn) requireField(context, dependency);
    return metric.expression;
  }
  const field = requireField(context, ref.field);
  const base = qualify(field.table, field.column, context.dialect);
  if (ref.grain && field.role === "TIME_DIMENSION") return truncateToGrain(base, ref.grain, context.dialect);
  return base;
}

function measureExpression(context: Context, ref: ChannelRef): string {
  const entry = fieldByName(context.model, ref.field) ?? metricByName(context.model, ref.field);
  if (!entry) throw new QueryCompileError("UNKNOWN_FIELD", `Field "${ref.field}" is not in the semantic model.`);
  const expression = columnExpression(context, ref);
  if (isMetric(entry)) return expression;
  const aggregation = ref.aggregation === "none" ? entry.defaultAggregation : ref.aggregation;
  if (aggregation === "none") {
    throw new QueryCompileError("MISSING_AGGREGATION", `Measure "${ref.field}" needs an aggregation.`);
  }
  return aggregate(expression, aggregation, context.dialect);
}

function bind(context: Context, value: unknown) {
  context.params.push(value);
  return placeholder(context.dialect, context.params.length);
}

function compileCondition(context: Context, node: ConditionNode): string {
  const arity = OPERATOR_ARITY[node.operator];
  if (node.values.length < arity.min || node.values.length > arity.max) {
    throw new QueryCompileError("INVALID_FILTER", `Operator "${node.operator}" does not accept ${node.values.length} values.`);
  }
  const column = columnExpression(context, { field: node.field, aggregation: "none", grain: null, label: null });

  switch (node.operator) {
    case "eq":
      return `${column} = ${bind(context, node.values[0])}`;
    case "neq":
      return `${column} <> ${bind(context, node.values[0])}`;
    case "gt":
      return `${column} > ${bind(context, node.values[0])}`;
    case "gte":
      return `${column} >= ${bind(context, node.values[0])}`;
    case "lt":
      return `${column} < ${bind(context, node.values[0])}`;
    case "lte":
      return `${column} <= ${bind(context, node.values[0])}`;
    case "between":
      return `${column} BETWEEN ${bind(context, node.values[0])} AND ${bind(context, node.values[1])}`;
    case "in":
      return `${column} IN (${node.values.map((value) => bind(context, value)).join(", ")})`;
    case "not_in":
      return `${column} NOT IN (${node.values.map((value) => bind(context, value)).join(", ")})`;
    case "contains":
      return `${column} LIKE ${bind(context, `%${String(node.values[0])}%`)}`;
    case "not_contains":
      return `${column} NOT LIKE ${bind(context, `%${String(node.values[0])}%`)}`;
    case "starts_with":
      return `${column} LIKE ${bind(context, `${String(node.values[0])}%`)}`;
    case "ends_with":
      return `${column} LIKE ${bind(context, `%${String(node.values[0])}`)}`;
    case "is_null":
      return `${column} IS NULL`;
    case "is_not_null":
      return `${column} IS NOT NULL`;
  }
}

function compileTopN(context: Context, node: TopNNode, spec: ChartSpec): string {
  const dimension = requireField(context, node.field);
  const measureRef = spec.measures.find((ref) => ref.field === node.measure)
    ?? { field: node.measure, aggregation: "none" as const, grain: null, label: null };
  const column = qualify(dimension.table, dimension.column, context.dialect);
  const measure = measureExpression(context, measureRef);
  const direction = node.direction === "top" ? "DESC" : "ASC";
  const inner = [
    `SELECT ${column}`,
    `FROM ${quoteIdentifier(dimension.table, context.dialect)}`,
    `GROUP BY ${column}`,
    `ORDER BY ${measure} ${direction}`,
    `LIMIT ${Math.max(1, Math.trunc(node.n))}`,
  ].join(" ");
  return `${column} IN (${inner})`;
}

function compileFilter(context: Context, node: FilterNode, spec: ChartSpec): string {
  switch (node.kind) {
    case "and":
    case "or": {
      const parts = node.children.map((child) => compileFilter(context, child, spec)).filter(Boolean);
      if (parts.length === 0) return "";
      if (parts.length === 1) return parts[0]!;
      return `(${parts.join(node.kind === "and" ? " AND " : " OR ")})`;
    }
    case "not":
      return `NOT (${compileFilter(context, node.child, spec)})`;
    case "condition":
      return compileCondition(context, node);
    case "relative_date": {
      const window = resolveRelativeDate(node.range, context.now);
      const column = columnExpression(context, { field: node.field, aggregation: "none", grain: null, label: null });
      return `${column} >= ${bind(context, window.from.toISOString())} AND ${column} < ${bind(context, window.to.toISOString())}`;
    }
    case "absolute_date": {
      const column = columnExpression(context, { field: node.field, aggregation: "none", grain: null, label: null });
      return `${column} >= ${bind(context, node.from)} AND ${column} < ${bind(context, node.to)}`;
    }
    case "top_n":
      return compileTopN(context, node, spec);
  }
}

function resolveJoins(context: Context): PlanJoin[] {
  const base = context.model.baseTable;
  const needed = [...context.tables].filter((table) => table !== base);
  if (needed.length === 0) return [];

  const joins: PlanJoin[] = [];
  const reached = new Set([base]);

  let progress = true;
  while (progress && needed.some((table) => !reached.has(table))) {
    progress = false;
    for (const relationship of context.model.relationships) {
      const forward = reached.has(relationship.fromTable) && !reached.has(relationship.toTable);
      const backward = reached.has(relationship.toTable) && !reached.has(relationship.fromTable);
      if (!forward && !backward) continue;
      const target = forward ? relationship.toTable : relationship.fromTable;
      if (!needed.includes(target) && !context.model.relationships.some((item) => item.toTable === target)) continue;
      joins.push({
        table: quoteIdentifier(target, context.dialect),
        on: `${qualify(relationship.fromTable, relationship.fromColumn, context.dialect)} = ${qualify(relationship.toTable, relationship.toColumn, context.dialect)}`,
      });
      reached.add(target);
      progress = true;
    }
  }

  const unreachable = needed.filter((table) => !reached.has(table));
  if (unreachable.length > 0) {
    throw new QueryCompileError("NO_JOIN_PATH", `No relationship connects ${unreachable.join(", ")} to ${base}.`);
  }
  return joins;
}

export function planQuery(model: SemanticModel, spec: ChartSpec, options: CompileOptions): QueryPlan {
  const context: Context = {
    model,
    dialect: options.dialect,
    now: options.now ?? new Date(),
    params: [],
    tables: new Set([model.baseTable]),
  };

  const select: PlanColumn[] = [];
  const groupBy: string[] = [];

  for (const ref of spec.dimensions) {
    const expression = columnExpression(context, ref);
    const alias = quoteIdentifier(ref.label ?? ref.field, context.dialect);
    select.push({ expression, alias, role: "dimension", sourceField: ref.field });
    groupBy.push(expression);
  }

  for (const ref of spec.measures) {
    const entry = fieldByName(model, ref.field) ?? metricByName(model, ref.field);
    if (entry && !isMetric(entry) && !MEASURE_ROLES.includes(entry.role)) {
      throw new QueryCompileError("NOT_A_MEASURE", `Field "${ref.field}" is a ${entry.role.toLowerCase()} and cannot be aggregated as a measure.`);
    }
    select.push({
      expression: measureExpression(context, ref),
      alias: quoteIdentifier(ref.label ?? ref.field, context.dialect),
      role: "measure",
      sourceField: ref.field,
    });
  }

  if (select.length === 0) {
    throw new QueryCompileError("EMPTY_PROJECTION", "A chart needs at least one dimension or measure.");
  }

  const where: string[] = [];
  if (spec.filters) {
    const compiled = compileFilter(context, spec.filters, spec);
    if (compiled) where.push(compiled);
  }

  const orderBy = spec.sort.length > 0
    ? spec.sort.map((entry) => {
        const column = select.find((item) => item.sourceField === entry.field);
        if (!column) throw new QueryCompileError("INVALID_SORT", `Cannot sort by "${entry.field}" — it is not projected.`);
        return `${column.expression} ${entry.direction === "desc" ? "DESC" : "ASC"}`;
      })
    : defaultOrder(select);

  const joins = resolveJoins(context);
  const maxLimit = options.maxLimit ?? DEFAULT_MAX_LIMIT;

  return {
    dialect: context.dialect,
    select,
    from: quoteIdentifier(model.baseTable, context.dialect),
    joins,
    where,
    groupBy: spec.measures.length > 0 ? groupBy : [],
    orderBy,
    limit: Math.min(Math.max(1, Math.trunc(spec.limit)), maxLimit),
    params: context.params,
  };
}

function defaultOrder(select: PlanColumn[]) {
  const measure = select.find((column) => column.role === "measure");
  if (measure) return [`${measure.expression} DESC`];
  const dimension = select[0];
  return dimension ? [`${dimension.expression} ASC`] : [];
}

export function compileQuery(model: SemanticModel, spec: ChartSpec, options: CompileOptions): CompiledQuery {
  const plan = planQuery(model, spec, options);
  const lines = [
    `SELECT ${plan.select.map((column) => `${column.expression} AS ${column.alias}`).join(", ")}`,
    `FROM ${plan.from}`,
    ...plan.joins.map((join) => `LEFT JOIN ${join.table} ON ${join.on}`),
  ];
  if (plan.where.length > 0) lines.push(`WHERE ${plan.where.join(" AND ")}`);
  if (plan.groupBy.length > 0) lines.push(`GROUP BY ${plan.groupBy.join(", ")}`);
  if (plan.orderBy.length > 0) lines.push(`ORDER BY ${plan.orderBy.join(", ")}`);
  lines.push(`LIMIT ${plan.limit}`);
  return { sql: lines.join("\n"), params: plan.params, plan };
}
