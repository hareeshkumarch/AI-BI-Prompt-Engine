import { useState } from 'react';
import { Check, LayoutGrid, Loader2, Plus } from 'lucide-react';
import { getDashboard, useAddDashboardWidget, useCreateDashboard, useListDashboards } from '@workspace/api-client-react';
import type { ExploreQueryInput, WidgetSize } from '@workspace/api-client-react';
import { emptyFilterSet } from '@/components/filter-bar';

export function SaveToDashboard({ query, defaultTitle }: { query: ExploreQueryInput; defaultTitle: string }) {
  const dashboards = useListDashboards();
  const createDashboard = useCreateDashboard();
  const addWidget = useAddDashboardWidget();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [newName, setNewName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const payload = (): { title: string; chartType: string | null; size: WidgetSize; query: Required<ExploreQueryInput> } => ({
    title: title.trim() || defaultTitle,
    chartType: query.chartType ?? null,
    size: 'medium',
    query: {
      chartType: query.chartType ?? null,
      dimensions: query.dimensions,
      measures: query.measures,
      filters: query.filters ?? emptyFilterSet(),
      sort: query.sort ?? [],
      limit: query.limit ?? 200,
    },
  });

  const attach = (dashboardId: string, pageId: string) => {
    addWidget.mutate({ dashboardId, pageId, data: payload() as never }, {
      onSuccess: () => {
        setSaved(dashboardId);
        setOpen(false);
        setTitle('');
        setNewName('');
        void dashboards.refetch();
        setTimeout(() => setSaved(null), 2500);
      },
    });
  };

  const createAndAttach = () => {
    if (createDashboard.isPending) return;
    createDashboard.mutate({ data: { name: newName.trim() || 'Untitled dashboard' } }, {
      onSuccess: (dashboard) => attach(dashboard.id, dashboard.pages[0]!.id),
    });
  };

  const busy = addWidget.isPending || createDashboard.isPending;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        data-testid="button-save-to-dashboard"
      >
        {saved ? <Check size={12} className="text-primary" /> : <LayoutGrid size={12} />}
        {saved ? 'Saved' : 'Save to dashboard'}
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-sm border border-border bg-popover p-3 shadow-lg" data-testid="panel-save-to-dashboard">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Widget title</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={defaultTitle}
              className="mb-3 w-full rounded-sm border border-input bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
              data-testid="input-widget-title"
            />

            {dashboards.data && dashboards.data.length > 0 && (
              <>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Add to</p>
                <div className="mb-3 max-h-40 space-y-0.5 overflow-y-auto">
                  {dashboards.data.map((dashboard) => (
                    <DashboardChoice key={dashboard.id} id={dashboard.id} name={dashboard.name} widgetCount={dashboard.widgetCount} onPick={attach} disabled={busy} />
                  ))}
                </div>
              </>
            )}

            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Or create one</p>
            <div className="flex gap-1.5">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') createAndAttach(); }}
                placeholder="New dashboard"
                className="min-w-0 flex-1 rounded-sm border border-input bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
                data-testid="input-new-dashboard"
              />
              <button type="button" onClick={createAndAttach} disabled={busy} className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-create-and-save">
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create
              </button>
            </div>

            {addWidget.isError && (
              <p className="mt-2 text-[11px] text-destructive">
                {(addWidget.error as { data?: { error?: string } } | null)?.data?.error ?? 'The widget could not be saved.'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DashboardChoice({ id, name, widgetCount, onPick, disabled }: { id: string; name: string; widgetCount: number; onPick: (dashboardId: string, pageId: string) => void; disabled: boolean }) {
  const [resolving, setResolving] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled || resolving}
      onClick={() => {
        setResolving(true);
        void getDashboard(id)
          .then((dashboard) => onPick(id, dashboard.pages[0]!.id))
          .finally(() => setResolving(false));
      }}
      className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-primary/5 disabled:opacity-50"
      data-testid={`button-attach-${id}`}
    >
      <span className="min-w-0 truncate">{name}</span>
      {resolving ? <Loader2 size={11} className="shrink-0 animate-spin text-primary" /> : <span className="mono shrink-0 text-[10px] text-muted-foreground">{widgetCount}</span>}
    </button>
  );
}
