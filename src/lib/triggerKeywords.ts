// Links an organisation shares to its web chat can carry a message, the way wa.me links do:
//
//   ?text=Hello   opens the chat with "Hello" in the composer, for the contact to send
//   ?start=adopt  sends "adopt" for the contact when the chat opens, so its flow starts
//
// `text` is only ever pre-filled; `start` is sent as the contact's message on every visit through
// the link, the way typing the keyword again restarts its flow. A keyword only starts a flow if it
// is a web flow's: the server matches keywords on the message's channel.

export interface TriggerKeywords {
  text?: string;
  start?: string;
}

// sessionStorage, not memory: a contact who isn't signed in goes through the login screen (and,
// for an organisation's own login, possibly another site) before reaching the chat, and the tab
// is the one thing that survives all of it.
const AUTO_TRIGGER_KEYWORDS = 'glific_web_auto_trigger_keywords';

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
export const captureTriggerKeywords = (location: Location = window.location, history: History = window.history): void => {
  const params = new URLSearchParams(location.search);
  const link: TriggerKeywords = { text: cleanText(params.get('text')), start: cleanKeyword(params.get('start')) };

  if (!params.has('text') && !params.has('start')) return;

  if (link.text || link.start) sessionStorage.setItem(AUTO_TRIGGER_KEYWORDS, JSON.stringify(link));

  params.delete('text');
  params.delete('start');
  const query = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
};

/** The link waiting for the chat, removed as it is read so it applies once. */
export const takeTriggerKeywords = (): TriggerKeywords | null => {
  const raw = sessionStorage.getItem(AUTO_TRIGGER_KEYWORDS);
  sessionStorage.removeItem(AUTO_TRIGGER_KEYWORDS);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as TriggerKeywords;
  } catch {
    return null;
  }
};
