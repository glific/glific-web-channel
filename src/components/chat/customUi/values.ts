// Pure helpers shared by the custom UI blocks (kept out of the component files so fast refresh
// stays component-only).

// Contract §7 caps a summary at 500 chars; clamp here so a wide form can never be rejected,
// and never emit a blank summary (§4 requires a non-empty string — it becomes the message body).
export const SUMMARY_MAX = 500;

export const clampSummary = (summary: string, fallback: string): string => {
  const trimmed = summary.trim();
  const value = trimmed || fallback;
  return value.length > SUMMARY_MAX ? value.slice(0, SUMMARY_MAX) : value;
};

// A valid JSON *object* typed into the fallback card is sent as `values` verbatim; anything
// else — including valid JSON that is a number, string, null or array — becomes
// `{ "input": "<text>" }`.
export const parseFallbackValues = (text: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not JSON — fall through to the plain-text shape
  }
  return { input: text };
};
