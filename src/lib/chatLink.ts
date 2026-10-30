// Links an organisation shares to its web chat can carry a message, the way wa.me links do:
//
//   ?text=Hello   opens the chat with "Hello" in the composer, for the contact to send
//   ?start=adopt  starts the web flow whose keyword is "adopt", once
//
// Free text is only ever pre-filled, never sent on the contact's behalf, so a link can't make
// someone send a message they didn't choose. Only `start` sends anything, and the server starts a
// flow for it only if it is a web flow's keyword.

export interface ChatLink {
  text?: string;
  start?: string;
}

// sessionStorage, not memory: a contact who isn't signed in goes through the login screen (and,
// for an organisation's own login, possibly another site) before reaching the chat, and the tab
// is the one thing that survives all of it.
const PENDING_KEY = 'glific_web_chat_link';
// localStorage, so a flow a link started stays started across reloads and later visits.
const STARTED_KEY = 'glific_web_link_started';

// The server refuses a message body over this length.
export const MAX_TEXT_LENGTH = 4096;
// A keyword is one short word; anything longer is not one, and is not worth a round trip.
const MAX_KEYWORD_LENGTH = 100;

const cleanText = (value: string | null) => value?.trim().slice(0, MAX_TEXT_LENGTH) || undefined;

// Lowercased like the server stores keywords; the server still decides what matches.
const cleanKeyword = (value: string | null) => {
  const keyword = value?.trim().toLowerCase();
  return keyword && keyword.length <= MAX_KEYWORD_LENGTH ? keyword : undefined;
};

/**
 * Read a link's `text` and `start` before anything routes, since every redirect replaces the URL
 * and drops its query. Keeps them for the chat to pick up, and takes them off the address bar so
 * a reload or a bookmark of the current page doesn't carry them again.
 */
export const captureChatLink = (location: Location = window.location, history: History = window.history): void => {
  const params = new URLSearchParams(location.search);
  const link: ChatLink = { text: cleanText(params.get('text')), start: cleanKeyword(params.get('start')) };

  if (!params.has('text') && !params.has('start')) return;

  if (link.text || link.start) sessionStorage.setItem(PENDING_KEY, JSON.stringify(link));

  params.delete('text');
  params.delete('start');
  const query = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
};

/** The link waiting for the chat, removed as it is read so it applies once. */
export const takeChatLink = (): ChatLink | null => {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ChatLink;
  } catch {
    return null;
  }
};

const startedKeywords = (): Record<string, string[]> => {
  try {
    return JSON.parse(localStorage.getItem(STARTED_KEY) ?? '{}');
  } catch {
    return {};
  }
};

/** Whether a link already started this keyword for this contact. */
export const hasStartedFromLink = (contactId: string | number, keyword: string): boolean =>
  startedKeywords()[String(contactId)]?.includes(keyword) ?? false;

export const markStartedFromLink = (contactId: string | number, keyword: string): void => {
  const started = startedKeywords();
  const forContact = started[String(contactId)] ?? [];
  if (forContact.includes(keyword)) return;

  localStorage.setItem(STARTED_KEY, JSON.stringify({ ...started, [String(contactId)]: [...forContact, keyword] }));
};
