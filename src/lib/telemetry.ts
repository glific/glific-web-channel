// PostHog and Sentry, each started only when its key is set. Both are loaded as their own chunks,
// so a build without keys downloads neither, and one with keys keeps them off the first paint.

/** Start PostHog's default web analytics. Call after captureTriggerKeywords(). */
export const initPostHog = async (token: string | undefined = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN) => {
  if (!token) return;

  try {
    const { default: posthog } = await import('posthog-js');
    posthog.init(token, {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      defaults: '2026-01-30',
      autocapture: true,
      disable_session_recording: false,
      capture_exceptions: true,
      // Every organisation is a subdomain of glific.com; a shared cookie would link one contact
      // across organisations.
      cross_subdomain_cookie: false,
      // A link's ?text=/?start= is what the contact is about to say.
      mask_personal_data_properties: true,
      custom_personal_data_properties: ['text', 'start'],
    });
  } catch {
    // Blocked by an ad blocker or offline: the app carries on without it.
  }
};

/** Start Sentry's default error monitoring. */
export const initSentry = async (dsn: string | undefined = import.meta.env.VITE_PUBLIC_SENTRY_DSN) => {
  if (!dsn) return;

  try {
    const { init } = await import('@sentry/react');
    init({ dsn, environment: import.meta.env.VITE_VERCEL_ENV || import.meta.env.MODE, sendDefaultPii: false });
  } catch {
    // Blocked by an ad blocker or offline: the app carries on without it.
  }
};
