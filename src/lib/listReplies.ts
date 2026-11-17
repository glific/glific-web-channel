import type {
  WebChannelInteractiveContent,
  WebChannelInteractiveOption,
  WebChannelMessage,
} from '@/services/webChannelSocket';

/** The options an interactive message offers: a quick reply's buttons, or every row of a list. */
export const interactiveOptions = (content: WebChannelInteractiveContent): WebChannelInteractiveOption[] => {
  if (content.type === 'quick_reply') return content.options ?? [];
  // A list's options live one level down, inside its sections; flatten them, since the widget
  // has no room for the two-step "open the list, then choose" flow WhatsApp uses.
  if (content.type === 'list') return (content.items ?? []).flatMap((item) => item.options ?? []);
  return [];
};

const isReplyText = (message: WebChannelMessage) =>
  message.flow === 'inbound' && (message.type ?? 'text') === 'text' && !message.interactive_content?.description;

/**
 * Give each list reply the description of the option it chose, so the contact's bubble shows it
 * the way WhatsApp does. The server stores only the title (flows match on it), so the description
 * is looked up from the list itself: the nearest earlier interactive message the organisation
 * sent. Works the same for a reply just tapped and for one re-fetched after a reload.
 *
 * A reply whose list is on a page not loaded yet shows its title alone.
 */
export const withChosenDescriptions = (messages: WebChannelMessage[]): WebChannelMessage[] => {
  let latestPrompt: WebChannelInteractiveContent | null = null;

  return messages.map((message) => {
    if (message.flow === 'outbound' && message.interactive_content?.type) {
      latestPrompt = message.interactive_content;
      return message;
    }

    if (latestPrompt?.type !== 'list' || !isReplyText(message)) return message;

    const title = message.body.trim();
    const chosen = interactiveOptions(latestPrompt).find((option) => option.title === title);
    if (!chosen?.description) return message;

    return { ...message, interactive_content: { title, description: chosen.description } };
  });
};
