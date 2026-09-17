export type ComparisonOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_null"
  | "is_not_null";

export type RelativeDateRange =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_week"
  | "previous_week"
  | "this_month"
  | "previous_month"
  | "this_quarter"
  | "previous_quarter"
  | "this_year"
  | "previous_year"
  | "year_to_date"
  | "month_to_date"
  | "quarter_to_date";

export type FilterScope = "global" | "page" | "chart" | "cross" | "drill";

export type FilterValue = string | number | boolean | null;

export type ConditionNode = {
  kind: "condition";
  field: string;
  operator: ComparisonOperator;
  values: FilterValue[];
};

export type RelativeDateNode = {
  kind: "relative_date";
  field: string;
  range: RelativeDateRange;
};

export type AbsoluteDateNode = {
  kind: "absolute_date";
  field: string;
  from: string;
  to: string;
};

export type TopNNode = {
  kind: "top_n";
  field: string;
  measure: string;
  direction: "top" | "bottom";
  n: number;
};

export type GroupNode = {
  kind: "and" | "or";
  children: FilterNode[];
};

export type NotNode = {
  kind: "not";
  child: FilterNode;
};

export type FilterNode =
  | ConditionNode
  | RelativeDateNode
  | AbsoluteDateNode
  | TopNNode
  | GroupNode
  | NotNode;

export type ScopedFilter = {
  id: string;
  scope: FilterScope;
  source: string | null;
  node: FilterNode;
};

export const and = (...children: FilterNode[]): GroupNode => ({ kind: "and", children });
export const or = (...children: FilterNode[]): GroupNode => ({ kind: "or", children });
export const not = (child: FilterNode): NotNode => ({ kind: "not", child });
export const where = (field: string, operator: ComparisonOperator, ...values: FilterValue[]): ConditionNode =>
  ({ kind: "condition", field, operator, values });
export const relativeDate = (field: string, range: RelativeDateRange): RelativeDateNode =>
  ({ kind: "relative_date", field, range });
export const absoluteDate = (field: string, from: string, to: string): AbsoluteDateNode =>
  ({ kind: "absolute_date", field, from, to });
export const topN = (field: string, measure: string, n: number, direction: "top" | "bottom" = "top"): TopNNode =>
  ({ kind: "top_n", field, measure, direction, n });

export const OPERATOR_ARITY: Record<ComparisonOperator, { min: number; max: number }> = {
  eq: { min: 1, max: 1 },
  neq: { min: 1, max: 1 },
  gt: { min: 1, max: 1 },
  gte: { min: 1, max: 1 },
  lt: { min: 1, max: 1 },
  lte: { min: 1, max: 1 },
  between: { min: 2, max: 2 },
  in: { min: 1, max: Number.MAX_SAFE_INTEGER },
  not_in: { min: 1, max: Number.MAX_SAFE_INTEGER },
  contains: { min: 1, max: 1 },
  not_contains: { min: 1, max: 1 },
  starts_with: { min: 1, max: 1 },
  ends_with: { min: 1, max: 1 },
  is_null: { min: 0, max: 0 },
  is_not_null: { min: 0, max: 0 },
};

export const TEXT_ONLY_OPERATORS: ComparisonOperator[] = ["contains", "not_contains", "starts_with", "ends_with"];
export const ORDERED_ONLY_OPERATORS: ComparisonOperator[] = ["gt", "gte", "lt", "lte", "between"];

export function combine(nodes: FilterNode[]): FilterNode | null {
  const present = nodes.filter(Boolean);
  if (present.length === 0) return null;
  if (present.length === 1) return present[0]!;
  return and(...present);
}

export function fieldsUsed(node: FilterNode | null): string[] {
  if (!node) return [];
  switch (node.kind) {
    case "and":
    case "or":
      return node.children.flatMap(fieldsUsed);
    case "not":
      return fieldsUsed(node.child);
    case "top_n":
      return [node.field, node.measure];
    default:
      return [node.field];
  }
}

export function removeField(node: FilterNode | null, field: string): FilterNode | null {
  if (!node) return null;
  switch (node.kind) {
    case "and":
    case "or": {
      const children = node.children.map((child) => removeField(child, field)).filter((child): child is FilterNode => child !== null);
      if (children.length === 0) return null;
      if (children.length === 1) return children[0]!;
      return { kind: node.kind, children };
    }
    case "not": {
      const child = removeField(node.child, field);
      return child ? { kind: "not", child } : null;
    }
    default:
      return node.field === field ? null : node;
  }
}
