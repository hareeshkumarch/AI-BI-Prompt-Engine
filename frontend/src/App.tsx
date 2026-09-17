import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { StudioShell } from '@/components/studio-shell';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { ConnectionsPage, RunDetailPage, SchemaPage, WorkspacePage } from '@/pages/studio-pages';
import { ExplorePage } from '@/pages/explore-page';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <StudioShell>
        <Switch>
          <Route path="/" component={WorkspacePage} />
          <Route path="/runs/:runId" component={RunDetailPage} />
          <Route path="/explore" component={ExplorePage} />
          <Route path="/schema" component={SchemaPage} />
          <Route path="/connections" component={ConnectionsPage} />
          <Route component={NotFound} />
        </Switch>
      </StudioShell>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
