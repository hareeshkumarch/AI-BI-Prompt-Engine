import { ArrowLeft, Check, ChevronDown, ChevronRight, Copy, Database, FileCode2, Filter, Gauge, Info, Loader2, Play, RefreshCw, Search, Server, Sparkles, Table2, Terminal, Timer, Wrench, XCircle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'wouter';
import { getGetQueryRunQueryKey, getGetStudioOverviewQueryKey, getListQueryRunsQueryKey, useCreateQueryRun, useGetQueryRun, useGetSchemaContext, useGetStudioOverview, useListConnections, useListQueryRuns, useRepairQueryRun } from '@workspace/api-client-react';
import type { InsightOutput, QueryResult, QueryRunInput, QueryRunInputDialect } from '@workspace/api-client-react';
import { ConnectionMark, ConfidenceRing, DataResultTable, EmptyState, ErrorState, HealthBadge, LoadingBlock, QueryRunList, ResultSchema, RunMeta, SchemaTableRow, SearchField, SectionHeading, SecurityNote, SelectField, Sparkline, StatCard, StatusPill, Trace, dialectIcon, formatRelative, useDebouncedValue } from '@/components/studio-ui';
import { ChartSwitcher, InsightChart, useChartSelection } from '@/components/insight-chart';

const dialectOptions = [
  { value: 'postgresql', label: 'PostgreSQL', icon: dialectIcon('postgresql'), description: 'Advanced open-source RDBMS' },
  { value: 'mysql', label: 'MySQL', icon: dialectIcon('mysql'), description: 'Popular relational database' },
  { value: 'snowflake', label: 'Snowflake', icon: dialectIcon('snowflake'), description: 'Cloud data warehouse' },
  { value: 'sqlite', label: 'SQLite', icon: dialectIcon('sqlite'), description: 'Lightweight embedded engine' },
  { value: 'duckdb', label: 'DuckDB', icon: dialectIcon('duckdb'), description: 'In-process OLAP database' },
];

function RichDialectSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = dialectOptions.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40" data-testid="select-dialect">
      <span className="flex items-center text-primary">{selected?.icon ?? <Terminal size={16} />}</span>
      <span className="font-medium text-foreground">{selected?.label ?? 'Dialect'}</span>
      <ChevronDown size={12} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] overflow-hidden rounded-sm border border-border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2">
      {dialectOptions.map((option) => (
        <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); }} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs transition-colors hover:bg-primary/5 ${option.value === value ? 'bg-primary/8' : ''}`}>
          <span className={`flex shrink-0 items-center ${option.value === value ? 'text-primary' : 'text-muted-foreground'}`}>{option.icon}</span>
          <span className="flex-1">
            <span className={`block font-medium ${option.value === value ? 'text-primary' : 'text-foreground'}`}>{option.label}</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">{option.description}</span>
          </span>
          {option.value === value && <Check size={14} className="shrink-0 text-primary" />}
        </button>
      ))}
    </div>}
  </div>;
}

function PageFrame({ eyebrow, title, detail, children, action }: { eyebrow: string; title: string; detail: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="studio-grid min-h-[calc(100dvh-3.5rem)] px-4 py-7 sm:px-6 lg:px-10 lg:py-9"><div className="mx-auto max-w-[1440px]"><div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div className="animate-enter-up"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-primary">{eyebrow}</p><h1 className="font-display text-3xl font-extrabold tracking-[-.055em] text-foreground sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{detail}</p></div>{action && <div className="animate-enter-up delay-1">{action}</div>}</div>{children}</div></div>;
}

export function WorkspacePage() {
  const overview = useGetStudioOverview();
  const runsQuery = useListQueryRuns();
  const connectionsQuery = useListConnections();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const createRun = useCreateQueryRun();
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<'analyst' | 'sql_only'>('analyst');
  const [dialect, setDialect] = useState<QueryRunInputDialect>('postgresql');
  const [connectionId, setConnectionId] = useState('');
  const connections = connectionsQuery.data?.length ? connectionsQuery.data : overview.data?.activeConnection ? [overview.data.activeConnection] : [];
  const activeConnection = connections.find((connection) => connection.id === connectionId) ?? connections[0];
  const recentRuns = overview.data?.recentRuns ?? runsQuery.data ?? [];

  const submitQuestion = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (!question.trim() || !activeConnection || createRun.isPending) return;
    createRun.mutate({ data: { question: question.trim(), connectionId: activeConnection.id, dialect, mode } satisfies QueryRunInput }, {
      onSuccess: (run) => {
        setQuestion('');
        void queryClient.invalidateQueries({ queryKey: getGetStudioOverviewQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListQueryRunsQueryKey() });
        navigate(`/runs/${run.id}`);
      },
    });
  };

  const quickQuestions = ['Revenue by month for the last 12 months', 'Which segments are growing fastest?', 'Show customers with declining activity'];

  if (overview.isLoading) return <PageFrame eyebrow="Workspace" title="Ask your data." detail="Turn plain-English questions into inspectable, safety-first analysis."><div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><LoadingBlock lines={7} /><LoadingBlock lines={6} /></div></PageFrame>;
  if (overview.isError) return <PageFrame eyebrow="Workspace" title="Ask your data." detail="Turn plain-English questions into inspectable, safety-first analysis."><ErrorState onRetry={() => void overview.refetch()} detail="The studio overview is temporarily unavailable. Your connection configuration is unchanged." /></PageFrame>;

  return <PageFrame eyebrow="Workspace / Analyst mode" title="Ask your data." detail="Plain-English questions in. Transparent, reviewable analysis out." action={<div className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-xs shadow-sm"><span className="size-2 rounded-full bg-primary" /><span className="font-medium">Workspace operational</span><span className="text-muted-foreground">·</span><span className="mono text-[10px] text-muted-foreground">{overview.data?.averageLatencyMs ?? 0}ms avg latency</span></div>}>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
      <section className="animate-enter-up delay-1">
        <form onSubmit={submitQuestion} className="relative overflow-hidden rounded-sm border border-primary/30 bg-card shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 signal-line" />
          <div className="flex items-center justify-between border-b border-border px-5 py-3"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground"><Sparkles size={14} className="text-primary" /> Natural language query</div><span className="mono text-[10px] text-muted-foreground">CTRL ↵ to run</span></div>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitQuestion(event); }} className="min-h-[160px] w-full resize-none bg-transparent px-5 py-5 text-lg leading-8 outline-none placeholder:text-muted-foreground/45 sm:text-xl" placeholder="Ask a question about your data…" data-testid="input-question" />
          <div className="flex flex-col gap-3 border-t border-border bg-muted/25 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground"><Database size={12} className="text-primary" /><select value={activeConnection?.id ?? ''} onChange={(event) => setConnectionId(event.target.value)} disabled={connections.length === 0} className="max-w-[150px] bg-transparent font-medium text-foreground outline-none" data-testid="select-connection">{connections.length === 0 ? <option value="">No connection</option> : connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></label><RichDialectSelector value={dialect} onChange={(v) => setDialect(v as QueryRunInputDialect)} /><button type="button" onClick={() => setMode(mode === 'analyst' ? 'sql_only' : 'analyst')} className={`rounded-sm border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${mode === 'analyst' ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`} data-testid="button-toggle-mode">{mode === 'analyst' ? 'Analyst mode' : 'SQL only'}</button></div><button type="submit" disabled={!question.trim() || !activeConnection || createRun.isPending} className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-run-query">{createRun.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}{createRun.isPending ? 'Orchestrating…' : 'Run analysis'}</button></div>
          {createRun.isError && <div className="flex items-center gap-2 border-t border-destructive/20 bg-destructive/5 px-5 py-3 text-xs text-destructive"><XCircle size={14} /> The run could not be started. Check the connection and try again.</div>}
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Try asking</span>{quickQuestions.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)} className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-foreground" data-testid={`button-quick-question-${quickQuestions.indexOf(item)}`}>{item}</button>)}</div>
        <div className="mt-7"><SectionHeading eyebrow="Recent activity" title="Latest runs" detail="Every question leaves an inspectable orchestration trace." action={<Link href="/" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-all-runs">Refresh <RefreshCw size={12} className="ml-1 inline" /></Link>} />{runsQuery.isLoading ? <LoadingBlock lines={4} /> : runsQuery.isError ? <ErrorState onRetry={() => void runsQuery.refetch()} /> : recentRuns.length === 0 ? <EmptyState icon={Terminal} title="No runs yet" detail="Your first question will appear here with its full trace." /> : <QueryRunList runs={recentRuns.slice(0, 6)} compact />}</div>
      </section>
      <aside className="space-y-5 animate-enter-up delay-2">
        <section className="rounded-sm border border-border bg-card p-5"><SectionHeading eyebrow="Active connection" title={activeConnection?.name ?? 'No connection'} detail={activeConnection ? `${activeConnection.kind} · ${activeConnection.host}` : 'Connect a relational source to begin.'} action={activeConnection ? <HealthBadge healthy={activeConnection.status === 'connected'} /> : undefined} />{activeConnection && <><div className="flex items-center gap-3 border-y border-border py-4"><ConnectionMark kind={activeConnection.kind} /><div><p className="text-sm font-semibold">{activeConnection.kind.toUpperCase()}</p><p className="mono mt-1 text-[10px] text-muted-foreground">{activeConnection.tables} tables indexed</p></div><div className="ml-auto text-right"><p className="font-display text-lg font-bold">{activeConnection.latencyMs}<span className="ml-0.5 text-xs font-normal text-muted-foreground">ms</span></p><p className="text-[10px] text-muted-foreground">last latency</p></div></div><div className="mt-4"><div className="mb-2 flex justify-between text-[10px] text-muted-foreground"><span>Connection signal</span><span className="mono">{activeConnection.latencyMs < 200 ? 'stable' : 'watch'}</span></div><Sparkline values={[36, 32, 34, 28, 31, 27, 29, 25, 28]} /></div><Link href="/connections" className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs font-semibold text-primary" data-testid="link-manage-connections">Manage connections <ChevronRight size={14} /></Link></>}</section>
        <SecurityNote />
        <div className="grid grid-cols-2 gap-3"><StatCard label="Indexed tables" value={(overview.data?.tableCount ?? activeConnection?.tables ?? 0).toLocaleString()} detail={`${overview.data?.columnCount ?? '—'} columns mapped`} /><StatCard label="Success rate" value={overview.data ? `${Math.round(overview.data.successRate * 100)}%` : '—'} detail={`${overview.data?.queryCount ?? 0} total queries`} accent /></div>
      </aside>
    </div>
  </PageFrame>;
}

export function RunDetailPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId ?? '';
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const runQuery = useGetQueryRun(runId, { query: { enabled: !!runId, queryKey: getGetQueryRunQueryKey(runId) } });
  const repairRun = useRepairQueryRun();
  const [repairOpen, setRepairOpen] = useState(false);
  const [instruction, setInstruction] = useState('Re-check the date field and use the most recent complete period.');
  const run = runQuery.data;

  const repair = () => {
    if (!instruction.trim() || repairRun.isPending) return;
    repairRun.mutate({ runId, data: { instruction: instruction.trim() } }, { onSuccess: (nextRun) => { setRepairOpen(false); void queryClient.invalidateQueries({ queryKey: getGetQueryRunQueryKey(runId) }); void queryClient.invalidateQueries({ queryKey: getListQueryRunsQueryKey() }); navigate(`/runs/${nextRun.id}`); } });
  };

  if (runQuery.isLoading) return <PageFrame eyebrow="Run detail" title="Loading orchestration trace" detail="Fetching the full safety and execution record."><LoadingBlock lines={8} /></PageFrame>;
  if (runQuery.isError || !run) return <PageFrame eyebrow="Run detail" title="Trace unavailable" detail="This run could not be loaded or may have expired."><ErrorState onRetry={() => void runQuery.refetch()} /></PageFrame>;

  return <PageFrame eyebrow={`Run detail / ${run.id.slice(0, 12)}`} title={run.question} detail={`${run.dialect} · ${run.targetedTables.length} targeted tables · created ${formatRelative(run.createdAt)}`} action={<div className="flex items-center gap-3"><StatusPill status={run.status} /><Link href="/" className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted" data-testid="link-back-workspace"><ArrowLeft size={14} /> Workspace</Link></div>}>
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><RunMeta label="Duration" value={`${run.durationMs}ms`} icon={Timer} /><RunMeta label="Rows returned" value={run.rowCount.toLocaleString()} icon={Table2} /><RunMeta label="Dialect" value={run.dialect} icon={Terminal} /><RunMeta label="Connection" value={run.connectionId.slice(0, 10)} icon={Database} /></div>
    {run.error && <div className="mb-5 flex flex-col gap-3 rounded-sm border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><XCircle size={16} className="mt-0.5 shrink-0 text-destructive" /><div><p className="text-sm font-semibold text-destructive">Pipeline stopped safely</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{run.error}</p></div></div><button type="button" onClick={() => setRepairOpen((open) => !open)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border border-destructive/25 bg-card px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/5" data-testid="button-repair-run"><Wrench size={13} /> Repair SQL</button></div>}
    {repairOpen && <div className="mb-5 rounded-sm border border-accent/35 bg-accent/10 p-4"><label className="block text-[10px] font-semibold uppercase tracking-[.14em] text-accent-foreground">Repair instruction</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={instruction} onChange={(event) => setInstruction(event.target.value)} className="min-w-0 flex-1 rounded-sm border border-input bg-card px-3 py-2 text-xs outline-none focus:border-primary" data-testid="input-repair-instruction" /><button type="button" onClick={repair} disabled={repairRun.isPending} className="inline-flex items-center justify-center gap-2 rounded-sm bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50" data-testid="button-submit-repair">{repairRun.isPending ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />} Re-run safely</button></div>{repairRun.isError && <p className="mt-2 text-xs text-destructive">Repair request failed. The original trace is preserved.</p>}</div>}
    <div className="grid gap-5 lg:grid-cols-[.72fr_1.28fr]">
      <section className="rounded-sm border border-border bg-card p-5"><SectionHeading eyebrow="Orchestration" title="Stage trace" detail="A linear record of how the answer was produced." /><Trace stages={run.stages} /><div className="mt-6 border-t border-border pt-4"><div className="flex items-center justify-between text-[10px] uppercase tracking-[.14em] text-muted-foreground"><span>Targeted tables</span><span>{run.targetedTables.length}</span></div><div className="mt-3 flex flex-wrap gap-1.5">{run.targetedTables.map((table) => <span key={table} className="rounded-sm border border-border bg-muted/45 px-2 py-1 mono text-[10px]">{table}</span>)}</div></div></section>
      <div className="space-y-5">
        <section className="rounded-sm border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-5 py-3"><div className="flex items-center gap-2"><FileCode2 size={15} className="text-primary" /><span className="text-[10px] font-semibold uppercase tracking-[.16em]">Generated SQL</span></div><button type="button" onClick={() => void navigator.clipboard?.writeText(run.sql)} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground hover:text-primary" data-testid="button-copy-sql"><Copy size={12} /> Copy</button></div><pre className="max-h-[250px] overflow-auto whitespace-pre-wrap p-5 mono text-xs leading-6 text-foreground/80">{run.sql || 'No SQL was generated for this run.'}</pre><div className="border-t border-border bg-muted/25 px-5 py-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Why this query:</span> {run.sqlExplanation}</div></section>
        {run.result && <DataResultTable result={run.result} />}
        {run.insight && run.result && <InsightPanel insight={run.insight} result={run.result} />}
        {run.insight && <ResultSchema profile={run.insight.dataProfile} />}
      </div>
    </div>
  </PageFrame>;
}

function InsightPanel({ insight, result }: { insight: InsightOutput; result: QueryResult }) {
  const { options, active, select } = useChartSelection(insight.encoding, insight.alternatives);
  return <section className="rounded-sm border border-border bg-card p-5">
    <div className="flex items-start justify-between gap-4">
      <SectionHeading eyebrow="Synthesis" title="What the data says" detail={`${active.label} · ${active.family} · ${insight.insights.length} observations`} />
      <ConfidenceRing value={insight.confidence} />
    </div>
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="space-y-3">
        {insight.insights.map((observation, index) => <div key={observation} className="flex gap-3 text-xs leading-5"><span className="mono text-primary">0{index + 1}</span><p>{observation}</p></div>)}
        <p className="border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">{active.rationale}</p>
      </div>
      <div className="min-w-0 space-y-3">
        <ChartSwitcher options={options} active={active.chartType} onSelect={select} />
        <div className="rounded-sm border border-border bg-muted/20 p-3"><InsightChart encoding={active} result={result} /></div>
      </div>
    </div>
  </section>;
}

export function SchemaPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const schemaQuery = useGetSchemaContext(debouncedSearch ? { search: debouncedSearch } : undefined);
  const schema = schemaQuery.data;
  const tokenPercent = schema ? Math.min(100, Math.round((schema.selectedTables / Math.max(schema.totalTables, 1)) * 100)) : 0;

  return <PageFrame eyebrow="Context explorer" title="Schema context." detail="See exactly what the model can see before it writes a query." action={<div className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-xs"><span className="size-1.5 rounded-full bg-primary" /> Auto-pruned context</div>}>
    {schemaQuery.isLoading ? <div className="grid gap-5 lg:grid-cols-[1fr_310px]"><LoadingBlock lines={8} /><LoadingBlock lines={6} /></div> : schemaQuery.isError || !schema ? <ErrorState onRetry={() => void schemaQuery.refetch()} /> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
      <section className="min-w-0 animate-enter-up delay-1"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><SearchField value={search} onChange={setSearch} placeholder="Search tables or columns…" /><div className="flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-muted-foreground"><Filter size={13} /> relevance sorted</div></div><div className="overflow-hidden rounded-sm border border-border bg-card"><div className="grid grid-cols-[1fr_auto] border-b border-border bg-muted/35 px-4 py-3 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground"><span>Table / columns</span><span>Relevance</span></div>{schema.tables.length === 0 ? <EmptyState icon={Search} title="No matching schema" detail="Try a broader table or column name." /> : schema.tables.map((table) => <SchemaTableRow key={table.name} table={table} />)}</div></section>
      <aside className="space-y-4 animate-enter-up delay-2"><section className="rounded-sm border border-border bg-card p-5"><SectionHeading eyebrow="Context budget" title="Token pruning" detail="Only relevant metadata enters the prompt." /><div className="relative mx-auto my-5 size-40"><svg viewBox="0 0 160 160" className="-rotate-90"><circle cx="80" cy="80" r="62" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" /><circle cx="80" cy="80" r="62" fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${389 * tokenPercent / 100} 389`} /></svg><div className="absolute inset-0 grid place-items-center text-center"><div><p className="font-display text-3xl font-bold">{schema.selectedTables}</p><p className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">of {schema.totalTables} tables</p></div></div></div><div className="space-y-3 border-t border-border pt-4"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Token estimate</span><span className="mono font-medium">{schema.tokenEstimate.toLocaleString()}</span></div><div className="flex justify-between text-xs"><span className="text-muted-foreground">Dialect</span><span className="mono font-medium">{schema.dialect}</span></div><div className="flex justify-between text-xs"><span className="text-muted-foreground">Generated</span><span className="mono font-medium">{formatRelative(schema.generatedAt)}</span></div></div></section><section className="rounded-sm border border-border bg-card p-5"><div className="flex items-start gap-3"><Gauge size={17} className="mt-0.5 text-primary" /><div><p className="text-sm font-semibold">Context is selective</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Tables are ranked by semantic relevance for each question. The full catalog remains available here for inspection.</p></div></div></section></aside>
    </div>}
  </PageFrame>;
}

