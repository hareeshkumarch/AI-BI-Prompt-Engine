import { Calendar, Hash, MapPin, Plus, Sigma, Tag, ToggleLeft, Type } from 'lucide-react';
import type { Aggregation, SemanticFieldSummary, SemanticModelSummary } from '@workspace/api-client-react';
import { SearchField, useDebouncedValue } from '@/components/studio-ui';
import { useState } from 'react';

const ROLE_ICON: Record<string, typeof Hash> = {
  MEASURE: Sigma,
  METRIC: Sigma,
  DERIVED_FIELD: Sigma,
  TIME_DIMENSION: Calendar,
  GEOGRAPHY: MapPin,
  BOOLEAN: ToggleLeft,
  TEXT: Type,
  DIMENSION: Tag,
  IDENTIFIER: Hash,
};

const ROLE_TONE: Record<string, string> = {
  MEASURE: 'text-[color:var(--series-1)]',
  METRIC: 'text-[color:var(--series-1)]',
  DERIVED_FIELD: 'text-[color:var(--series-1)]',
  TIME_DIMENSION: 'text-[color:var(--series-3)]',
  GEOGRAPHY: 'text-[color:var(--series-2)]',
  BOOLEAN: 'text-[color:var(--series-7)]',
};

export type PickerField = Pick<SemanticFieldSummary, 'name' | 'label' | 'description' | 'role' | 'semanticType' | 'defaultAggregation' | 'allowedAggregations'>;

export const MEASURE_ROLES = ['MEASURE', 'METRIC', 'DERIVED_FIELD'];

export function isMeasure(field: PickerField) {
  return MEASURE_ROLES.includes(field.role);
}

export function metricAsField(metric: SemanticModelSummary['metrics'][number]): PickerField {
  return {
    name: metric.name,
    label: metric.label,
    description: metric.description,
    role: 'METRIC',
    semanticType: 'number',
    defaultAggregation: 'none' as Aggregation,
    allowedAggregations: [],
  };
}

function FieldRow({ field, onAdd, selected }: { field: PickerField; onAdd: (field: PickerField) => void; selected: boolean }) {
  const Icon = ROLE_ICON[field.role] ?? Tag;
  return (
    <button
      type="button"
      onClick={() => onAdd(field)}
      disabled={selected}
      title={field.description || field.label}
      className="group flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
      data-testid={`field-${field.name}`}
    >
      <Icon size={14} className={`shrink-0 ${ROLE_TONE[field.role] ?? 'text-muted-foreground'}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{field.label}</span>
        <span className="mono block truncate text-[10px] text-muted-foreground">{field.semanticType}</span>
      </span>
      {!selected && <Plus size={13} className="shrink-0 text-muted-foreground/0 transition-colors group-hover:text-primary" />}
    </button>
  );
}

export function FieldPicker({
  model,
  selected,
  onAdd,
}: {
  model: SemanticModelSummary;
  selected: string[];
  onAdd: (field: PickerField) => void;
}) {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim().toLowerCase(), 150);

  const all: PickerField[] = [...model.fields, ...model.metrics.map(metricAsField)];
  const matches = term
    ? all.filter((field) => [field.name, field.label, field.description].some((value) => value.toLowerCase().includes(term)))
    : all;

  const groups = [
    { label: 'Measures', fields: matches.filter(isMeasure) },
    { label: 'Time', fields: matches.filter((field) => field.role === 'TIME_DIMENSION') },
    { label: 'Dimensions', fields: matches.filter((field) => !isMeasure(field) && field.role !== 'TIME_DIMENSION') },
  ].filter((group) => group.fields.length > 0);

  return (
    <div className="flex h-full flex-col gap-3">
      <SearchField value={search} onChange={setSearch} placeholder="Search fields…" />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {groups.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No field matches “{search}”.</p>}
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{group.label}</p>
            <div className="space-y-0.5">
              {group.fields.map((field) => (
                <FieldRow key={field.name} field={field} onAdd={onAdd} selected={selected.includes(field.name)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
