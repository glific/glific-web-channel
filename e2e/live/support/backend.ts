import { Client } from 'pg';

/**
 * Direct access to the Glific database, for the one journey that runs against a real backend.
 *
 * The OTP itself is never persisted — `Glific.OTP` keeps it in `PasswordlessAuth`'s in-memory
 * store, inside the backend's BEAM — so there is nothing to read there from Node. But both send
 * paths compose the code into `messages.body` before the message goes anywhere near Gupshup, so
 * the row is the last point at which the code is legible to anything but a handset. Reading it
 * there keeps the whole server-side path real: no stubbed endpoint, no injected code, no
 * test-only route into production code.
 */
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/glific_dev';
const ORGANIZATION_ID = Number(process.env.E2E_ORGANIZATION_ID ?? 1);

const withDb = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

/**
 * A contact this organisation is allowed to message.
 *
 * glific#5710 deliberately creates contacts with no consent and no session — so a number typed
 * into the login box for the first time fails `can_send_message_to?/1` and is sent nothing at
 * all, by design, until #5713 adds the exemption. The precondition has to be set up here or the
 * journey would be asserting on a message that is never composed.
 */
export const seedMessageableContact = (phone: string): Promise<number> =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      `insert into contacts
         (phone, name, bsp_status, status, language_id, optin_time, optin_status, optin_method,
          last_message_at, last_communication_at, organization_id, inserted_at, updated_at)
       values
         ($1, $2, 'session_and_hsm', 'valid',
          (select id from languages order by id limit 1),
          now(), true, 'e2e', now(), now(), $3, now(), now())
       on conflict (phone, organization_id) do update
         set bsp_status = 'session_and_hsm',
             status = 'valid',
             optin_time = coalesce(contacts.optin_time, now()),
             optin_status = true,
             last_message_at = now(),
             last_communication_at = now(),
             updated_at = now()
       returning id`,
      [phone, 'E2E web channel', ORGANIZATION_ID],
    );

    return rows[0].id;
  });

/** A watermark, so a code from an earlier run can never be mistaken for this one's. */
export const latestMessageId = (): Promise<number> =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: number | null }>(
      'select max(id) as id from messages where organization_id = $1',
      [ORGANIZATION_ID],
    );

    return rows[0].id ?? 0;
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The code from the first outbound message written to `phone` after `afterMessageId`.
 *
 * Polls, because the controller answers before the message has necessarily been composed —
 * `request-otp` returns 200 regardless of what delivery does, which is the property that stops it
 * enumerating an organisation's contacts.
 */
export const readOtpSentTo = async (phone: string, afterMessageId: number, timeoutMs = 20_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  let lastBody: string | null = null;

  while (Date.now() < deadline) {
    const body = await withDb(async (client) => {
      const { rows } = await client.query<{ body: string | null }>(
        `select m.body
           from messages m
           join contacts c on c.id = m.contact_id
          where c.phone = $1
            and m.organization_id = $2
            and m.flow = 'outbound'
            and m.id > $3
          order by m.id asc
          limit 1`,
        [phone, ORGANIZATION_ID, afterMessageId],
      );

      return rows[0]?.body ?? null;
    });

    if (body) {
      lastBody = body;
      const code = body.match(/\b\d{4,8}\b/)?.[0];
      if (code) return code;
    }

    await sleep(500);
  }

  throw new Error(
    lastBody === null
      ? `No outbound message was written to ${phone} within ${timeoutMs}ms. The backend answers 200 ` +
          'even when it sends nothing, so check its log for "Failed to send web channel OTP to" — the ' +
          'usual causes are the web_channel_enabled flag being off or the contact not being messageable.'
      : `An outbound message reached ${phone} but carried no code: ${lastBody}`,
  );
};
