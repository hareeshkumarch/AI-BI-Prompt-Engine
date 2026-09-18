import { useEffect, useState } from 'react';
import { Copy, GripVertical, Loader2, Maximize2, Trash2, X } from 'lucide-react';
import { runExploreQuery } from '@workspace/api-client-react';
import type { ExploreQueryResult, Widget, WidgetSize } from '@workspace/api-client-react';
import { InsightChart } from '@/components/insight-chart';
import { ErrorState } from '@/components/studio-ui';

const SPAN: Record<WidgetSize, string> = {
  small: 'lg:col-span-3',
  medium: 'lg:col-span-6',
  large: 'lg:col-span-9',
  full: 'lg:col-span-12',
};

const SIZE_ORDER: WidgetSize[] = ['small', 'medium', 'large', 'full'];

export function widgetSpan(size: WidgetSize) {
  return SPAN[size] ?? SPAN.medium;
}

type WidgetState =
  | { status: 'loading' }
  | { status: 'ready'; data: ExploreQueryResult }
  | { status: 'error'; message: string };

export function DashboardWidget({
  widget,
  editing,
  refreshToken,
  onResize,
  onDuplicate,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  widget: Widget;
  editing: boolean;
  refreshToken: number;
  onResize: (size: WidgetSize) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const [state, setState] = useState<WidgetState>({ status: 'loading' });
  const [expanded, setExpanded] = useState(false);
  const request = JSON.stringify({ ...widget.query, chartType: widget.chartType });

  // Each widget owns its own request so one slow query never blocks the others.
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setState({ status: 'loading' });

    runExploreQuery(JSON.parse(request), { signal: controller.signal })
      .then((data) => { if (live) setState({ status: 'ready', data }); })
      .catch((error: unknown) => {
        if (!live || controller.signal.aborted) return;
        const message = (error as { data?: { error?: string } })?.data?.error ?? 'This widget could not load.';
        setState({ status: 'error', message });
      });

    return () => { live = false; controller.abort(); };
  }, [request, refreshToken]);

  const body = (height: number) => {
    if (state.status === 'loading') {
      return (
        <div className="grid place-items-center" style={{ height }} data-testid={`widget-loading-${widget.id}`}>
          <Loader2 size={16} className="animate-spin text-primary" />
        </div>
      );
    }
    if (state.status === 'error') {
      return <div style={{ minHeight: height }}><ErrorState title="Widget failed" detail={state.message} /></div>;
    }
    return <InsightChart encoding={state.data.encoding} result={state.data.result} height={height} />;
  };

  return (
    <>
      <article
        className={`flex flex-col rounded-sm border border-border bg-card ${widgetSpan(widget.size)} col-span-12`}
        draggable={editing}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        data-testid={`widget-${widget.id}`}
      >
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          {editing && <GripVertical size={13} className="shrink-0 cursor-grab text-muted-foreground/60" aria-hidden="true" />}
          <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">{widget.title}</h3>
          <div className="flex shrink-0 items-center gap-0.5">
            {editing && (
              <select
                value={widget.size}
                onChange={(event) => onResize(event.target.value as WidgetSize)}
                aria-label={`Width of ${widget.title}`}
                className="mono cursor-pointer rounded-sm border border-input bg-card px-1 py-0.5 text-[10px] text-muted-foreground outline-none focus:border-primary"
                data-testid={`widget-size-${widget.id}`}
              >
                {SIZE_ORDER.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            )}
            <button type="button" onClick={() => setExpanded(true)} aria-label={`Expand ${widget.title}`} className="rounded-sm p-1 text-muted-foreground hover:text-foreground" data-testid={`widget-expand-${widget.id}`}>
              <Maximize2 size={12} />
            </button>
            {editing && (
              <>
                <button type="button" onClick={onDuplicate} aria-label={`Duplicate ${widget.title}`} className="rounded-sm p-1 text-muted-foreground hover:text-foreground" data-testid={`widget-duplicate-${widget.id}`}>
                  <Copy size={12} />
                </button>
                <button type="button" onClick={onRemove} aria-label={`Remove ${widget.title}`} className="rounded-sm p-1 text-muted-foreground hover:text-destructive" data-testid={`widget-remove-${widget.id}`}>
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        </header>
        <div className="min-w-0 flex-1 p-3">{body(200)}</div>
        {state.status === 'ready' && (
          <footer className="flex items-center justify-between border-t border-border px-3 py-1.5 mono text-[9px] text-muted-foreground">
            <span>{state.data.stats.engine} · {state.data.stats.databaseTimeMs}ms</span>
            <span>{state.data.result.rowCount} rows</span>
          </footer>
        )}
      </article>

      {expanded && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={widget.title}>
          <div className="flex max-h-[90dvh] w-full max-w-5xl flex-col rounded-sm border border-border bg-card shadow-xl">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">{widget.title}</h3>
              <button type="button" onClick={() => setExpanded(false)} aria-label="Close" className="rounded-sm p-1 text-muted-foreground hover:text-foreground" data-testid="widget-collapse">
                <X size={16} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-5">{body(460)}</div>
          </div>
        </div>
      )}
    </>
  );
}
