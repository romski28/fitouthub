import type { ChatEvent } from '@/lib/chat-event-parser';

interface ChatEventCardProps {
  event: ChatEvent;
  isCurrentUser?: boolean;
}

export default function ChatEventCard({ event, isCurrentUser = false }: ChatEventCardProps) {
  const isAward = event.type === 'quote-accepted';
  const isNotSelected = event.type === 'quote-not-selected';

  const toneClasses = isAward
    ? 'border-amber-400/60 bg-amber-500/15 text-amber-50'
    : isNotSelected
      ? 'border-rose-400/50 bg-rose-500/10 text-rose-50'
      : isCurrentUser
        ? 'border-2 border-[#ff6b5b] bg-emerald-500 text-white'
        : 'border-sky-400/40 bg-sky-500/10 text-slate-100';

  const titleTone = isAward
    ? 'text-amber-200'
    : isNotSelected
      ? 'text-rose-200'
      : isCurrentUser
        ? 'text-[#ff6b5b]'
        : 'text-sky-200';
  const iconTone = isAward
    ? 'bg-amber-400/25'
    : isNotSelected
      ? 'bg-rose-400/20'
      : isCurrentUser
        ? 'bg-white/20'
        : 'bg-sky-500/20';

  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClasses}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${iconTone}`}>
          {event.icon}
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
        </div>
      </div>
    </div>
  );
}
