// The only parts of @sentry/react the widget uses. monitoring.ts imports this file rather than the
// package, so the lazy chunk does not carry Replay, Feedback or Profiling.
export { browserTracingIntegration, captureException, init, setUser } from '@sentry/react';
