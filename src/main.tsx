import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

type BoundaryState = { hasError: boolean; errorMessage: string };

class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MT Leave] React render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '10vh auto', padding: 24, color: '#0f172a' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Maestro Leave Management could not open</h1>
          <p style={{ marginTop: 12 }}>A frontend error stopped the page from rendering. Please reload after the app update.</p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 16, padding: 16, background: '#f1f5f9', borderRadius: 8 }}>{this.state.errorMessage}</pre>
          <button style={{ marginTop: 16, padding: '10px 16px', background: '#1d4ed8', color: '#fff', borderRadius: 8 }} onClick={() => window.location.reload()}>Reload app</button>
        </main>
      );
    }
    return this.props.children;
  }
}

async function recoverStalePwaCacheOnce(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('caches' in window)) return false;

  const recoveryKey = 'mt-leave-pwa-recovery-2026-10-23-v1';
  try {
    if (window.localStorage.getItem(recoveryKey) === 'done') return false;

    const registrations = await navigator.serviceWorker.getRegistrations();
    const cacheNames = await window.caches.keys();
    const appCaches = cacheNames.filter((name) => /workbox|precache|vite-pwa/i.test(name));

    if (registrations.length === 0 && appCaches.length === 0) {
      window.localStorage.setItem(recoveryKey, 'done');
      return false;
    }

    await Promise.all(registrations.map((registration) => registration.unregister()));
    await Promise.all(appCaches.map((name) => window.caches.delete(name)));
    window.localStorage.setItem(recoveryKey, 'done');
    console.info('[MT Leave] Removed stale PWA registrations/cache; reloading once.');
    return true;
  } catch (error) {
    console.warn('[MT Leave] PWA cache recovery was not available:', error);
    return false;
  }
}

async function bootstrap() {
  const recovered = await recoverStalePwaCacheOnce();
  if (recovered) {
    window.location.reload();
    return;
  }

  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
    registerSW({ immediate: true });
  }

  const root = document.getElementById('root');
  if (!root) {
    document.body.innerHTML = '<main style="font-family:system-ui,sans-serif;padding:24px"><h1>Maestro Leave Management</h1><p>App startup failed: root element was not found.</p></main>';
    return;
  }

  createRoot(root).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