export function ConnectionsPage() {
  const connectionsQuery = useListConnections();
  const connections = connectionsQuery.data ?? [];
  const [dialectOverride, setDialectOverride] = useState('');
  const defaultDialect = dialectOverride || connections[0]?.kind || 'postgresql';
  return <PageFrame eyebrow="Infrastructure" title="Connections." detail="Data sources, health signals, and the dialect each run will honor." action={<button type="button" onClick={() => void connectionsQuery.refetch()} className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted" data-testid="button-refresh-connections"><RefreshCw size={13} /> Refresh health</button>}>
    {connectionsQuery.isLoading ? <div className="grid gap-4 md:grid-cols-2"><LoadingBlock lines={6} /><LoadingBlock lines={6} /></div> : connectionsQuery.isError ? <ErrorState onRetry={() => void connectionsQuery.refetch()} /> : connections.length === 0 ? <EmptyState icon={Server} title="No connections configured" detail="Add a relational connection in the workspace service to make it available for analysis." /> : <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
      <section className="space-y-3 animate-enter-up delay-1">{connections.map((connection) => <article key={connection.id} className="rounded-sm border border-border bg-card p-5 transition-colors hover:border-primary/30" data-testid={`card-connection-${connection.id}`}><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><ConnectionMark kind={connection.kind} /><div><h2 className="font-display text-base font-bold">{connection.name}</h2><p className="mt-1 mono text-[10px] text-muted-foreground">{connection.kind} · {connection.host}</p></div></div><HealthBadge healthy={connection.status === 'connected'} /></div><div className="mt-5 grid grid-cols-3 divide-x divide-border border-y border-border py-3"><div className="px-3 first:pl-0"><p className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">Latency</p><p className="mt-1 font-display text-lg font-bold">{connection.latencyMs}<span className="ml-0.5 text-[10px] font-normal text-muted-foreground">ms</span></p></div><div className="px-3"><p className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">Tables</p><p className="mt-1 font-display text-lg font-bold">{connection.tables}</p></div><div className="px-3"><p className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">Dialect</p><p className="mt-1 truncate mono text-[11px] font-medium">{connection.kind}</p></div></div><div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground"><span>Last introspection</span><span className="mono">{formatRelative(connection.lastIntrospectedAt)}</span></div></article>)}</section>
      <aside className="space-y-4 animate-enter-up delay-2"><section className="rounded-sm border border-border bg-card p-5"><SectionHeading eyebrow="Dialect configuration" title="SQL behavior" detail="Runs inherit the dialect configured for their active source." /><div className="space-y-3"><SelectField label="Default dialect" value={defaultDialect} onChange={setDialectOverride} options={dialectOptions} /><div className="rounded-sm border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground"><Info size={14} className="mb-2 text-primary" /><p>Dialect hints are passed to SQL generation and validation. They are never inferred from a question.</p></div></div></section><SecurityNote /></aside>
    </div>}
  </PageFrame>;
}