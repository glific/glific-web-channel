import type { PostHog } from 'posthog-js';

// Product analytics for the widget (glific/glific#6195). The people using this page are an NGO's
// beneficiaries, not Glific staff, so what is collected is deliberately narrow:
//
//   - no phone numbers, names or message text in any event — a contact is only its Glific id
//   - no autocapture: it records the text of whatever was clicked, which here is message bubbles
//     and list options
//   - no session replay, which would record the conversation itself
//   - nothing at all unless a project token is configured
//
// Everything goes through this module rather than the posthog-js singleton, so that the "nothing
// unless configured" rule holds everywhere, including in services that are not React components.
//
// posthog-js is loaded with a dynamic import, as its own chunk: it is ~350 KB, which would otherwise
// sit in front of the first paint on a beneficiary's low-end phone. Calls made while it loads are
// queued and replayed in order; without a token it is never downloaded at all.

export type AnalyticsEvent =
  | 'otp_requested'
  | 'otp_request_failed'
  | 'otp_verified'
  | 'otp_verify_failed'
  | 'message_sent'
  | 'list_reply_selected'
  | 'trigger_link_opened'
  | 'logged_out'
  | 'web_channel_disabled_shown'
  | 'branding_unavailable_shown';

/** The kinds of message a contact can send; never the message itself. */
export type SentMessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'location';

// Grouped the same way glific-frontend groups staff, so the two can sit side by side in PostHog.
const ORGANIZATION_GROUP = 'organization';

// Link parameters that carry what the contact is about to say (see lib/triggerKeywords).
const PRIVATE_URL_PARAMS = ['text', 'start'];

type Call = (client: PostHog) => void;

let client: PostHog | null = null;
// Non-null between initAnalytics() and the chunk arriving.
let queue: Call[] | null = null;
let organizationName: string | null = null;

const withClient = (call: Call): void => {
  if (client) call(client);
  else queue?.push(call);
};

const registerApp = (posthog: PostHog) =>
  posthog.register({ app: 'web_channel', org_host: window.location.hostname });

const groupOrganization = (posthog: PostHog, name: string) =>
  posthog.group(ORGANIZATION_GROUP, window.location.hostname, { name });

export interface AnalyticsConfig {
  token?: string;
  host?: string;
}

/**
 * Start PostHog, if a project token is configured. Call after captureTriggerKeywords() has taken
 * a link's ?text=/?start= off the address bar, so the first pageview does not record them.
 *
 * Not awaited by the app: it resolves once the chunk has loaded, to whether PostHog started.
 */
export const initAnalytics = async ({
  token = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN,
  host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
}: AnalyticsConfig = {}): Promise<boolean> => {
  if (!token) return false;

  queue = [];

  try {
    const { default: posthog } = await import('posthog-js');

    posthog.init(token, {
      api_host: host || 'https://us.i.posthog.com',
      defaults: '2026-01-30',
      person_profiles: 'identified_only',
      autocapture: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      disable_session_recording: true,
      // Explicit so the project's remote settings cannot switch it on: errors go to Sentry, which
      // scrubs them, and an unscrubbed exception message could carry what a contact typed.
      capture_exceptions: false,
      disable_surveys: true,
      // Every organisation is a subdomain of glific.com: a cookie on .glific.com would link one
      // beneficiary across NGOs, and a logout on one would reset another's open tab.
      cross_subdomain_cookie: false,
      // Stops the project's remote settings from loading extra scripts, such as console-log
      // capture, which this config cannot otherwise switch off.
      disable_external_dependency_loading: true,
      capture_performance: false,
      // A backstop for the ordering above: a link pasted later, or a referrer, still loses them.
      mask_personal_data_properties: true,
      custom_personal_data_properties: PRIVATE_URL_PARAMS,
    });
    registerApp(posthog);

    client = posthog;
    queue.forEach((call) => call(posthog));
    return true;
  } catch {
    // Blocked by an ad blocker, offline, or refused to start: the app carries on without it.
    return false;
  } finally {
    queue = null;
  }
};

/**
 * Group events under the organisation. Branding carries no organisation id, so the hostname
 * stands in for one: each organisation has its own (web.<org>.glific.com or the NGO's domain).
 */
export const setAnalyticsOrganization = (displayName: string): void => {
  organizationName = displayName;
  withClient((posthog) => groupOrganization(posthog, displayName));
};

export const track = (event: AnalyticsEvent, properties?: Record<string, string | number | boolean>): void =>
  withClient((posthog) => {
    posthog.capture(event, properties);
  });

/** Tie this browser to the contact. The Glific contact id only — never the phone or name. */
export const identifyContact = (contactId: number | string): void =>
  withClient((posthog) => posthog.identify(String(contactId)));

/**
 * Forget the contact, so the next one to sign in on this device (a shared phone is common) is
 * not merged into them. A reset also clears the app properties and the organisation group, which
 * still hold for the next contact, so they are set again.
 */
export const resetAnalytics = (): void =>
  withClient((posthog) => {
    posthog.reset();
    registerApp(posthog);
    if (organizationName !== null) groupOrganization(posthog, organizationName);
  });

/** For tests only. */
export const __resetAnalyticsForTests = (): void => {
  client = null;
  queue = null;
  organizationName = null;
};
