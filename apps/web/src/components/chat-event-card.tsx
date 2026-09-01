import type { ChatEvent, ChatEventAction } from '@/lib/chat-event-parser';

interface ChatEventCardProps {
  event: ChatEvent;
  isCurrentUser?: boolean;
  onAction?: (action: ChatEventAction) => void;
}

export default function ChatEventCard({ event, isCurrentUser = false, onAction }: ChatEventCardProps) {
  const isAward = event.type === 'quote-accepted';
  const isNotSelected = event.type === 'quote-not-selected';

  const toneClasses = isAward
    ? 'border-amber-400/60 bg-amber-500/15 text-amber-50'
    : isNotSelected
      ? 'border-rose-400/50 bg-rose-500/10 text-rose-50'
      : isCurrentUser
        ? 'border-2 border-[#ff6b5b] bg-emerald-500 text-white'
      : 'border-blue-400/50 bg-blue-600 text-white';
        ? 'text-[#ff6b5b]'
        : 'text-sky-200';
  const iconTone = isAward
    ? 'bg-amber-400/25'
    : isNotSelected
      ? 'bg-rose-400/20'
      : isCurrentUser
        ? 'bg-white/20'
      : 'bg-white/20';
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-base font-semibold leading-relaxed ${titleTone}`}>{event.title}</p>
          {event.summary ? <p className={`mt-1 text-sm leading-relaxed whitespace-pre-wrap ${isCurrentUser ? 'text-white' : 'text-slate-200/90'}`}>{event.summary}</p> : null}

          {event.fields && event.fields.length > 0 ? (
            <dl className="mt-2 space-y-1.5">
              {event.fields.map((field) => (
                <div key={`${field.label}-${field.value}`} className="flex items-baseline gap-2 text-sm">
                  <dt className={`shrink-0 ${isCurrentUser ? 'text-white' : 'text-slate-300'}`}>{field.label}:</dt>
                  <dd className="font-medium text-white break-words">{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {event.actions && event.actions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {event.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => onAction?.(action)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
