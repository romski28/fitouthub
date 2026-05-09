'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

const DISMISSED_VERSION_KEY = 'home-card-rail-dismissed-version';

type HomeRailCard = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  displayOrder?: number;
  updatedAt?: string;
};

type HomeRailResponse = {
  version: string;
  cards: HomeRailCard[];
};

const fallbackCards: HomeRailCard[] = [
  {
    id: 'plan',
    title: 'Plan Your Fitout',
    description: 'Build a scoped brief quickly, then share it with the right professionals in minutes.',
    imageUrl: '/assets/images/feature-renovation.png',
    ctaHref: '#project-prompt',
    ctaLabel: 'Start a request',
  },
  {
    id: 'compare',
    title: 'Compare Trusted Pros',
    description: 'Review profiles, pricing signals, and response speed to make better hiring decisions.',
    imageUrl: '/assets/images/feature-tradesman.png',
    ctaHref: '#project-prompt',
    ctaLabel: 'Find professionals',
  },
  {
    id: 'protect',
    title: 'Pay With Escrow Protection',
    description: 'Use milestone escrow so funds release only when work is delivered to your standard.',
    imageUrl: '/assets/images/step4-escrow-protection.png',
    ctaHref: '#project-prompt',
    ctaLabel: 'See how it works',
  },
];

export function HomeCardRail() {
  const [cards, setCards] = useState<HomeRailCard[]>(fallbackCards);
  const [version, setVersion] = useState('home-rail-v1:fallback');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadCards = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/announcements/home-rail`);
        if (!response.ok) return;

        const data = (await response.json()) as HomeRailResponse | HomeRailCard[];
        const payload = Array.isArray(data)
          ? { version: 'home-rail-v1:legacy', cards: data }
          : data;
        if (!payload || !Array.isArray(payload.cards) || payload.cards.length === 0) return;

        const validCards = payload.cards.filter((card) =>
          Boolean(card?.id && card?.title && card?.description && card?.imageUrl && card?.ctaLabel && card?.ctaHref),
        );

        if (!isMounted || validCards.length === 0) return;
        setVersion(payload.version || 'home-rail-v1:fallback');

        const dismissedVersion = window.localStorage.getItem(DISMISSED_VERSION_KEY);
        setDismissed(Boolean(dismissedVersion && dismissedVersion === (payload.version || 'home-rail-v1:fallback')));
        setCards(validCards);
      } catch {
        // Keep fallback cards when API is unavailable.
      }
    };

    loadCards();
    return () => {
      isMounted = false;
    };
  }, []);

  const closeRail = () => {
    window.localStorage.setItem(DISMISSED_VERSION_KEY, version);
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  return (
    <section className="-mx-6 px-6" aria-label="Browse fitout highlights">
      <div className="mx-auto max-w-6xl">
        <div className="relative">
          <button
            type="button"
            onClick={closeRail}
            className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-500 transition hover:bg-white hover:text-slate-700"
            aria-label="Close highlights"
          >
            X
          </button>

          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {cards.map((card) => (
              <a
                key={card.id}
                href={card.ctaHref}
                className="group flex h-[10vh] min-h-[72px] max-h-[96px] min-w-[320px] snap-start overflow-hidden rounded-xl border border-white/55 bg-white/95 pr-2 shadow-sm shadow-black/10 sm:min-w-[360px]"
              >
                <div className="h-full aspect-square overflow-hidden bg-slate-100">
                  <img
                    src={card.imageUrl}
                    alt={card.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2">
                  <h3 className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[#F97362]">{card.title}</h3>
                  <p className="line-clamp-2 text-[11px] leading-4 text-slate-600">{card.description}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
