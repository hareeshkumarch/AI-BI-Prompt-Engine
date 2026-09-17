import { Filter, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { ExploreFilter, ExploreFilterOperator } from '@workspace/api-client-react';
import type { PickerField } from '@/components/field-picker';

const TEXT_TYPES = ['category', 'text', 'geography', 'id'];
const ORDERED_TYPES = ['currency', 'percent', 'number', 'integer', 'duration', 'datetime', 'date'];

const OPERATOR_LABEL: Record<string, string> = {
  eq: 'is',
  neq: 'is not',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  between: 'between',
  in: 'is any of',
  not_in: 'is none of',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  is_null: 'is empty',
  is_not_null: 'is not empty',
};

const NO_VALUE: ExploreFilterOperator[] = ['is_null', 'is_not_null'];
const MULTI_VALUE: ExploreFilterOperator[] = ['in', 'not_in'];
const TWO_VALUE: ExploreFilterOperator[] = ['between'];

export function operatorsFor(semanticType: string): ExploreFilterOperator[] {
  const base: ExploreFilterOperator[] = ['eq', 'neq', 'in', 'not_in', 'is_null', 'is_not_null'];
  if (ORDERED_TYPES.includes(semanticType)) return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'];
  if (TEXT_TYPES.includes(semanticType)) return [...base, 'contains', 'not_contains', 'starts_with', 'ends_with'];
  return base;
}

export function defaultFilter(field: PickerField): ExploreFilter {
  const operators = operatorsFor(field.semanticType);
  return { field: field.name, operator: operators[0]!, values: [''] };
}

function valueCount(operator: ExploreFilterOperator) {
  if (NO_VALUE.includes(operator)) return 0;
  if (TWO_VALUE.includes(operator)) return 2;
  return 1;
}

function FilterRow({
  filter,
  field,
  onChange,
  onRemove,
}: {
  filter: ExploreFilter;
  field: PickerField | undefined;
  onChange: (next: ExploreFilter) => void;
  onRemove: () => void;
}) {
  const operators = operatorsFor(field?.semanticType ?? 'category');
  const numeric = ORDERED_TYPES.includes(field?.semanticType ?? '') && field?.semanticType !== 'datetime' && field?.semanticType !== 'date';
  const slots = valueCount(filter.operator);
  const isMulti = MULTI_VALUE.includes(filter.operator);

  const setValue = (index: number, raw: string) => {
    const values = [...filter.values];
    values[index] = numeric && raw !== '' ? Number(raw) : raw;
    onChange({ ...filter, values });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border bg-muted/25 px-2 py-1.5" data-testid={`filter-${filter.field}`}>
      <span className="text-[11px] font-medium text-foreground">{field?.label ?? filter.field}</span>
      <select
        value={filter.operator}
        onChange={(event) => {
          const operator = event.target.value as ExploreFilterOperator;
          const next = valueCount(operator);
          onChange({ ...filter, operator, values: Array.from({ length: next }, (_, index) => filter.values[index] ?? '') });
        }}
        className="mono cursor-pointer rounded-sm border border-input bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground outline-none focus:border-primary"
        aria-label={`Operator for ${field?.label ?? filter.field}`}
        data-testid={`filter-operator-${filter.field}`}
      >
        {operators.map((operator) => <option key={operator} value={operator}>{OPERATOR_LABEL[operator] ?? operator}</option>)}
      </select>

      {isMulti ? (
        <input
          value={filter.values.map(String).join(', ')}
          onChange={(event) => onChange({ ...filter, values: event.target.value.split(',').map((part) => part.trim()).filter(Boolean) })}
          placeholder="a, b, c"
          className="w-40 rounded-sm border border-input bg-card px-1.5 py-0.5 text-[11px] outline-none focus:border-primary"
          aria-label={`Values for ${field?.label ?? filter.field}`}
          data-testid={`filter-value-${filter.field}`}
        />
      ) : (
        Array.from({ length: slots }, (_, index) => (
          <input
            key={index}
            type={numeric ? 'number' : 'text'}
            value={String(filter.values[index] ?? '')}
            onChange={(event) => setValue(index, event.target.value)}
            placeholder={slots === 2 ? (index === 0 ? 'from' : 'to') : 'value'}
            className="w-24 rounded-sm border border-input bg-card px-1.5 py-0.5 text-[11px] outline-none focus:border-primary"
            aria-label={`Value ${index + 1} for ${field?.label ?? filter.field}`}
            data-testid={`filter-value-${filter.field}${index > 0 ? `-${index}` : ''}`}
          />
        ))
      )}

      <button type="button" onClick={onRemove} aria-label={`Remove filter on ${field?.label ?? filter.field}`} className="rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`filter-remove-${filter.field}`}>
        <X size={12} />
      </button>
    </div>
  );
}

export function FilterBar({
  filters,
  fields,
  onChange,
}: {
  filters: ExploreFilter[];
  fields: PickerField[];
  onChange: (next: ExploreFilter[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const available = fields.filter((field) => !filters.some((filter) => filter.field === field.name));

  return (
    <div className="rounded-sm border border-border bg-card p-4" data-testid="panel-filters">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
          <Filter size={12} /> Filters {filters.length > 0 && <span className="text-primary">{filters.length}</span>}
        </p>
        <div className="flex items-center gap-2">
          {filters.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-[10px] font-semibold text-muted-foreground hover:text-destructive" data-testid="button-clear-filters">
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
        <div className="mb-2 flex flex-wrap gap-1" data-testid="filter-field-list">
          {available.map((field) => (
            <button
              key={field.name}
              type="button"
              onClick={() => { onChange([...filters, defaultFilter(field)]); setAdding(false); }}
              className="rounded-sm border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
              data-testid={`filter-add-${field.name}`}
            >
              {field.label}
            </button>
          ))}
        </div>
      )}

      {filters.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">No filters — every row in the source is in scope.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filters.map((filter, index) => (
            <FilterRow
              key={filter.field}
              filter={filter}
              field={fields.find((item) => item.name === filter.field)}
              onChange={(next) => onChange(filters.map((item, position) => (position === index ? next : item)))}
              onRemove={() => onChange(filters.filter((_, position) => position !== index))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
