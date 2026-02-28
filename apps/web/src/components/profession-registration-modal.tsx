'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ModalOverlay } from './modal-overlay';

type ProfessionType = 'contractor' | 'company' | 'reseller' | null;

type ProfessionRegistrationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (professionType: ProfessionType) => void;
};

export function ProfessionRegistrationModal({ isOpen, onClose, onSelect }: ProfessionRegistrationModalProps) {
  const [selected, setSelected] = useState<ProfessionType>(null);
  const t = useTranslations('professionType');

  const professionOptions = [
    {
      type: 'contractor' as const,
      title: t('contractor'),
      description: t('contractorDesc'),
      icon: '👤',
    },
    {
      type: 'company' as const,
      title: t('company'),
      description: t('companyDesc'),
      icon: '🏢',
    },
    {
      type: 'reseller' as const,
      title: t('reseller'),
      description: t('resellerDesc'),
      icon: '📦',
    },
  ];

  const handleSelect = (type: ProfessionType) => {
    setSelected(type);
    // In a real app, this would transition to the form screen
    // For now, we just notify the parent
    if (type) {
      onSelect(type);
    }
  };

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">{t('joinAsProfessional')}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {t('selectProfession')}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
          {professionOptions.map((option) => (
            <button
              key={option.type}
              onClick={() => handleSelect(option.type)}
              className={`group relative rounded-lg border-2 p-5 text-left transition ${
                selected === option.type
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="text-4xl mb-3">{option.icon}</div>
              <h3 className="font-semibold text-slate-900 text-sm">{option.title}</h3>
              <p className="mt-1 text-xs text-slate-600">{option.description}</p>

              {selected === option.type && (
                <div className="absolute right-3 top-3 h-5 w-5 rounded-full bg-slate-900" />
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => handleSelect(selected)}
            disabled={!selected}
            className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {t('continue')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
