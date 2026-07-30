import type { ReactNode } from 'react';

// Minimal, XSS-safe WhatsApp-markup renderer — a self-contained replacement for the
// staff app's `WhatsAppToJsx`. Builds React nodes (never dangerouslySetInnerHTML), so
// message bodies can never inject markup. Supports the common WhatsApp styles:
//   *bold*  _italic_  ~strikethrough~  ```monospace```  and http(s) autolinking,
// plus newline -> <br/>. Nesting is intentionally shallow (one style level) to keep the
// parser small; that covers the vast majority of real messages.
const TOKEN = /(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s]+)/g;

const renderLine = (line: string, keyPrefix: string): ReactNode[] => {
  const parts = line.split(TOKEN);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;
    if (part.startsWith('```') && part.endsWith('```')) {
      return (
        <code key={key} className="rounded bg-black/10 px-1 font-mono text-[0.85em] dark:bg-white/10">
          {part.slice(3, -3)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <strong key={key} className="font-semibold">
          {part.slice(1, -1)}
        </strong>
      );
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('~') && part.endsWith('~')) {
      return (
        <span key={key} className="line-through">
          {part.slice(1, -1)}
        </span>
      );
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={key}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {part}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
};

// Render a WhatsApp-formatted message body as safe React nodes.
export const whatsappToJsx = (body: string): ReactNode => {
  const lines = (body ?? '').split('\n');
  return lines.map((line, i) => (
    // eslint-disable-next-line react/no-array-index-key
    <span key={`line-${i}`}>
      {renderLine(line, `l${i}`)}
      {i < lines.length - 1 ? <br /> : null}
    </span>
  ));
};

// Short local time (HH:mm) for a message timestamp — native Intl, no dayjs dependency.
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

export const formatShortTime = (isoOrDate: string): string => {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return timeFormatter.format(d);
};
