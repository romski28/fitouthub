'use client';

import React, { useState } from 'react';

interface ProjectTabDefinition {
  id: string;
  label: string;
  icon?: string;
}

interface ProjectTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs?: ProjectTabDefinition[];
  children?: React.ReactNode;
}

export const ProjectTabs: React.FC<ProjectTabsProps> = ({ activeTab, onTabChange, tabs, children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const defaultTabs: ProjectTabDefinition[] = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'site-access', label: 'Site Access', icon: '📍' },
    { id: 'professionals', label: 'Professionals', icon: '👥' },
    { id: 'chat', label: 'Chat', icon: '💬' },
    { id: 'media', label: 'Media', icon: '🖼️' },
  ];

  const resolvedTabs = tabs && tabs.length > 0 ? tabs : defaultTabs;

  const activeTabLabel = resolvedTabs.find((t) => t.id === activeTab)?.label || 'Menu';

  return (
    <>
      {/* Desktop Tab Navigation */}
      <div className="hidden sm:block sticky top-0 z-40 bg-slate-950 border-b border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex overflow-x-auto">
            {resolvedTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
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
      <div className="sm:hidden sticky top-0 z-40 bg-slate-950 border-b border-slate-800 shadow-sm">
        <div className="px-4 py-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 transition"
          >
            <span className="text-sm font-semibold text-white">
              {resolvedTabs.find((t) => t.id === activeTab)?.icon} {activeTabLabel}
            </span>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`}
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
              {resolvedTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    onTabChange(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
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

      {children && (
        <div className="mt-5 space-y-5">
          {React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) return child;
            const childTab = (child.props as { tab?: string }).tab;
            if (childTab && childTab !== activeTab) return null;
            return child;
          })}
        </div>
      )}
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
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/50 backdrop-blur-sm">
      <button
        onClick={() => onToggle(id)}
        className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
          isOpen ? 'bg-emerald-500/15 border-b border-slate-700' : 'hover:bg-white/5'
        }`}
      >
        <div className="flex items-center gap-3 flex-1 text-left">
          <h3 className="font-semibold text-white">{title}</h3>
          {badge && (
            <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
              {badge}
            </span>
          )}
        </div>
        <span className={`ml-3 flex-shrink-0 transition-transform text-slate-400 ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-950/50">
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
