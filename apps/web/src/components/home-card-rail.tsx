'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

type HomeRailCard = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  displayOrder?: number;
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

  useEffect(() => {
    let isMounted = true;

    const loadCards = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/announcements/home-rail`);
        if (!response.ok) return;

        const data = (await response.json()) as HomeRailCard[];
        if (!Array.isArray(data) || data.length === 0) return;

        const validCards = data.filter((card) =>
          Boolean(card?.id && card?.title && card?.description && card?.imageUrl && card?.ctaLabel && card?.ctaHref),
        );

        if (!isMounted || validCards.length === 0) return;
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

  return (
    <section className="-mx-6 px-6" aria-label="Browse fitout highlights">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 className="text-base font-semibold text-white sm:text-lg">Browse what FitOut Hub can do</h2>
          <p className="text-xs font-medium text-white/80">Swipe on mobile</p>
        </div>

        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {cards.map((card) => (
            <a
              key={card.id}
              href={card.ctaHref}
              className="group min-w-[260px] flex-1 snap-start overflow-hidden rounded-2xl border border-white/45 bg-white/95 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:shadow-xl sm:min-w-[300px]"
            >
              <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                <img
                  src={card.imageUrl}
                  alt={card.title}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>
              <div className="space-y-2 p-4">
                <h3 className="text-base font-bold text-slate-900">{card.title}</h3>
                <p className="text-sm text-slate-600">{card.description}</p>
                <span className="inline-flex items-center text-sm font-semibold text-emerald-700 group-hover:text-emerald-800">
                  {card.ctaLabel}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
