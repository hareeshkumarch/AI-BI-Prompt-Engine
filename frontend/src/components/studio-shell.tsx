import { Compass, Database, GitBranch, LayoutDashboard, Menu, Network, PanelLeft, Settings2, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useGetStudioOverview } from '@workspace/api-client-react';

type StudioShellProps = { children: React.ReactNode };

const navItems = [
  { href: '/', label: 'Workspace', icon: LayoutDashboard },
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/schema', label: 'Schema context', icon: GitBranch },
  { href: '/connections', label: 'Connections', icon: Network },
];

export function StudioShell({ children }: StudioShellProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: overview } = useGetStudioOverview();
  const degraded = overview?.systemStatus === 'degraded';
  const current = navItems.find((item) => item.href === location)?.label ?? (location.startsWith('/runs/') ? 'Run detail' : 'Workspace');

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2" data-testid="link-mobile-logo">
          <span className="grid size-7 place-items-center rounded-sm bg-primary text-primary-foreground"><Database size={15} /></span>
          <span className="font-display text-sm font-bold tracking-tight">AI BI <span className="text-primary">Studio</span></span>
        </Link>
        <button type="button" onClick={() => setMobileOpen((open) => !open)} className="rounded-sm p-2 text-muted-foreground hover:bg-muted" data-testid="button-mobile-menu" aria-label="Toggle navigation">
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </header>

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-3" data-testid="link-logo">
            <span className="relative grid size-8 place-items-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
              <Database size={17} />
              <span className="absolute -right-1 -top-1 size-2 rounded-full bg-accent" />
            </span>
            <span className="font-display text-[15px] font-bold tracking-[-.02em]">AI BI <span className="text-sidebar-primary">Studio</span></span>
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)} className="rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" data-testid="button-close-navigation" aria-label="Close navigation"><X size={17} /></button>
        </div>
        <div className="px-4 py-5">
          <div className="mb-3 flex items-center gap-2 px-2 text-[10px] font-medium uppercase tracking-[.18em] text-sidebar-foreground/45">
            <span className="size-1.5 rounded-full bg-sidebar-primary animate-signal" /> Data workspace
          </div>
          <nav className="space-y-1" aria-label="Primary navigation">
            {navItems.map((item) => {
              const active = location === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 rounded-sm border px-3 py-2.5 text-sm transition-colors ${active ? 'border-sidebar-primary/35 bg-sidebar-primary/12 text-sidebar-primary' : 'border-transparent text-sidebar-foreground/65 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}>
                  <Icon size={17} strokeWidth={active ? 2.2 : 1.7} />
                  <span>{item.label}</span>
                  {active && <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary" />}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto space-y-4 border-t border-sidebar-border p-4">
          <div className="rounded-sm border border-sidebar-border bg-sidebar-accent/50 p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/45"><span className="size-1.5 rounded-full bg-sidebar-primary" /> Live system</div>
            <p className="text-xs text-sidebar-foreground/80">{degraded ? 'Orchestration pipeline degraded' : 'Orchestration pipeline ready'}</p>
            <div className="mt-3 flex items-center justify-between text-[10px] mono text-sidebar-foreground/45"><span>AVG LATENCY</span><span>{overview ? `${overview.averageLatencyMs}ms` : '—'}</span></div>
          </div>
          <button type="button" className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground" data-testid="button-settings">
            <Settings2 size={16} /> Workspace settings <PanelLeft size={14} className="ml-auto rotate-180 opacity-40" />
          </button>
        </div>
      </aside>
      {mobileOpen && <button type="button" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-foreground/20 md:hidden" data-testid="button-navigation-overlay" aria-label="Close navigation overlay" />}

      <main className="min-h-[100dvh] md:pl-64">
        <div className="hidden h-16 items-center justify-between border-b border-border bg-card/70 px-8 md:flex">
          <div className="flex items-center gap-3 text-sm"><span className="text-muted-foreground">Studio</span><span className="text-border">/</span><span className="font-medium">{current}</span></div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground"><span className="mono">{overview ? `${overview.tableCount} tables · ${overview.queryCount} runs` : '—'}</span><span className="flex items-center gap-2"><span className={`size-1.5 rounded-full ${degraded ? 'bg-accent' : 'bg-primary'}`} />{overview ? (degraded ? 'Degraded performance' : 'All systems nominal') : 'Checking status…'}</span></div>
        </div>
        <div className="pt-14 md:pt-0">{children}</div>
      </main>
    </div>
  );
}