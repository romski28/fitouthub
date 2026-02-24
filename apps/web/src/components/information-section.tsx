'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type TabType = 'why' | 'how' | 'who' | 'choose';

interface Card {
  title: string;
  description: string;
  number?: string;
}

interface ContentItem {
  title: string;
  description?: string;
  cards: Card[];
}

type ContentMap = {
  [K in TabType]: ContentItem;
};

export default function InformationSection() {
  const [activeTab, setActiveTab] = useState<TabType>('why');
  const t = useTranslations('home.features');

  const tabs = [
    { id: 'why' as TabType, label: t('tabs.why') },
    { id: 'how' as TabType, label: t('tabs.how') },
    { id: 'who' as TabType, label: t('tabs.who') },
    { id: 'choose' as TabType, label: t('tabs.choose') },
  ];

  const content: ContentMap = {
    why: {
      title: t('why.title'),
      description: t('why.description'),
      cards: [
        {
          title: t('why.secure.title'),
          description: t('why.secure.description'),
        },
        {
          title: t('why.contracts.title'),
          description: t('why.contracts.description'),
        },
        {
          title: t('why.oversight.title'),
          description: t('why.oversight.description'),
        },
        {
          title: t('why.collaboration.title'),
          description: t('why.collaboration.description'),
        },
      ],
    },
    how: {
      title: t('how.title'),
      cards: [
        {
          number: '1',
          title: t('how.plan.title'),
          description: t('how.plan.description'),
        },
        {
          number: '2',
          title: t('how.match.title'),
          description: t('how.match.description'),
        },
        {
          number: '3',
          title: t('how.manage.title'),
          description: t('how.manage.description'),
        },
        {
          number: '4',
          title: t('how.complete.title'),
          description: t('how.complete.description'),
        },
      ],
    },
    who: {
      title: t('who.title'),
      cards: [
        {
          title: t('who.clients.title'),
          description: t('who.clients.description'),
        },
        {
          title: t('who.contractors.title'),
          description: t('who.contractors.description'),
        },
        {
          title: t('who.suppliers.title'),
          description: t('who.suppliers.description'),
        },
        {
          title: t('who.designers.title'),
          description: t('who.designers.description'),
        },
      ],
    },
    choose: {
      title: t('choose.title'),
      description: t('choose.description'),
      cards: [
        {
          title: t('choose.pm.title'),
          description: t('choose.pm.description'),
        },
        {
          title: t('choose.communication.title'),
          description: t('choose.communication.description'),
        },
        {
          title: t('choose.platform.title'),
          description: t('choose.platform.description'),
        },
        {
          title: t('choose.risk.title'),
          description: t('choose.risk.description'),
        },
      ],
    },
  };

  const currentContent = content[activeTab];

  return (
    <section className="space-y-8">
      {/* Tab Buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              activeTab === tab.id
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-gray-100 text-slate-700 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-900">{currentContent.title}</h2>
          {currentContent.description && (
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              {currentContent.description}
            </p>
          )}
        </div>

        {/* Cards Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {currentContent.cards.map((card, index) => (
            <div
              key={index}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              {card.number && (
                <div className="text-4xl font-bold text-emerald-600 mb-2">
                  {card.number}
                </div>
              )}
              <div className="text-lg font-semibold text-slate-900 mb-2">
                {card.title}
              </div>
              <p className="text-sm text-slate-600">{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
