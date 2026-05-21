'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

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
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);
  
  const defaultTabs: ProjectTabDefinition[] = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'site-access', label: 'Site Access', icon: '📍' },
    { id: 'professionals', label: 'Professionals', icon: '👥' },
    { id: 'chat', label: 'Chat', icon: '💬' },
    { id: 'media', label: 'Media', icon: '🖼️' },
  ];

  const resolvedTabs = tabs && tabs.length > 0 ? tabs : defaultTabs;

  const activeTabLabel = resolvedTabs.find((t) => t.id === activeTab)?.label || 'Menu';

  const updateScrollState = useCallback(() => {
    const el = tabsScrollRef.current;
    if (!el) return;

    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - 2);
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [resolvedTabs, updateScrollState]);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;

    const handleScroll = () => updateScrollState();
    const handleResize = () => updateScrollState();

    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateScrollState]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;
      const el = tabsScrollRef.current;
      if (!el) return;

      const deltaX = event.clientX - dragStartXRef.current;
      if (Math.abs(deltaX) > 4) {
        hasDraggedRef.current = true;
      }
      el.scrollLeft = dragStartScrollLeftRef.current - deltaX;
      updateScrollState();
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      requestAnimationFrame(() => {
        hasDraggedRef.current = false;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateScrollState]);

  const scrollTabsBy = (delta: number) => {
    const el = tabsScrollRef.current;
    if (!el) return;

    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <>
      {/* Desktop Tab Navigation */}
      <div className="hidden sm:block sticky top-0 z-40 rounded-[28px] border border-[rgba(120,53,15,0.12)] bg-[rgba(239,231,207,0.78)] shadow-[0_18px_40px_rgba(81,55,32,0.05)] backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative py-3">
            <button
              type="button"
              aria-label="Scroll tabs left"
              onClick={() => scrollTabsBy(-220)}
              disabled={!canScrollLeft}
              className={`absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border p-2 transition ${
                canScrollLeft
                  ? 'border-[rgba(120,53,15,0.16)] bg-[rgba(255,250,240,0.92)] text-[rgba(126,58,33,0.92)] hover:bg-[rgba(255,250,240,1)]'
                  : 'cursor-not-allowed border-[rgba(120,53,15,0.08)] bg-[rgba(255,250,240,0.55)] text-slate-400'
              }`}
            >
              <span aria-hidden="true">◀</span>
            </button>

            <button
              type="button"
              aria-label="Scroll tabs right"
              onClick={() => scrollTabsBy(220)}
              disabled={!canScrollRight}
              className={`absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border p-2 transition ${
                canScrollRight
                  ? 'border-[rgba(120,53,15,0.16)] bg-[rgba(255,250,240,0.92)] text-[rgba(126,58,33,0.92)] hover:bg-[rgba(255,250,240,1)]'
                  : 'cursor-not-allowed border-[rgba(120,53,15,0.08)] bg-[rgba(255,250,240,0.55)] text-slate-400'
              }`}
            >
              <span aria-hidden="true">▶</span>
            </button>

            <div
              ref={tabsScrollRef}
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                dragStartXRef.current = event.clientX;
                dragStartScrollLeftRef.current = tabsScrollRef.current?.scrollLeft ?? 0;
                hasDraggedRef.current = false;
                setIsDragging(true);
              }}
              className={`mx-10 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
              }`}
            >
            {resolvedTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (hasDraggedRef.current) return;
                  onTabChange(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors border ${
                  activeTab === tab.id
                    ? 'border-[rgba(120,53,15,0.16)] bg-[rgba(255,250,240,0.92)] text-[rgba(126,58,33,0.92)] shadow-sm'
                    : 'border-transparent bg-transparent text-slate-600 hover:border-[rgba(120,53,15,0.12)] hover:bg-[rgba(255,250,240,0.62)] hover:text-slate-900'
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
      </div>

      {/* Mobile Tab Navigation - Dropdown */}
      <div className="sm:hidden sticky top-0 z-40 rounded-[24px] border border-[rgba(120,53,15,0.12)] bg-[rgba(239,231,207,0.78)] shadow-[0_18px_40px_rgba(81,55,32,0.05)] backdrop-blur-sm">
        <div className="px-4 py-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-2xl border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.9)] hover:bg-[rgba(255,250,240,0.98)] transition"
          >
            <span className="text-sm font-semibold text-slate-900">
              {resolvedTabs.find((t) => t.id === activeTab)?.icon} {activeTabLabel}
            </span>
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`}
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
                  className={`w-full text-left px-3 py-2 rounded-2xl text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? 'bg-[rgba(255,250,240,0.94)] text-[rgba(126,58,33,0.92)] border border-[rgba(120,53,15,0.14)]'
                      : 'bg-[rgba(255,250,240,0.62)] text-slate-700 hover:bg-[rgba(255,250,240,0.82)] border border-[rgba(120,53,15,0.1)]'
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
