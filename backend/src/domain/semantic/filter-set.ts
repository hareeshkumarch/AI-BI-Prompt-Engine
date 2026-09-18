import {
  absoluteDate,
  and,
  combine,
  not,
  or,
  relativeDate,
  topN,
  where,
  type ComparisonOperator,
  type FilterNode,
  type FilterValue,
  type RelativeDateRange,
} from "./filter-ast";

export type FilterCombinator = "and" | "or";

export type FilterClause =
  | { kind: "condition"; field: string; operator: ComparisonOperator; values: FilterValue[]; negate?: boolean }
  | { kind: "relative_date"; field: string; range: RelativeDateRange; negate?: boolean }
  | { kind: "absolute_date"; field: string; from: string; to: string; negate?: boolean }
  | { kind: "top_n"; field: string; measure: string; direction: "top" | "bottom"; n: number; negate?: boolean };

export type FilterGroup = {
  combinator: FilterCombinator;
  negate?: boolean;
  clauses: FilterClause[];
};

export type FilterSet = {
  combinator: FilterCombinator;
  negate?: boolean;
  clauses: FilterClause[];
  groups?: FilterGroup[];
};

export const emptyFilterSet = (): FilterSet => ({ combinator: "and", clauses: [], groups: [] });

const NO_VALUE: ComparisonOperator[] = ["is_null", "is_not_null"];

function isComplete(clause: FilterClause) {
  if (clause.kind === "condition") {
    if (NO_VALUE.includes(clause.operator)) return true;
    return clause.values.length > 0 && clause.values.every((value) => value !== "" && value !== null && value !== undefined);
  }
  if (clause.kind === "absolute_date") return !!clause.from && !!clause.to;
  if (clause.kind === "top_n") return Number.isInteger(clause.n) && clause.n > 0;
  return true;
}

function clauseToNode(clause: FilterClause): FilterNode {
  const node: FilterNode =
    clause.kind === "condition"
      ? where(clause.field, clause.operator, ...clause.values)
      : clause.kind === "relative_date"
        ? relativeDate(clause.field, clause.range)
        : clause.kind === "absolute_date"
          ? absoluteDate(clause.field, clause.from, clause.to)
          : topN(clause.field, clause.measure, clause.n, clause.direction);
  return clause.negate ? not(node) : node;
}

function groupToNode(group: FilterGroup): FilterNode | null {
  const nodes = group.clauses.filter(isComplete).map(clauseToNode);
  if (nodes.length === 0) return null;
  const combined = nodes.length === 1 ? nodes[0]! : group.combinator === "or" ? or(...nodes) : and(...nodes);
  return group.negate ? not(combined) : combined;
}

export function toFilterNode(set: FilterSet | null | undefined): FilterNode | null {
  if (!set) return null;
  const nodes: FilterNode[] = [
    ...set.clauses.filter(isComplete).map(clauseToNode),
    ...(set.groups ?? []).map(groupToNode).filter((node): node is FilterNode => node !== null),
  ];
  if (nodes.length === 0) return null;
  const combined = set.combinator === "or" && nodes.length > 1 ? or(...nodes) : combine(nodes);
  if (!combined) return null;
  return set.negate ? not(combined) : combined;
}

export function fieldsInSet(set: FilterSet | null | undefined): string[] {
  if (!set) return [];
  const fromClause = (clause: FilterClause) => (clause.kind === "top_n" ? [clause.field, clause.measure] : [clause.field]);
  return [
    ...set.clauses.flatMap(fromClause),
    ...(set.groups ?? []).flatMap((group) => group.clauses.flatMap(fromClause)),
  ];
}

export function withoutField(set: FilterSet | null | undefined, field: string): FilterSet {
  if (!set) return emptyFilterSet();
  const keep = (clause: FilterClause) => clause.field !== field;
  return {
    combinator: set.combinator,
    negate: set.negate,
    clauses: set.clauses.filter(keep),
    groups: (set.groups ?? [])
      .map((group) => ({ ...group, clauses: group.clauses.filter(keep) }))
      .filter((group) => group.clauses.length > 0),
  };
}
