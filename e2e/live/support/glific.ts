import { type APIRequestContext, request } from '@playwright/test';

/**
 * Backend access for the one journey that runs against a real Glific, over the same GraphQL API
 * the staff console uses — no direct database access.
 *
 * The OTP is never persisted on its own: `Glific.OTP` keeps it in `PasswordlessAuth`'s in-memory
 * store inside the backend's BEAM, and there is deliberately no route that hands it back. But
 * both send paths compose it into the message body before the message reaches Gupshup, and a
 * staff user can read that message — so the code is legible through the public API, exactly as it
 * is to an operator watching the conversation.
 */
const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'https://localhost:4001';

// No defaults. A wrong guess here fails as a 401 halfway through a journey, which reads as the
// feature being broken rather than the harness being unconfigured.
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The live suite signs in as a staff user to seed a contact and read the ` +
        'message carrying the OTP; both need at least manager access. See the README.',
    );
  }
  return value;
};

let context: APIRequestContext | null = null;
let authToken: string | null = null;

/**
 * A staff session.
 *
 * `ignoreHTTPSErrors` because the backend runs on a local mkcert certificate that is not in
 * Node's trust store.
 */
const staffContext = async (): Promise<APIRequestContext> => {
  if (context && authToken) return context;

  context = await request.newContext({ baseURL: BACKEND_URL, ignoreHTTPSErrors: true });

  const phone = required('E2E_STAFF_PHONE');

  const response = await context.post('/api/v1/session', {
    data: { user: { phone, password: required('E2E_STAFF_PASSWORD') } },
  });

  if (!response.ok()) {
    throw new Error(
      `Could not sign in as staff (${phone}): ${response.status()} ${await response.text()}. ` +
        'E2E_STAFF_PHONE / E2E_STAFF_PASSWORD must be a user with at least manager access.',
    );
  }

  authToken = (await response.json())?.data?.access_token;
  if (!authToken) throw new Error('Staff sign-in returned no access token');

  return context;
};

export const closeBackend = async (): Promise<void> => {
  await context?.dispose();
  context = null;
  authToken = null;
};

const graphql = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T> => {
  const client = await staffContext();
  const response = await client.post('/api', {
    headers: { authorization: authToken as string },
    data: { query, variables },
  });

  const body = await response.json();
  if (body.errors) throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`);

  return body.data as T;
};

interface ContactResult {
  optinContact: { contact: { id: string; phone: string } | null; errors: { message: string }[] | null };
}

interface UpdateResult {
  updateContact: { contact: { id: string; bspStatus: string } | null; errors: { message: string }[] | null };
}

/**
 * A contact this organisation is allowed to message, on the session path.
 *
 * Two steps because they do different things. `optinContact` creates the contact and records
 * consent, which leaves `bspStatus: HSM` — and the HSM path needs an approved `verify_otp`
 * template that a dev backend will not have. Forcing `SESSION_AND_HSM` routes the send down
 * `create_and_send_otp_session_message/2` instead: plain text, no template, no Meta approval.
 */
export const seedMessageableContact = async (phone: string): Promise<string> => {
  const optedIn = await graphql<ContactResult>(
    `
      mutation optinContact($phone: String!, $name: String) {
        optinContact(phone: $phone, name: $name) {
          contact {
            id
            phone
          }
          errors {
            message
          }
        }
      }
    `,
    { phone, name: 'E2E web channel' },
  );

  const id = optedIn.optinContact.contact?.id;
  if (!id) throw new Error(`optinContact failed for ${phone}: ${JSON.stringify(optedIn.optinContact.errors)}`);

  await graphql<UpdateResult>(
    `
      mutation updateContact($id: ID!, $input: ContactInput!) {
        updateContact(id: $id, input: $input) {
          contact {
            id
            bspStatus
          }
          errors {
            message
          }
        }
      }
    `,
    { id, input: { bspStatus: 'SESSION_AND_HSM' } },
  );

  return id;
};

interface MessagesResult {
  messages: { id: string; body: string }[];
}

/** The newest outbound message id for this phone, as a watermark. */
export const latestMessageId = async (phone: string): Promise<number> => {
  const { messages } = await graphql<MessagesResult>(
    `
      query messages($filter: MessageFilter, $opts: Opts) {
        messages(filter: $filter, opts: $opts) {
          id
          body
        }
      }
    `,
    { filter: { either: phone }, opts: { order: 'DESC', limit: 1 } },
  );

  return messages.length ? Number(messages[0].id) : 0;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The code from the first message written to `phone` after `afterMessageId`.
 *
 * Polls, because the controller answers before the message has necessarily been composed —
 * `request-otp` returns 200 regardless of what delivery does, which is the property that stops it
 * enumerating an organisation's contacts.
 */
export const readOtpSentTo = async (phone: string, afterMessageId: number, timeoutMs = 20_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  let lastBody: string | null = null;

  while (Date.now() < deadline) {
    const { messages } = await graphql<MessagesResult>(
      `
        query messages($filter: MessageFilter, $opts: Opts) {
          messages(filter: $filter, opts: $opts) {
            id
            body
          }
        }
      `,
      { filter: { either: phone }, opts: { order: 'DESC', limit: 5 } },
    );

    const fresh = messages.filter((message) => Number(message.id) > afterMessageId);

    for (const message of fresh) {
      lastBody = message.body;
      const code = message.body?.match(/\b\d{4,8}\b/)?.[0];
      if (code) return code;
    }

    await sleep(500);
  }

  throw new Error(
    lastBody === null
      ? `No message was written to ${phone} within ${timeoutMs}ms. The backend answers 200 even when ` +
          'it sends nothing, so check its log for "Failed to send web channel OTP to" — the usual causes ' +
          'are the web_channel_enabled flag being off or the contact not being messageable.'
      : `A message reached ${phone} but carried no code: ${lastBody}`,
  );
};
