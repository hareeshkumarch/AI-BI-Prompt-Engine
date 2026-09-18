import { useState } from 'react';
import { Ban, Filter, Plus, X } from 'lucide-react';
import type { FilterClause, FilterClauseOperator, FilterSet, RelativeDateRange } from '@workspace/api-client-react';
import type { PickerField } from '@/components/field-picker';
import { ValuePicker } from '@/components/value-picker';

const TEXT_TYPES = ['category', 'text', 'geography', 'id'];
const ORDERED_TYPES = ['currency', 'percent', 'number', 'integer', 'duration'];
const TEMPORAL_TYPES = ['datetime', 'date'];

const OPERATOR_LABEL: Record<string, string> = {
  eq: 'is', neq: 'is not', gt: '>', gte: '≥', lt: '<', lte: '≤',
  between: 'between', in: 'is any of', not_in: 'is none of',
  contains: 'contains', not_contains: 'does not contain',
  starts_with: 'starts with', ends_with: 'ends with',
  is_null: 'is empty', is_not_null: 'is not empty',
};

export const DATE_PRESETS: { value: RelativeDateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'this_week', label: 'This week' },
  { value: 'previous_week', label: 'Previous week' },
  { value: 'this_month', label: 'This month' },
  { value: 'previous_month', label: 'Previous month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'previous_quarter', label: 'Previous quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'previous_year', label: 'Previous year' },
  { value: 'year_to_date', label: 'Year to date' },
  { value: 'month_to_date', label: 'Month to date' },
  { value: 'quarter_to_date', label: 'Quarter to date' },
];

const PICKER_OPERATORS: FilterClauseOperator[] = ['eq', 'neq', 'in', 'not_in'];
const NO_VALUE: FilterClauseOperator[] = ['is_null', 'is_not_null'];
const TWO_VALUE: FilterClauseOperator[] = ['between'];

