import { AlertTriangle, ArrowUpRight, Bird, Check, ChevronDown, Clock3, Database, HardDrive, Loader2, RefreshCw, Search, ShieldCheck, Snowflake, Table2, Terminal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DataProfile, PipelineStage, QueryResult, QueryRunSummary, SchemaTable } from '@workspace/api-client-react';
import { Link } from 'wouter';


export function dialectIcon(kind: string, size = 16) {
  if (kind === 'mysql') return <HardDrive size={size} />;
  if (kind === 'snowflake') return <Snowflake size={size} />;
  if (kind === 'sqlite') return <Terminal size={size} />;
  if (kind === 'duckdb') return <Bird size={size} />;
  return <Database size={size} />;
}

export function useDebouncedValue<T>(value: T, delayMs = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function SectionHeading({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="mb-5 flex items-end justify-between gap-4"><div>{eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.18em] text-primary">{eyebrow}</p>}<h2 className="font-display text-lg font-bold tracking-[-.03em] text-foreground">{title}</h2>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

export function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    completed: { label: 'Completed', cls: 'border-primary/25 bg-primary/10 text-primary' },
    connected: { label: 'Connected', cls: 'border-primary/25 bg-primary/10 text-primary' },
    operational: { label: 'Operational', cls: 'border-primary/25 bg-primary/10 text-primary' },
    running: { label: 'Running', cls: 'border-accent/35 bg-accent/15 text-accent-foreground' },
    degraded: { label: 'Degraded', cls: 'border-accent/35 bg-accent/15 text-accent-foreground' },
    failed: { label: 'Failed', cls: 'border-destructive/25 bg-destructive/10 text-destructive' },
    disconnected: { label: 'Disconnected', cls: 'border-destructive/25 bg-destructive/10 text-destructive' },
    clarification_needed: { label: 'Needs clarity', cls: 'border-chart-3/30 bg-chart-3/10 text-chart-3' },
    queued: { label: 'Queued', cls: 'border-border bg-muted text-muted-foreground' },
    skipped: { label: 'Skipped', cls: 'border-border bg-muted text-muted-foreground' },
  };
  const item = config[status] ?? { label: status, cls: 'border-border bg-muted text-muted-foreground' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] ${item.cls}`} data-testid={`status-${status}`}><span className={`size-1.5 rounded-full ${status === 'running' ? 'animate-signal bg-accent' : status === 'failed' || status === 'disconnected' ? 'bg-destructive' : 'bg-current'}`} />{item.label}</span>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted ${className}`} aria-hidden="true" />;
}

export function LoadingBlock({ lines = 4 }: { lines?: number }) {
  return <div className="space-y-3 rounded-sm border border-border bg-card p-5">{Array.from({ length: lines }).map((_, index) => <Skeleton key={index} className={`h-3 ${index === 0 ? 'w-2/5' : index === lines - 1 ? 'w-3/5' : 'w-full'}`} />)}</div>;
}

export function ErrorState({ title = 'Could not load this view', detail = 'The workspace service did not return a usable response.', onRetry }: { title?: string; detail?: string; onRetry?: () => void }) {
  return <div className="flex flex-col items-center justify-center rounded-sm border border-destructive/25 bg-destructive/5 px-6 py-14 text-center"><AlertTriangle className="mb-3 text-destructive" size={21} /><h3 className="font-display text-sm font-bold">{title}</h3><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{detail}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted" data-testid="button-retry"><RefreshCw size={13} /> Retry</button>}</div>;
}

export function EmptyState({ icon: Icon = Database, title, detail }: { icon?: typeof Database; title: string; detail: string }) {
  return <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border bg-card/50 px-6 py-14 text-center"><span className="mb-3 grid size-10 place-items-center rounded-sm bg-muted text-muted-foreground"><Icon size={19} /></span><h3 className="font-display text-sm font-bold">{title}</h3><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{detail}</p></div>;
}

