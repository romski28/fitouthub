'use client';

import React, { useState } from 'react';

interface ProjectTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const ProjectTabs: React.FC<ProjectTabsProps> = ({ activeTab, onTabChange }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'site-access', label: 'Site Access', icon: '📍' },
    { id: 'professionals', label: 'Professionals', icon: '👥' },
    { id: 'chat', label: 'Chat', icon: '💬' },
    { id: 'media', label: 'Media', icon: '🖼️' },
  ];

  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label || 'Menu';

  return (
    <>
      {/* Desktop Tab Navigation */}
      <div className="hidden sm:block sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
                aria-selected={activeTab === tab.id}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Tab Navigation - Dropdown */}
      <div className="sm:hidden sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 py-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition"
          >
            <span className="text-sm font-semibold text-slate-900">
              {tabs.find((t) => t.id === activeTab)?.icon} {activeTabLabel}
            </span>
            <svg
              className={`w-4 h-4 text-slate-600 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {mobileMenuOpen && (
            <div className="mt-2 space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    onTabChange(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-600 border border-blue-200'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

interface AccordionItemProps {
  id: string;
  title: string;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
  badge?: string;
}

export const AccordionItem: React.FC<AccordionItemProps> = ({ id, title, isOpen, onToggle, children, badge }) => {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
          isOpen ? 'bg-blue-50 border-b border-slate-200' : 'hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-3 flex-1 text-left">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {badge && (
            <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <span className={`ml-3 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="px-4 py-3 border-t border-slate-200 bg-white">
          {children}
        </div>
      )}
    </div>
  );
};

export const AccordionGroup: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <div className={`space-y-3 ${className}`}>{children}</div>;
};
