export type ChatEventType = 'quote-submitted' | 'quote-accepted' | 'quote-not-selected' | 'generic';

export interface ChatEventField {
  label: string;
  value: string;
}

export interface ChatEventAction {
  id: string;
  label: string;
  kind?: string;
  payload?: Record<string, string>;
}

export interface ChatEvent {
  type: ChatEventType;
  icon: string;
  title: string;
  summary?: string;
  fields?: ChatEventField[];
  actions?: ChatEventAction[];
  eventId?: string;
  kind?: string;
  resolved?: boolean;
  answer?: string;
  imageCount?: number;
  bookedAt?: string;
  booked?: boolean;
  rawContent: string;
}

interface StructuredChatEvent {
  type: string;
  icon?: string;
  title?: string;
  summary?: string;
  fields?: ChatEventField[];
  actions?: ChatEventAction[];
  eventId?: string;
  kind?: string;
  resolved?: boolean;
  answer?: string;
  imageCount?: number;
  bookedAt?: string;
  booked?: boolean;
}

const STRUCTURED_PREFIX = '[[event]]';

export function buildStructuredChatEventMessage(event: {
  type?: string;
  icon?: string;
  title: string;
  summary?: string;
  fields?: ChatEventField[];
  actions?: ChatEventAction[];
}) {
  const payload: StructuredChatEvent = {
    type: (event.type || 'generic').trim(),
    icon: event.icon,
    title: event.title,
    summary: event.summary,
    fields: Array.isArray(event.fields)
      ? event.fields.filter((field) => field.label?.trim() && field.value?.trim())
      : undefined,
    actions: Array.isArray(event.actions)
      ? event.actions.filter((action) => action.id?.trim() && action.label?.trim())
      : undefined,
  };

  return `${STRUCTURED_PREFIX}\n${JSON.stringify(payload)}`;
}

function parseStructuredEvent(content: string): ChatEvent | null {
  if (!content.startsWith(STRUCTURED_PREFIX)) return null;

  const rawPayload = content.slice(STRUCTURED_PREFIX.length).trim();
  if (!rawPayload) return null;

  try {
    const parsed = JSON.parse(rawPayload) as StructuredChatEvent;
    const knownTypes: ChatEventType[] = ['quote-submitted', 'quote-accepted', 'quote-not-selected'];
    const eventType: ChatEventType = knownTypes.includes(parsed.type as ChatEventType)
      ? (parsed.type as ChatEventType)
      : 'generic';
    return {
      type: eventType,
      icon: parsed.icon || '📌',
      title: parsed.title || 'Update',
      summary: parsed.summary,
      fields: parsed.fields,
      actions: parsed.actions,
      eventId: parsed.eventId,
      kind: parsed.kind,
      resolved: parsed.resolved === true,
      answer: parsed.answer,
      imageCount: parsed.imageCount,
      bookedAt: parsed.bookedAt,
      booked: parsed.booked === true,
      rawContent: content,
    };
  } catch {
    return null;
  }
}

function parseQuoteSubmittedEvent(content: string): ChatEvent | null {
  const quotePattern = /^We have submitted a quotation(?: for HK\$([\d,]+(?:\.\d+)?))? starting (.+?) for (.+)\.$/i;
  const match = content.match(quotePattern);
  if (!match) return null;

  const amount = match[1];
  const start = match[2];
  const duration = match[3];

  const fields: ChatEventField[] = [];
  if (amount) fields.push({ label: 'Amount', value: `HK$${amount}` });
  if (start) fields.push({ label: 'Start', value: start });
  if (duration) fields.push({ label: 'Duration', value: duration });

  return {
    type: 'quote-submitted',
    icon: '💰',
    title: 'Quote Submitted',
    fields,
    rawContent: content,
  };
}

const EVENT_DETECTORS: Array<(content: string) => ChatEvent | null> = [
  parseStructuredEvent,
  parseQuoteSubmittedEvent,
];

export function parseChatEvent(content: string): ChatEvent | null {
  const normalized = content.trim();
  if (!normalized) return null;

  for (const detector of EVENT_DETECTORS) {
    const event = detector(normalized);
    if (event) return event;
  }

  return null;
}
