import { CircleAlert, Compass, X } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Switch } from 'wouter';
import { MobileBar } from './components/shell/MobileBar';
import { Sidebar } from './components/shell/Sidebar';
import { ConfirmProvider } from './components/ui/Confirm';
import { Toasts } from './components/ui/Toasts';
import { EmptyState, PageShell } from './pages/PageShell';
import WorkspacePage from './pages/WorkspacePage';
import { useStore } from './state/store';

const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const RunPage = lazy(() => import('./pages/RunPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

function StorageNotices() {
  const notices = useStore((s) => s.notices);
  const dismiss = useStore((s) => s.dismissNotices);
  if (!notices.length) return null;
  return (
    <div role="status" className="flex items-start gap-3 border-b border-[oklch(0.83_0.15_80/0.3)] bg-[oklch(0.83_0.15_80/0.08)] px-4 py-2.5 text-[13px] text-[oklch(0.92_0.07_82)]">
      <CircleAlert size={15} className="mt-0.5 flex-none" aria-hidden="true" />
      <ul className="min-w-0 flex-1 space-y-0.5">
        {notices.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label="Dismiss storage notices" onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

function NotFound() {
  return (
    <PageShell title="Page not found">
      <EmptyState icon={<Compass size={20} />} title="There’s nothing at this address" body="The link may be mistyped, or the page was moved." action={<Link href="/" className="btn btn-secondary">Go to the workspace</Link>} />
    </PageShell>
  );
}

function Loading() {
  return (
    <div className="grid flex-1 place-items-center" role="status">
      <span className="t-meta">Loading…</span>
    </div>
  );
}

export default function App() {
  const motion = useStore((s) => s.settings.motion);
  useEffect(() => {
    document.documentElement.dataset.motion = motion === 'reduce' ? 'reduce' : 'system';
  }, [motion]);

  return (
    <ConfirmProvider>
      <a href="#main" className="sr-only z-[70] rounded-lg bg-slab-2 px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />
        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          <MobileBar />
          <StorageNotices />
          <Suspense fallback={<Loading />}>
            <Switch>
              <Route path="/" component={WorkspacePage} />
              <Route path="/templates" component={TemplatesPage} />
              <Route path="/history" component={HistoryPage} />
              <Route path="/runs/:id" component={RunPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route path="/about" component={AboutPage} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </main>
      </div>
      <Toasts />
    </ConfirmProvider>
  );
}
