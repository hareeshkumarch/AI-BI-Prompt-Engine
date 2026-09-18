import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, LayoutDashboard, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardQueryKey,
  getListDashboardsQueryKey,
  useAddDashboardPage,
  useCreateDashboard,
  useDeleteDashboard,
  useDeleteDashboardWidget,
  useDuplicateDashboardWidget,
  useGetDashboard,
  useListDashboards,
  useReorderDashboardWidgets,
  useUpdateDashboard,
  useUpdateDashboardWidget,
} from '@workspace/api-client-react';
import type { WidgetSize } from '@workspace/api-client-react';
import { DashboardWidget } from '@/components/dashboard-widget';
import { EmptyState, ErrorState, LoadingBlock, StatusPill, formatRelative } from '@/components/studio-ui';

function Frame({ eyebrow, title, detail, action, children }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="studio-grid min-h-[calc(100dvh-3.5rem)] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="min-w-0 animate-enter-up">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-primary">{eyebrow}</p>
            <h1 className="font-display text-3xl font-extrabold tracking-[-.055em] text-foreground sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{detail}</p>
          </div>
          {action && <div className="shrink-0 animate-enter-up delay-1">{action}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function DashboardsPage() {
  const dashboards = useListDashboards();
  const create = useCreateDashboard();
  const remove = useDeleteDashboard();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [name, setName] = useState('');

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: getListDashboardsQueryKey() });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    create.mutate({ data: { name: name.trim() || 'Untitled dashboard' } }, {
      onSuccess: (dashboard) => { setName(''); invalidate(); navigate(`/dashboards/${dashboard.id}`); },
    });
  };

  const action = (
    <form onSubmit={submit} className="flex items-center gap-2" data-testid="form-create-dashboard">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="New dashboard name"
        aria-label="New dashboard name"
        className="w-52 rounded-sm border border-input bg-card px-3 py-2 text-xs outline-none focus:border-primary"
        data-testid="input-dashboard-name"
      />
      <button type="submit" disabled={create.isPending} className="inline-flex items-center gap-2 rounded-sm bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-create-dashboard">
        <Plus size={13} /> Create
      </button>
    </form>
  );

  return (
    <Frame eyebrow="Dashboards" title="Your dashboards." detail="Saved arrangements of widgets. Each widget re-runs its query — nothing is a cached picture." action={action}>
      {dashboards.isLoading ? <LoadingBlock lines={5} />
        : dashboards.isError ? <ErrorState onRetry={() => void dashboards.refetch()} />
        : (dashboards.data ?? []).length === 0 ? (
          <EmptyState icon={LayoutDashboard} title="No dashboards yet" detail="Create one here, then add widgets from Explore." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(dashboards.data ?? []).map((dashboard) => (
              <article key={dashboard.id} className="group flex flex-col rounded-sm border border-border bg-card p-4 transition-colors hover:border-primary/30" data-testid={`card-dashboard-${dashboard.id}`}>
                <Link href={`/dashboards/${dashboard.id}`} className="min-w-0 flex-1" data-testid={`link-dashboard-${dashboard.id}`}>
                  <h2 className="truncate font-display text-base font-bold">{dashboard.name}</h2>
                  {dashboard.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{dashboard.description}</p>}
                  <p className="mono mt-3 text-[10px] text-muted-foreground">
                    {dashboard.widgetCount} widget{dashboard.widgetCount === 1 ? '' : 's'} · {dashboard.pageCount} page{dashboard.pageCount === 1 ? '' : 's'} · v{dashboard.version}
                  </p>
                </Link>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
                  <span className="text-[10px] text-muted-foreground">Updated {formatRelative(dashboard.updatedAt)}</span>
                  <button
                    type="button"
                    onClick={() => remove.mutate({ dashboardId: dashboard.id }, { onSuccess: invalidate })}
                    aria-label={`Delete ${dashboard.name}`}
                    className="rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                    data-testid={`button-delete-dashboard-${dashboard.id}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
    </Frame>
  );
}

export function DashboardViewPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId ?? '';
  const queryClient = useQueryClient();
  const dashboardQuery = useGetDashboard(dashboardId, { query: { enabled: !!dashboardId, queryKey: getGetDashboardQueryKey(dashboardId) } });

  const addPage = useAddDashboardPage();
  const updateWidget = useUpdateDashboardWidget();
  const deleteWidget = useDeleteDashboardWidget();
  const duplicate = useDuplicateDashboardWidget();
  const reorder = useReorderDashboardWidgets();
  const updateDashboard = useUpdateDashboard();

  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const dragged = useRef<string | null>(null);

  const dashboard = dashboardQuery.data;
  const page = dashboard?.pages.find((item) => item.id === activePageId) ?? dashboard?.pages[0];
  const refresh = () => void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(dashboardId) });

  useEffect(() => {
    if (dashboard && !activePageId) setActivePageId(dashboard.pages[0]?.id ?? null);
  }, [dashboard, activePageId]);

  // Interval refresh re-runs every widget without refetching the definition.
  useEffect(() => {
    if (!dashboard || dashboard.refreshMode !== 'interval') return;
    const timer = setInterval(() => setRefreshToken((token) => token + 1), dashboard.refreshIntervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [dashboard?.refreshMode, dashboard?.refreshIntervalSeconds, dashboard]);

  if (dashboardQuery.isLoading) return <Frame eyebrow="Dashboard" title="Loading" detail="Fetching the layout."><LoadingBlock lines={6} /></Frame>;
  if (dashboardQuery.isError || !dashboard || !page) {
    return (
      <Frame eyebrow="Dashboard" title="Not available" detail="This dashboard could not be loaded.">
        <ErrorState onRetry={() => void dashboardQuery.refetch()} />
      </Frame>
    );
  }

  const commitName = () => {
    const next = draftName.trim();
    setRenaming(false);
    if (!next || next === dashboard.name) return;
    updateDashboard.mutate({ dashboardId, data: { name: next } }, { onSuccess: refresh });
  };

  const onDrop = (targetId: string) => {
    const sourceId = dragged.current;
    dragged.current = null;
    if (!sourceId || sourceId === targetId) return;
    const order = page.widgets.map((item) => item.id);
    const from = order.indexOf(sourceId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, ...order.splice(from, 1));
    reorder.mutate({ dashboardId, pageId: page.id, data: { order } }, { onSuccess: refresh });
  };

  const saving = updateWidget.isPending || deleteWidget.isPending || duplicate.isPending || reorder.isPending || updateDashboard.isPending;

  const action = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mono text-[10px] text-muted-foreground" aria-live="polite" data-testid="autosave-state">
        {saving ? 'Saving…' : `Saved · v${dashboard.version}`}
      </span>
      <button type="button" onClick={() => setRefreshToken((token) => token + 1)} className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-2 text-xs font-semibold hover:bg-muted" data-testid="button-refresh-dashboard">
        <RefreshCw size={13} /> Refresh
      </button>
      <label className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-2 text-[11px] text-muted-foreground">
        <span className="sr-only">Auto refresh</span>
        <select
          value={dashboard.refreshMode === 'interval' ? String(dashboard.refreshIntervalSeconds) : 'manual'}
          onChange={(event) => {
            const value = event.target.value;
            updateDashboard.mutate({
              dashboardId,
              data: value === 'manual'
                ? { refreshMode: 'manual' }
                : { refreshMode: 'interval', refreshIntervalSeconds: Number(value) },
            }, { onSuccess: refresh });
          }}
          className="mono cursor-pointer bg-transparent text-[10px] outline-none"
          data-testid="select-refresh"
        >
          <option value="manual">manual</option>
          <option value="30">every 30s</option>
          <option value="60">every 60s</option>
          <option value="300">every 5m</option>
        </select>
      </label>
      <button type="button" onClick={() => setEditing((value) => !value)} className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-2 text-xs font-semibold ${editing ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted'}`} data-testid="button-toggle-edit">
        {editing ? <><Check size={13} /> Done</> : <><Pencil size={13} /> Edit</>}
      </button>
      <Link href="/dashboards" className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-2 text-xs font-semibold hover:bg-muted" data-testid="link-back-dashboards">
        <ArrowLeft size={13} /> All
      </Link>
    </div>
  );

  return (
    <Frame
      eyebrow={`Dashboard · ${page.name}`}
      title={dashboard.name}
      detail={dashboard.description || `${page.widgets.length} widget${page.widgets.length === 1 ? '' : 's'} on this page. Each one runs its own query.`}
      action={action}
    >
      {renaming ? (
        <div className="mb-4 flex items-center gap-2">
          <input
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') commitName(); if (event.key === 'Escape') setRenaming(false); }}
            aria-label="Dashboard name"
            className="w-64 rounded-sm border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-primary"
            data-testid="input-rename-dashboard"
          />
          <button type="button" onClick={commitName} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground" data-testid="button-commit-rename">Save</button>
        </div>
      ) : (
        <button type="button" onClick={() => { setDraftName(dashboard.name); setRenaming(true); }} className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary" data-testid="button-rename-dashboard">
          <Pencil size={11} /> Rename
        </button>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {dashboard.pages.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActivePageId(item.id)}
            aria-current={item.id === page.id}
            className={`rounded-sm border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${item.id === page.id ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
            data-testid={`tab-page-${item.id}`}
          >
            {item.name}
          </button>
        ))}
        {editing && (
          <button type="button" onClick={() => addPage.mutate({ dashboardId, data: {} }, { onSuccess: refresh })} className="inline-flex items-center gap-1 rounded-sm border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground" data-testid="button-add-page">
            <Plus size={11} /> Page
          </button>
        )}
      </div>

      {page.widgets.length === 0 ? (
        <EmptyState icon={LayoutDashboard} title="This page is empty" detail="Build a query in Explore and use Save to dashboard to put it here." />
      ) : (
        <div className="grid grid-cols-12 gap-3" data-testid="dashboard-canvas">
          {page.widgets.map((widget) => (
            <DashboardWidget
              key={widget.id}
              widget={widget}
              editing={editing}
              refreshToken={refreshToken}
              onResize={(size: WidgetSize) => updateWidget.mutate({ dashboardId, pageId: page.id, widgetId: widget.id, data: { size } }, { onSuccess: refresh })}
              onDuplicate={() => duplicate.mutate({ dashboardId, pageId: page.id, widgetId: widget.id }, { onSuccess: refresh })}
              onRemove={() => deleteWidget.mutate({ dashboardId, pageId: page.id, widgetId: widget.id }, { onSuccess: refresh })}
              onDragStart={() => { dragged.current = widget.id; }}
              onDragOver={(event) => { if (editing) event.preventDefault(); }}
              onDrop={() => onDrop(widget.id)}
            />
          ))}
        </div>
      )}

      {editing && page.widgets.length > 0 && (
        <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <StatusPill status="running" /> Drag a widget onto another to reorder. Changes save as you make them.
        </p>
      )}
    </Frame>
  );
}
