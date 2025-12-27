'use client';

import { useState } from 'react';

type TabType = 'why' | 'how' | 'who' | 'choose';

export default function InformationSection() {
  const [activeTab, setActiveTab] = useState<TabType>('why');

  const tabs = [
    { id: 'why' as TabType, label: 'Why FitOut Hub' },
    { id: 'how' as TabType, label: 'How it works' },
    { id: 'who' as TabType, label: 'Who we help' },
    { id: 'choose' as TabType, label: 'Why choose us' },
  ];

  const content = {
    why: {
      title: 'Why FitOut Hub',
      description: 'Unlike traditional renovation processes that often lead to miscommunication, delays, and disputes, FitOut Hub provides:',
      cards: [
        {
          title: 'Secure payments in escrow',
          description: 'Funds are held in escrow and released only when milestones are verified.',
        },
        {
          title: 'Clear contracts & scope',
          description: 'No hidden clauses — transparent terms agreed up front by all parties.',
        },
        {
          title: 'Independent oversight',
          description: 'Project managers monitor progress, verify work, and resolve issues early.',
        },
        {
          title: 'Collaboration without friction',
          description: 'Clients, contractors, and suppliers work together on one platform.',
        },
      ],
    },
    how: {
      title: 'How it works',
      cards: [
        {
          number: '1',
          title: 'Plan',
          description: 'Define your project scope with expert guidance.',
        },
        {
          number: '2',
          title: 'Match',
          description: 'Connect with vetted contractors, suppliers, and professionals.',
        },
        {
          number: '3',
          title: 'Manage',
          description: 'Track progress, payments, and documentation in one place.',
        },
        {
          number: '4',
          title: 'Complete',
          description: 'Enjoy a smooth, dispute‑free handover.',
        },
      ],
    },
    who: {
      title: 'Who we help',
      cards: [
        {
          title: 'Clients & property owners',
          description: 'Peace of mind with secure payments, vetted professionals, and proactive oversight.',
        },
        {
          title: 'Contractors & builders',
          description: 'Fair contracts, timely payments, and fewer disputes.',
        },
        {
          title: 'Suppliers',
          description: 'Transparent terms and new opportunities across active projects.',
        },
        {
          title: 'Design professionals',
          description: 'Seamless collaboration with contractors and clients in a structured environment.',
        },
      ],
    },
    choose: {
      title: 'Why choose us',
      description: 'Unlike traditional renovation processes that often lead to miscommunication, delays, and disputes, FitOut Hub provides:',
      cards: [
        {
          title: 'Professional project management',
          description: 'Neutral, professional project management that keeps work moving and issues contained.',
        },
        {
          title: 'Transparent communication',
          description: 'Transparent communication at every stage, with documented milestones and evidence.',
        },
        {
          title: 'Unified platform',
          description: 'A single platform for all stakeholders, unifying scope, schedule, and payments.',
        },
        {
          title: 'Risk reduction',
          description: 'Reduced risk and stress with clear expectations and fair resolution paths.',
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
