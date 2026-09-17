import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy, Database, Gauge, Loader2, Play, Table2, Timer, X, Zap } from 'lucide-react';
import { useGetSemanticModel, useRunExploreQuery } from '@workspace/api-client-react';
import type { Aggregation, ChartEncoding, ExploreChannel, ExploreFilter, ExploreQueryResult, SemanticModelSummary } from '@workspace/api-client-react';
import { ChartSwitcher, InsightChart } from '@/components/insight-chart';
import { FieldPicker, isMeasure, metricAsField, type PickerField } from '@/components/field-picker';
import { FilterBar } from '@/components/filter-bar';
import { DataResultTable, EmptyState, ErrorState, LoadingBlock, ResultSchema, SectionHeading, useDebouncedValue } from '@/components/studio-ui';

const GRAINS = ['hour', 'day', 'week', 'month', 'quarter', 'year'] as const;
const ROW_LIMITS = [50, 200, 500, 1000] as const;
const NO_VALUE_OPERATORS = ['is_null', 'is_not_null'];

function isComplete(filter: ExploreFilter) {
  if (NO_VALUE_OPERATORS.includes(filter.operator)) return true;
  return filter.values.length > 0 && filter.values.every((value) => value !== '' && value !== null && value !== undefined);
}

type Selection = ExploreChannel & { label: string; role: string };

const humanize = (value: string) => value.replaceAll('_', ' ');

