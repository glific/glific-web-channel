import { scrubBreadcrumb, scrubEvent } from '@/lib/scrub';

// Error monitoring for the widget. Held to the same posture as analytics (src/lib/analytics.ts):
// nothing loads unless a DSN is configured, no session replay, no default PII, the contact known
// only by its Glific id, and every event scrubbed by src/lib/scrub.ts before it is sent.
//
// @sentry/react is loaded with a dynamic import for the same first-paint reason as posthog-js.
// The cost is that an error thrown before the chunk arrives is not reported; render errors caught
// by ErrorBoundary are queued and are not lost.

type SentryModule = typeof import('@/lib/sentrySdk');
type Call = (sentry: SentryModule) => void;

let client: SentryModule | null = null;
let queue: Call[] | null = null;

const DEFAULT_TRACES_SAMPLE_RATE = 0.05;

// Consistent with glific-frontend's sentry.config.ts.
const KNOWN_BENIGN_EXCEPTIONS: (string | RegExp)[] = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
];

const DENY_URLS: RegExp[] = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /^safari-web-extension:\/\//i,
];

const withClient = (call: Call): void => {
  if (client) call(client);
  else queue?.push(call);
};

const sampleRate = (value: string | number | undefined): number => {
  const rate = typeof value === 'number' ? value : Number.parseFloat(value ?? '');
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : DEFAULT_TRACES_SAMPLE_RATE;
};

export interface MonitoringConfig {
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: string | number;
}

/**
 * Start Sentry, if a DSN is configured. Call after captureTriggerKeywords(), like initAnalytics.
 * Resolves once the chunk has loaded, to whether Sentry started.
 */
export const initMonitoring = async ({
  dsn = import.meta.env.VITE_PUBLIC_SENTRY_DSN,
  environment = import.meta.env.VITE_PUBLIC_SENTRY_ENVIRONMENT || import.meta.env.VITE_VERCEL_ENV || import.meta.env.MODE,
  release = import.meta.env.VITE_PUBLIC_SENTRY_RELEASE || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate = import.meta.env.VITE_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
}: MonitoringConfig = {}): Promise<boolean> => {
  if (!dsn) return false;

  queue = [];

  try {
    const sentry = await import('@/lib/sentrySdk');

    sentry.init({
      dsn,
      environment,
      release: release || undefined,
      sendDefaultPii: false,
      tracesSampleRate: sampleRate(tracesSampleRate),
      // The backend is on another origin (api.<org>); trace headers would only add a CORS preflight.
      tracePropagationTargets: [],
      integrations: [sentry.browserTracingIntegration()],
      ignoreErrors: KNOWN_BENIGN_EXCEPTIONS,
      denyUrls: DENY_URLS,
      beforeSend: scrubEvent,
      beforeSendTransaction: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });

    client = sentry;
    queue.forEach((call) => call(sentry));
    return true;
  } catch {
    return false;
  } finally {
    queue = null;
  }
};

/** Attach the signed-in contact to reports, by Glific contact id only. */
export const setMonitoringUser = (contactId: number | string): void =>
  withClient((sentry) => sentry.setUser({ id: String(contactId) }));

/** Detach the contact, alongside the analytics reset when a session ends. */
export const clearMonitoringUser = (): void => withClient((sentry) => sentry.setUser(null));

/** Report an error React caught while rendering. */
export const reportRenderError = (error: unknown, componentStack?: string | null): void =>
  withClient((sentry) => {
    sentry.captureException(error, { contexts: { react: { componentStack: componentStack ?? '' } } });
  });

/** For tests only. */
export const __resetMonitoringForTests = (): void => {
  client = null;
  queue = null;
};
