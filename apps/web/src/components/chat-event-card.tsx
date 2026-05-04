import type { ChatEvent } from '@/lib/chat-event-parser';

interface ChatEventCardProps {
  event: ChatEvent;
  isCurrentUser?: boolean;
}

export default function ChatEventCard({ event, isCurrentUser = false }: ChatEventCardProps) {
  const isAward = event.type === 'quote-accepted';

  const toneClasses = isAward
    ? 'border-amber-400/60 bg-amber-500/15 text-amber-50'
    : isCurrentUser
      ? 'border-emerald-400/50 bg-emerald-600/20 text-emerald-50'
      : 'border-sky-400/40 bg-sky-500/10 text-slate-100';

  const titleTone = isAward ? 'text-amber-200' : isCurrentUser ? 'text-emerald-100' : 'text-sky-200';
  const iconTone = isAward ? 'bg-amber-400/25' : isCurrentUser ? 'bg-emerald-500/25' : 'bg-sky-500/20';

  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClasses}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${iconTone}`}>
          {event.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${titleTone}`}>{event.title}</p>
          {event.summary ? <p className="mt-0.5 text-xs text-slate-200/90">{event.summary}</p> : null}

          {event.fields && event.fields.length > 0 ? (
            <dl className="mt-2 space-y-1">
              {event.fields.map((field) => (
                <div key={`${field.label}-${field.value}`} className="flex items-baseline gap-2 text-xs">
                  <dt className="shrink-0 text-slate-300">{field.label}:</dt>
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