export function StatCard({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <div className={`rounded-sm border p-4 ${accent ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`} data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-bold tracking-[-.04em]">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div>;
}

export function QueryRunList({ runs, compact = false }: { runs: QueryRunSummary[]; compact?: boolean }) {
  return <div className="divide-y divide-border overflow-hidden rounded-sm border border-border bg-card">{runs.map((run) => <Link href={`/runs/${run.id}`} key={run.id} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/55" data-testid={`link-run-${run.id}`}><span className="grid size-7 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground"><Database size={14} /></span><div className="min-w-0 flex-1"><p className={`truncate text-sm font-medium ${compact ? 'max-w-[360px]' : ''}`}>{run.question}</p><p className="mt-1 text-[11px] text-muted-foreground"><span className="mono">{run.id.slice(0, 8)}</span><span className="mx-2 text-border">·</span>{formatRelative(run.createdAt)}<span className="mx-2 text-border">·</span>{run.rowCount.toLocaleString()} rows</p></div><div className="flex shrink-0 items-center gap-3"><StatusPill status={run.status} /><span className="hidden text-[11px] text-muted-foreground sm:inline">{run.durationMs}ms</span><ArrowUpRight size={15} className="text-muted-foreground/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" /></div></Link>)}</div>;
}

export function formatRelative(value: string) {
  const date = new Date(value);
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DataResultTable({ result, maxRows = 8 }: { result: QueryResult; maxRows?: number }) {
  const rows = result.rows.slice(0, maxRows);
  return <div className="overflow-hidden rounded-sm border border-border bg-card"><div className="flex items-center justify-between border-b border-border bg-muted/45 px-4 py-2.5"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Result preview</span><span className="mono text-[10px] text-muted-foreground">{result.rowCount.toLocaleString()} rows {result.truncated && '· truncated'}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-border bg-muted/20">{result.columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 font-semibold text-muted-foreground">{column}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-border/70 last:border-0 hover:bg-muted/25" data-testid={`row-result-${rowIndex}`}>{result.columns.map((column) => <td key={column} className="max-w-[220px] truncate px-4 py-3 mono text-[11px] text-foreground/80">{formatCell(row[column])}</td>)}</tr>)}</tbody></table></div>{rows.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted-foreground">No rows returned.</div>}</div>;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return <span className="text-muted-foreground/50">null</span>;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function Sparkline({ values, color = 'hsl(var(--primary))' }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 1); const min = Math.min(...values, 0); const range = max - min || 1;
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${34 - ((value - min) / range) * 28}`).join(' ');
  return <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-9 w-full"><polyline points={points} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" /><polyline points={`0,36 ${points} 100,36`} fill={color} opacity=".08" stroke="none" /></svg>;
}

export function Trace({ stages }: { stages: PipelineStage[] }) {
  return <div className="space-y-0">{stages.map((stage, index) => <div key={stage.id} className="relative flex gap-4 pb-6 last:pb-0" data-testid={`trace-stage-${stage.id}`}>{index < stages.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-border" />}<span className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border ${stage.status === 'completed' ? 'border-primary bg-primary text-primary-foreground' : stage.status === 'failed' ? 'border-destructive bg-destructive text-destructive-foreground' : stage.status === 'running' ? 'border-accent bg-accent text-accent-foreground' : 'border-border bg-muted text-muted-foreground'}`}>{stage.status === 'completed' ? <Check size={13} /> : stage.status === 'failed' ? <X size={13} /> : stage.status === 'running' ? <Loader2 size={13} className="animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{stage.label}</p><div className="flex items-center gap-2"><StatusPill status={stage.status} /><span className="mono text-[10px] text-muted-foreground">{stage.durationMs}ms</span></div></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{stage.detail}</p></div></div>)}</div>;
}

export function ConfidenceRing({ value }: { value: number }) {
  const percent = Math.round(value * 100); const circumference = 2 * Math.PI * 22; const dash = circumference * (percent / 100);
  return <div className="relative size-16"><svg viewBox="0 0 52 52" className="-rotate-90"><circle cx="26" cy="26" r="22" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" /><circle cx="26" cy="26" r="22" fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`} /></svg><span className="absolute inset-0 grid place-items-center font-display text-sm font-bold">{percent}%</span></div>;
}


const TYPE_TONE: Record<string, string> = {
  temporal: 'text-[color:var(--series-3)]',
  quantitative: 'text-[color:var(--series-1)]',
  ordinal: 'text-[color:var(--series-4)]',
  boolean: 'text-[color:var(--series-7)]',
  nominal: 'text-muted-foreground',
  identifier: 'text-muted-foreground/70',
};

export function ResultSchema({ profile }: { profile: DataProfile }) {
  const dimensionCount = profile.dimensions.length + profile.temporal.length;
  return <section className="rounded-sm border border-border bg-card p-5" data-testid="result-schema">
    <SectionHeading eyebrow="Result schema" title="Inferred field types" detail={`Signature ${profile.signature} · ${profile.rowCount.toLocaleString()} rows · ${profile.measures.length} measure${profile.measures.length === 1 ? '' : 's'}, ${dimensionCount} dimension${dimensionCount === 1 ? '' : 's'}`} />
    <div className="grid gap-2 sm:grid-cols-2">
      {profile.fields.map((field) => <div key={field.name} className="flex items-start justify-between gap-3 rounded-sm border border-border/70 bg-muted/20 px-3 py-2" data-testid={`schema-field-${field.name}`}>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{field.name}</p>
          <p className="mono mt-0.5 text-[10px] text-muted-foreground">
            {field.distinctCount.toLocaleString()} distinct
            {field.temporalGrain ? ` · ${field.temporalGrain}` : ''}
            {field.nullRate > 0 ? ` · ${Math.round(field.nullRate * 100)}% null` : ''}
            {field.monotonic !== 'none' ? ` · ${field.monotonic}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-sm border border-border bg-card px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${TYPE_TONE[field.type] ?? 'text-muted-foreground'}`}>{field.type}</span>
      </div>)}
    </div>
  </section>;
}

export function SchemaTableRow({ table }: { table: SchemaTable }) {
  const [open, setOpen] = useState(false);
  return <div className="border-b border-border last:border-0" data-testid={`schema-table-${table.name}`}><button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40" data-testid={`button-expand-${table.name}`}><ChevronDown size={15} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} /><span className="grid size-7 place-items-center rounded-sm bg-primary/10 text-primary"><Table2 size={14} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{table.name}</span><span className="mono text-[10px] text-muted-foreground">{table.rowCount.toLocaleString()} rows · {table.columns.length} columns</span></span><span className="hidden items-center gap-2 sm:flex"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(table.relevance * 100)}%` }} /></span><span className="mono w-9 text-right text-[10px] text-muted-foreground">{Math.round(table.relevance * 100)}%</span></span></button>{open && <div className="border-t border-border bg-muted/20 px-4 py-3 pl-14"><div className="grid grid-cols-1 gap-2 md:grid-cols-2">{table.columns.map((column) => <div key={column.name} className="flex items-start justify-between gap-3 rounded-sm border border-border/70 bg-card px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-medium">{column.name}</p><p className="mono mt-0.5 text-[10px] text-muted-foreground">{column.dataType}{column.nullable ? ' · nullable' : ' · required'}</p></div><span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-primary">{column.semanticType}</span></div>)}</div>{table.foreignKeys.length > 0 && <p className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground"><GitBranchIcon /> {table.foreignKeys.length} relationship{table.foreignKeys.length > 1 ? 's' : ''} detected</p>}</div>}</div>;
}

function GitBranchIcon() { return <span className="inline-block h-px w-3 bg-primary" />; }

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="flex items-center gap-2 rounded-sm border border-input bg-card px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10"><Search size={15} className="shrink-0 text-muted-foreground" /><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" placeholder={placeholder} data-testid="input-search" /></label>;
}

export function SelectField({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: { value: string; label: string; icon?: React.ReactNode; description?: string }[]; label: string }) {
  const selected = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  return <div className="relative block" data-testid={`select-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{label}</span>
    <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 rounded-sm border border-input bg-card px-3 py-2.5 text-left text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10 hover:border-primary/40">
      {selected?.icon && <span className="flex shrink-0 items-center text-primary">{selected.icon}</span>}
      <span className="flex-1">
        <span className="block font-medium text-foreground">{selected?.label ?? 'Select…'}</span>
        {selected?.description && <span className="mt-0.5 block text-[10px] text-muted-foreground">{selected.description}</span>}
      </span>
      <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <>
      <button type="button" onClick={() => setOpen(false)} className="fixed inset-0 z-40" aria-label="Close dropdown" />
      <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-sm border border-border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2">
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); }} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs transition-colors hover:bg-primary/5 ${option.value === value ? 'bg-primary/8' : ''}`}>
            {option.icon && <span className={`flex shrink-0 items-center ${option.value === value ? 'text-primary' : 'text-muted-foreground'}`}>{option.icon}</span>}
            <span className="flex-1">
              <span className={`block font-medium ${option.value === value ? 'text-primary' : 'text-foreground'}`}>{option.label}</span>
              {option.description && <span className="mt-0.5 block text-[10px] text-muted-foreground">{option.description}</span>}
            </span>
            {option.value === value && <Check size={14} className="shrink-0 text-primary" />}
          </button>
        ))}
      </div>
    </>}
  </div>;
}

export function HealthBadge({ healthy }: { healthy: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.1em] ${healthy ? 'text-primary' : 'text-destructive'}`}><span className={`size-1.5 rounded-full ${healthy ? 'bg-primary' : 'bg-destructive'}`} />{healthy ? 'Healthy' : 'Attention'}</span>;
}

export function RunMeta({ label, value, icon: Icon = Clock3 }: { label: string; value: string; icon?: typeof Clock3 }) {
  return <div className="flex items-center gap-2"><Icon size={13} className="text-muted-foreground" /><div><p className="text-[9px] uppercase tracking-[.15em] text-muted-foreground">{label}</p><p className="mono mt-0.5 text-[11px]">{value}</p></div></div>;
}

export function ConnectionMark({ kind }: { kind: string }) {
  return <span className="grid size-9 place-items-center rounded-sm border border-primary/20 bg-primary/10 text-primary" title={kind}>{dialectIcon(kind)}</span>;
}

export function SecurityNote() {
  return <div className="flex items-start gap-3 rounded-sm border border-primary/20 bg-primary/5 p-3 text-xs"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" /><p className="leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Safety-first execution.</span> Queries are contextualized, validated, and inspected before they touch your connection.</p></div>;
}