function Chip({
  selection,
  options,
  onChange,
  onRemove,
}: {
  selection: Selection;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/25 bg-primary/8 py-1 pl-2 pr-1 text-[11px]" data-testid={`chip-${selection.field}`}>
      <span className="font-medium text-foreground">{selection.label}</span>
      {options.length > 0 && (
        <span className="relative inline-flex items-center">
          <select
            value={String(selection.aggregation ?? selection.grain ?? '')}
            onChange={(event) => onChange(event.target.value)}
            className="mono cursor-pointer appearance-none rounded-sm bg-transparent py-0.5 pl-1 pr-4 text-[10px] text-primary outline-none"
            data-testid={`chip-option-${selection.field}`}
          >
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <ChevronDown size={10} className="pointer-events-none absolute right-0 text-primary/70" />
        </span>
      )}
      <button type="button" onClick={onRemove} aria-label={`Remove ${selection.label}`} className="rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`chip-remove-${selection.field}`}>
        <X size={12} />
      </button>
    </span>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Timer; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <Icon size={12} className="text-muted-foreground" />
      <span className="mono text-[10px] text-muted-foreground">{value}</span>
    </span>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExplorePage() {
  const modelQuery = useGetSemanticModel();
  const runQuery = useRunExploreQuery();
  const [dimensions, setDimensions] = useState<Selection[]>([]);
  const [measures, setMeasures] = useState<Selection[]>([]);
  const [filters, setFilters] = useState<ExploreFilter[]>([]);
  const [limit, setLimit] = useState<number>(200);
  const [chartType, setChartType] = useState<string | null>(null);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [response, setResponse] = useState<ExploreQueryResult | null>(null);

  const model = modelQuery.data;
  const selectedNames = [...dimensions, ...measures].map((item) => item.field);

  const payload = useMemo(
    () => ({
      chartType,
      dimensions: dimensions.map(({ field, grain }) => ({ field, grain })),
      measures: measures.map(({ field, aggregation }) => ({ field, aggregation })),
      filters: filters.filter(isComplete),
      limit,
    }),
    [dimensions, measures, filters, chartType, limit],
  );
  const debouncedPayload = useDebouncedValue(JSON.stringify(payload), 250);

  const submit = useCallback(
    (body: string) => runQuery.mutate({ data: JSON.parse(body) }, { onSuccess: setResponse }),
    [runQuery.mutate],
  );

  useEffect(() => {
    const body = JSON.parse(debouncedPayload) as { dimensions: unknown[]; measures: unknown[] };
    if (body.dimensions.length === 0 && body.measures.length === 0) {
      setResponse(null);
      return;
    }
    submit(debouncedPayload);
  }, [debouncedPayload, submit]);

  const addField = (field: PickerField) => {
    if (selectedNames.includes(field.name)) return;
    const entry: Selection = {
      field: field.name,
      label: field.label,
      role: field.role,
      aggregation: isMeasure(field) ? (field.defaultAggregation === 'none' ? 'sum' : field.defaultAggregation) : undefined,
      grain: field.role === 'TIME_DIMENSION' ? 'month' : undefined,
    };
    if (isMeasure(field)) setMeasures((current) => [...current, entry]);
    else setDimensions((current) => [...current, entry]);
  };

  const allFields: PickerField[] = model ? [...model.fields, ...model.metrics.map(metricAsField)] : [];
  const fieldFor = (name: string) => allFields.find((item) => item.name === name);

  const optionsFor = (selection: Selection) => {
    if (selection.role === 'TIME_DIMENSION') return GRAINS.map((grain) => ({ value: grain, label: grain }));
    const field = fieldFor(selection.field);
    if (!field || !isMeasure(field) || field.allowedAggregations.length === 0) return [];
    return field.allowedAggregations.map((aggregation) => ({ value: aggregation, label: aggregation.replace('_', ' ') }));
  };

  const update = (kind: 'dimension' | 'measure', name: string, value: string) => {
    const apply = (current: Selection[]) =>
      current.map((item) =>
        item.field === name
          ? kind === 'measure'
            ? { ...item, aggregation: value as Aggregation }
            : { ...item, grain: value }
          : item,
      );
    if (kind === 'measure') setMeasures(apply);
    else setDimensions(apply);
  };

  const remove = (kind: 'dimension' | 'measure', name: string) => {
    const drop = (current: Selection[]) => current.filter((item) => item.field !== name);
    if (kind === 'measure') setMeasures(drop);
    else setDimensions(drop);
  };

  if (modelQuery.isLoading) {
    return <Frame model={undefined}><div className="grid gap-5 lg:grid-cols-[260px_1fr]"><LoadingBlock lines={10} /><LoadingBlock lines={10} /></div></Frame>;
  }
  if (modelQuery.isError || !model) {
    return <Frame model={undefined}><ErrorState onRetry={() => void modelQuery.refetch()} detail="The semantic model could not be loaded." /></Frame>;
  }

  const encoding = response?.encoding as ChartEncoding | undefined;
  const alternatives = (response?.alternatives ?? []) as ChartEncoding[];
  const hasSelection = dimensions.length > 0 || measures.length > 0;

  return (
    <Frame model={model}>
      <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]">
        <aside className="rounded-sm border border-border bg-card p-4 lg:max-h-[calc(100dvh-13rem)]" data-testid="panel-fields">
          <FieldPicker model={model} selected={selectedNames} onAdd={addField} />
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-sm border border-border bg-card p-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1 basis-[260px]">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Group by</p>
                <div className="flex min-h-[28px] flex-wrap items-center gap-1.5">
                  {dimensions.length === 0 && <span className="text-[11px] text-muted-foreground/70">Add a dimension from the left</span>}
                  {dimensions.map((selection) => (
                    <Chip key={selection.field} selection={selection} options={optionsFor(selection)}
                      onChange={(value) => update('dimension', selection.field, value)}
                      onRemove={() => remove('dimension', selection.field)} />
                  ))}
                </div>
              </div>
              <div className="min-w-0 flex-1 basis-[260px]">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Measure</p>
                <div className="flex min-h-[28px] flex-wrap items-center gap-1.5">
                  {measures.length === 0 && <span className="text-[11px] text-muted-foreground/70">Add a measure from the left</span>}
                  {measures.map((selection) => (
                    <Chip key={selection.field} selection={selection} options={optionsFor(selection)}
                      onChange={(value) => update('measure', selection.field, value)}
                      onRemove={() => remove('measure', selection.field)} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <FilterBar filters={filters} fields={allFields.filter((field) => !isMeasure(field))} onChange={setFilters} />

          {!hasSelection && (
            <EmptyState icon={Play} title="Pick a field to start" detail="Every selection compiles to SQL, runs on the engine, and comes back aggregated — raw rows never reach the browser." />
          )}

          {hasSelection && runQuery.isError && (
            <ErrorState title="That selection could not be queried" detail={(runQuery.error as { data?: { error?: string } } | null)?.data?.error ?? 'The engine rejected the compiled query.'} />
          )}

          {response && (
            <>
              <section className="rounded-sm border border-border bg-card p-4" data-testid="panel-chart">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <ChartSwitcher
                    options={encoding ? [encoding, ...alternatives] : []}
                    active={encoding?.chartType ?? ''}
                    onSelect={(next) => setChartType(next.chartType)}
                  />
                  <div className="flex items-center gap-3">
                    <Stat icon={Database} label="Engine" value={response.stats.engine} />
                    <Stat icon={Zap} label="Database time" value={`${response.stats.databaseTimeMs}ms`} />
                    <Stat icon={Timer} label="Total time" value={`${response.stats.queryTimeMs}ms`} />
                    <Stat icon={Table2} label="Rows returned" value={`${response.stats.rowsReturned} rows`} />
                    <Stat icon={Gauge} label="Payload" value={formatBytes(response.stats.bytesReturned)} />
                    <label className="flex items-center gap-1.5" title="Maximum rows returned">
                      <span className="sr-only">Row limit</span>
                      <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="mono cursor-pointer rounded-sm border border-input bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground outline-none focus:border-primary" data-testid="select-limit">
                        {ROW_LIMITS.map((option) => <option key={option} value={option}>{option} max</option>)}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="relative rounded-sm border border-border bg-muted/20 p-3">
                  <div className={`transition-opacity duration-150 ${runQuery.isPending ? 'opacity-40' : 'opacity-100'}`}>
                    {encoding && <InsightChart encoding={encoding} result={response.result} height={260} />}
                  </div>
                  {runQuery.isPending && (
                    <div className="absolute inset-0 grid place-items-center" aria-live="polite" data-testid="chart-pending">
                      <span className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
                        <Loader2 size={12} className="animate-spin text-primary" /> Running…
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <section className="overflow-hidden rounded-sm border border-border bg-card">
                <button type="button" onClick={() => setSqlOpen((open) => !open)} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/40" data-testid="button-toggle-sql">
                  <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
                    <ChevronDown size={13} className={`transition-transform ${sqlOpen ? 'rotate-180' : ''}`} /> Generated SQL
                  </span>
                  <span className="mono text-[10px] text-muted-foreground">{response.stats.dialect}</span>
                </button>
                {sqlOpen && (
                  <div className="border-t border-border">
                    <div className="flex justify-end px-4 pt-2">
                      <button type="button" onClick={() => void navigator.clipboard?.writeText(response.sql)} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground hover:text-primary" data-testid="button-copy-explore-sql">
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                    <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap px-4 pb-4 mono text-[11px] leading-6 text-foreground/80">{response.sql}</pre>
                  </div>
                )}
              </section>

              <DataResultTable result={response.result} maxRows={10} />
              <ResultSchema profile={response.dataProfile} />
            </>
          )}
        </section>
      </div>
    </Frame>
  );
}

function Frame({ model, children }: { model: SemanticModelSummary | undefined; children: React.ReactNode }) {
  return (
    <div className="studio-grid min-h-[calc(100dvh-3.5rem)] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="animate-enter-up">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-primary">Explore</p>
            <h1 className="font-display text-3xl font-extrabold tracking-[-.055em] text-foreground sm:text-4xl">Build a query.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Pick fields from the semantic model. Each change compiles to SQL, aggregates on the engine, and returns only the result.
            </p>
          </div>
          {model && (
            <div className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-xs shadow-sm animate-enter-up delay-1" data-testid="badge-model">
              <Database size={13} className="text-primary" />
              <span className="font-medium">{model.label}</span>
              <span className="text-muted-foreground">·</span>
              <span className="mono text-[10px] text-muted-foreground">{model.engine}</span>
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
