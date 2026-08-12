import { useRef, useState } from 'react';

import { FallbackCard } from '@/components/chat/customUi/blocks/FallbackCard';
import { resolveRenderer, type CustomUiAnswer } from '@/components/chat/customUi/registry';
import type { CustomUiContent, CustomUiResponse } from '@/services/webChannelSocket';

// seed the built-in `glific/*` catalog into the registry
import '@/components/chat/customUi/blocks';

export interface CustomUiBlockProps {
  // the server id of the outbound custom_ui message being answered — §4's `message_id`, which
  // the backend guards on with `is_integer`. Never an optimistic `local-…` id.
  messageId: number;
  content: CustomUiContent;
  // structured push (contract §4) — deliberately NOT the plain-text reply path. May return a
  // promise; a rejection means the server refused (or never answered) and the block re-opens.
  onRespond?: (response: CustomUiResponse) => Promise<unknown> | void;
}

// Renders one custom_ui envelope: resolve the component to a renderer (registered -> built-in
// glific/* -> generic fallback card) and turn the renderer's answer into the §4 payload.
//
// Answered state is DERIVED, never seeded into state: the server writes `answered` /
// `answer_summary` into the outbound message's interactive_content once a response is accepted,
// so a reload or a history page renders the true answered state, while a local submit disables
// the block immediately without waiting for the round trip. Neither can re-enable the other.
export const CustomUiBlock = ({ messageId, content, onRespond }: CustomUiBlockProps) => {
  const [localAnswer, setLocalAnswer] = useState<CustomUiAnswer | null>(null);
  // `answered` is derived from state, so two submits fired in the same render tick would both
  // see the old value and both push. The backend rejects the second, but its rejection path
  // would then roll back the first (already accepted) answer. A ref flips synchronously, so
  // only one push is ever issued.
  const submitted = useRef(false);

  const answered = content.answered === true || localAnswer !== null;
  const answerSummary = content.answer_summary ?? localAnswer?.summary ?? null;

  const Renderer = resolveRenderer(content.component) ?? FallbackCard;

  const handleSubmit = (answer: CustomUiAnswer) => {
    if (answered || submitted.current) return;
    submitted.current = true;
    setLocalAnswer(answer);
    const sent = onRespond?.({
      message_id: messageId,
      component: content.component,
      values: answer.values,
      summary: answer.summary,
      ...(content.context ? { context: content.context } : {}),
    });
    // the server refused the answer (or never replied) — the truth is still "unanswered", so
    // let the contact try again instead of leaving a permanently dead block
    if (sent && typeof sent.then === 'function') {
      sent.catch(() => {
        submitted.current = false;
        setLocalAnswer(null);
      });
    }
  };

  return (
    <div data-testid="customUiBlock" data-component={content.component} data-answered={answered}>
      <Renderer content={content} disabled={answered} onSubmit={handleSubmit} />
      {answered && (
        <div className="mt-2 text-xs text-muted-foreground" data-testid="customUiAnswerSummary">
          {answerSummary || 'Answered'}
        </div>
      )}
    </div>
  );
};

export default CustomUiBlock;