export function operatorsFor(semanticType: string): FilterClauseOperator[] {
  if (ORDERED_TYPES.includes(semanticType)) return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'];
  if (TEXT_TYPES.includes(semanticType)) return ['eq', 'neq', 'in', 'not_in', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_null', 'is_not_null'];
  return ['eq', 'neq', 'in', 'not_in', 'is_null', 'is_not_null'];
}

export const emptyFilterSet = (): FilterSet => ({ combinator: 'and', clauses: [], groups: [] });

export function isClauseComplete(clause: FilterClause) {
  if (clause.kind === 'condition') {
    if (NO_VALUE.includes(clause.operator!)) return true;
    const values = clause.values ?? [];
    return values.length > 0 && values.every((value) => value !== '' && value !== null && value !== undefined);
  }
  if (clause.kind === 'absolute_date') return !!clause.from && !!clause.to;
  if (clause.kind === 'top_n') return !!clause.measure && Number(clause.n) > 0;
  return true;
}

export function mergeFilterSets(...sets: (FilterSet | null | undefined)[]): FilterSet {
  const present = sets.filter((set): set is FilterSet => !!set);
  return {
    combinator: 'and',
    clauses: present.flatMap((set) => (set.combinator === 'and' && !set.negate ? set.clauses ?? [] : [])),
    groups: [
      ...present.flatMap((set) => set.groups ?? []),
      ...present
        .filter((set) => set.combinator === 'or' || set.negate)
        .map((set) => ({ combinator: set.combinator, negate: set.negate, clauses: set.clauses ?? [] }))
        .filter((group) => group.clauses.length > 0),
    ],
  };
}

export function activeFilters(set: FilterSet): FilterSet {
  return {
    ...set,
    clauses: (set.clauses ?? []).filter(isClauseComplete),
    groups: (set.groups ?? []).map((group) => ({ ...group, clauses: group.clauses.filter(isClauseComplete) })).filter((group) => group.clauses.length > 0),
  };
}

export function defaultClause(field: PickerField): FilterClause {
  if (TEMPORAL_TYPES.includes(field.semanticType)) {
    return { kind: 'relative_date', field: field.name, range: 'last_30_days' };
  }
  return { kind: 'condition', field: field.name, operator: operatorsFor(field.semanticType)[0]!, values: [] };
}

const select = 'mono cursor-pointer rounded-sm border border-input bg-card px-1.5 py-1 text-[10px] text-muted-foreground outline-none focus:border-primary';
const input = 'w-24 rounded-sm border border-input bg-card px-1.5 py-1 text-[11px] outline-none focus:border-primary';

function ClauseRow({
  clause,
  field,
  scope,
  measures,
  onChange,
  onRemove,
}: {
  clause: FilterClause;
  field: PickerField | undefined;
  scope: FilterSet;
  measures: PickerField[];
  onChange: (next: FilterClause) => void;
  onRemove: () => void;
}) {
  const semanticType = field?.semanticType ?? 'category';
  const numeric = ORDERED_TYPES.includes(semanticType);
  const usesPicker = clause.kind === 'condition' && PICKER_OPERATORS.includes(clause.operator!) && !numeric;
  const rankable = measures.length > 0 && !numeric && !TEMPORAL_TYPES.includes(semanticType);
  const slots = clause.kind === 'condition' && TWO_VALUE.includes(clause.operator!) ? 2 : 1;

  const setValue = (index: number, raw: string) => {
    const values = [...(clause.values ?? [])];
    values[index] = numeric && raw !== '' ? Number(raw) : raw;
    onChange({ ...clause, values });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border bg-muted/25 px-2 py-1.5" data-testid={`filter-${clause.field}`}>
      <button
        type="button"
        onClick={() => onChange({ ...clause, negate: !clause.negate })}
        aria-pressed={!!clause.negate}
        title={clause.negate ? 'Negated — click to un-negate' : 'Negate this condition'}
        className={`rounded-sm p-0.5 transition-colors ${clause.negate ? 'text-destructive' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
        data-testid={`filter-negate-${clause.field}`}
      >
        <Ban size={11} />
      </button>

      <span className="text-[11px] font-medium text-foreground">{field?.label ?? clause.field}</span>

      {clause.kind === 'condition' && (
        <>
          <select
            value={clause.operator}
            onChange={(event) => {
              const operator = event.target.value as FilterClauseOperator;
              if ((operator as string) === '__top_n') {
                onChange({ kind: 'top_n', field: clause.field, measure: measures[0]!.name, direction: 'top', n: 5, negate: clause.negate });
                return;
              }
              onChange({ ...clause, operator, values: NO_VALUE.includes(operator) ? [] : (clause.values ?? []) });
            }}
            aria-label={`Operator for ${field?.label ?? clause.field}`}
            className={select}
            data-testid={`filter-operator-${clause.field}`}
          >
            {operatorsFor(semanticType).map((operator) => <option key={operator} value={operator}>{OPERATOR_LABEL[operator]}</option>)}
            {rankable && <option value="__top_n">ranks in</option>}
          </select>

          {!NO_VALUE.includes(clause.operator!) && (
            usesPicker ? (
              <ValuePicker
                field={clause.field}
                label={field?.label ?? clause.field}
                selected={(clause.values ?? []) as string[]}
                scope={scope}
                multiple={clause.operator === 'in' || clause.operator === 'not_in'}
                onChange={(values) => onChange({ ...clause, values })}
              />
            ) : (
              Array.from({ length: slots }, (_, index) => (
                <input
                  key={index}
                  type={numeric ? 'number' : 'text'}
                  value={String(clause.values?.[index] ?? '')}
                  onChange={(event) => setValue(index, event.target.value)}
                  placeholder={slots === 2 ? (index === 0 ? 'from' : 'to') : 'value'}
                  aria-label={`Value ${index + 1} for ${field?.label ?? clause.field}`}
                  className={input}
                  data-testid={`filter-value-${clause.field}${index > 0 ? `-${index}` : ''}`}
                />
              ))
            )
          )}
        </>
      )}

      {clause.kind === 'relative_date' && (
        <select
          value={clause.range}
          onChange={(event) => onChange({ ...clause, range: event.target.value as RelativeDateRange })}
          aria-label={`Date range for ${field?.label ?? clause.field}`}
          className={select}
          data-testid={`filter-preset-${clause.field}`}
        >
          {DATE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
          <option value="__custom">Custom range…</option>
        </select>
      )}

      {clause.kind === 'absolute_date' && (
        <>
          <input type="date" value={clause.from ?? ''} onChange={(event) => onChange({ ...clause, from: event.target.value })} aria-label="From" className={input} data-testid={`filter-from-${clause.field}`} />
          <input type="date" value={clause.to ?? ''} onChange={(event) => onChange({ ...clause, to: event.target.value })} aria-label="To" className={input} data-testid={`filter-to-${clause.field}`} />
          <button type="button" onClick={() => onChange({ kind: 'relative_date', field: clause.field, range: 'last_30_days' })} className="text-[10px] text-muted-foreground hover:text-primary" data-testid={`filter-preset-mode-${clause.field}`}>presets</button>
        </>
      )}

      {clause.kind === 'top_n' && (
        <>
          <select value={clause.direction} onChange={(event) => onChange({ ...clause, direction: event.target.value as 'top' | 'bottom' })} aria-label="Direction" className={select} data-testid={`filter-direction-${clause.field}`}>
            <option value="top">top</option>
            <option value="bottom">bottom</option>
          </select>
          <input type="number" min={1} value={clause.n ?? 5} onChange={(event) => onChange({ ...clause, n: Math.max(1, Number(event.target.value) || 1) })} aria-label="Count" className="w-14 rounded-sm border border-input bg-card px-1.5 py-1 text-[11px] outline-none focus:border-primary" data-testid={`filter-n-${clause.field}`} />
          <span className="text-[10px] text-muted-foreground">by</span>
          <select value={clause.measure} onChange={(event) => onChange({ ...clause, measure: event.target.value })} aria-label="Measure" className={select} data-testid={`filter-measure-${clause.field}`}>
            {measures.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}
          </select>
          <button type="button" onClick={() => onChange({ kind: 'condition', field: clause.field, operator: operatorsFor(semanticType)[0]!, values: [], negate: clause.negate })} className="text-[10px] text-muted-foreground hover:text-primary" data-testid={`filter-condition-mode-${clause.field}`}>values</button>
        </>
      )}

      <button type="button" onClick={onRemove} aria-label={`Remove filter on ${field?.label ?? clause.field}`} className="rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`filter-remove-${clause.field}`}>
        <X size={12} />
      </button>
    </div>
  );
}

export function FilterBar({
  filters,
  fields,
  measures,
  onChange,
  title = 'Filters',
  compact = false,
}: {
  filters: FilterSet;
  fields: PickerField[];
  measures: PickerField[];
  onChange: (next: FilterSet) => void;
  title?: string;
  compact?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const clauses = filters.clauses ?? [];
  const available = fields.filter((field) => !clauses.some((clause) => clause.field === field.name));

  const update = (index: number, next: FilterClause) => {
    if (next.kind === 'relative_date' && (next.range as string) === '__custom') {
      onChange({ ...filters, clauses: clauses.map((item, position) => (position === index ? { kind: 'absolute_date', field: next.field, from: '', to: '' } : item)) });
      return;
    }
    onChange({ ...filters, clauses: clauses.map((item, position) => (position === index ? next : item)) });
  };

  return (
    <div className={compact ? '' : 'rounded-sm border border-border bg-card p-4'} data-testid="panel-filters">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
            <Filter size={12} /> {title} {clauses.length > 0 && <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 mono font-bold text-foreground">{clauses.length}</span>}
          </p>
          {clauses.length > 1 && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, combinator: filters.combinator === 'and' ? 'or' : 'and' })}
              title="Toggle how these conditions combine"
              className="rounded-sm border border-border bg-card px-1.5 py-0.5 mono text-[10px] font-semibold uppercase text-primary hover:border-primary/40"
              data-testid="button-combinator"
            >
              {filters.combinator}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {clauses.length > 0 && (
            <button type="button" onClick={() => onChange(emptyFilterSet())} className="text-[10px] font-semibold text-muted-foreground hover:text-destructive" data-testid="button-clear-filters">
              Clear all
            </button>
          )}
          {available.length > 0 && (
            <button type="button" onClick={() => setAdding((open) => !open)} className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground" data-testid="button-add-filter">
              <Plus size={11} /> Add filter
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="mb-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto" data-testid="filter-field-list">
          {available.map((field) => (
            <button
              key={field.name}
              type="button"
              onClick={() => { onChange({ ...filters, clauses: [...clauses, defaultClause(field)] }); setAdding(false); }}
              className="rounded-sm border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
              data-testid={`filter-add-${field.name}`}
            >
              {field.label}
            </button>
          ))}
        </div>
      )}

      {clauses.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No filters — every row in the source is in scope.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {clauses.map((clause, index) => (
            <ClauseRow
              key={`${clause.field}-${index}`}
              clause={clause}
              field={fields.find((item) => item.name === clause.field)}
              scope={filters}
              measures={measures}
              onChange={(next) => update(index, next)}
              onRemove={() => onChange({ ...filters, clauses: clauses.filter((_, position) => position !== index) })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
