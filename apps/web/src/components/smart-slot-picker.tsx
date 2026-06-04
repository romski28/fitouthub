'use client';

import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type SlotStatus = 'free' | 'busy' | 'unavailable';

interface DaySlots {
  AM: SlotStatus;
  PM: SlotStatus;
  ALL_DAY: SlotStatus;
}

interface SmartSlotPickerProps {
  professionalId?: string;
  accessToken?: string | null;
  currentProjectId?: string;
  selectedDate?: string;
  selectedSlot?: 'AM' | 'PM' | 'ALL_DAY';
  onSelect: (date: string, slot: 'AM' | 'PM' | 'ALL_DAY') => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const statusColors: Record<SlotStatus, { bg: string; border: string; text: string; dot: string; label: string }> = {
  free:       { bg: 'bg-emerald-50 hover:bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'Free' },
  busy:       { bg: 'bg-amber-50 hover:bg-amber-100',     border: 'border-amber-300',   text: 'text-amber-800',   dot: 'bg-amber-500',   label: 'Busy' },
  unavailable: { bg: 'bg-slate-100',                       border: 'border-slate-200',   text: 'text-slate-400',   dot: 'bg-slate-300',   label: 'Off' },
};

export const SmartSlotPicker: React.FC<SmartSlotPickerProps> = ({
  professionalId,
  accessToken,
  currentProjectId,
  selectedDate,
  selectedSlot,
  onSelect,
}) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [slotData, setSlotData] = useState<Record<string, DaySlots>>({});
  const [loading, setLoading] = useState(false);

  const today = new Date();
  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek + weekOffset * 7);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const isCurrentWeek = weekOffset === 0;

  useEffect(() => {
    if (!professionalId || !accessToken) return;

    const fetchSlots = async () => {
      setLoading(true);
      try {
        const dates = weekDays.map((d) => d.toISOString().split('T')[0]);
        const res = await fetch(`${API_BASE_URL}/milestones/check-availability-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ professionalId, dates, currentProjectId }),
        });
        if (res.ok) {
          setSlotData(await res.json());
        }
      } catch {
        // non-blocking
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [professionalId, accessToken, weekOffset, currentProjectId]);

  const handleSlotClick = (date: string, slot: 'AM' | 'PM' | 'ALL_DAY') => {
    if (!slotData[date]) return;
    const status = slotData[date][slot];
    if (status === 'unavailable') return; // can't select unavailable
    onSelect(date, slot);
  };

  const SLOTS: Array<'AM' | 'PM' | 'ALL_DAY'> = ['AM', 'PM', 'ALL_DAY'];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setWeekOffset((p) => p - 1)}
          className="p-0.5 hover:bg-slate-100 rounded transition"
        >
          <ChevronLeft className="w-4 h-4 text-slate-500" />
        </button>
        <span className="text-xs font-semibold text-slate-700">
          {isCurrentWeek ? 'This week' : weekOffset === -1 ? 'Last week' : `In ${weekOffset} weeks`}
        </span>
        <button
          onClick={() => setWeekOffset((p) => p + 1)}
          className="p-0.5 hover:bg-slate-100 rounded transition"
        >
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Day columns */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day) => {
          const dateKey = day.toISOString().split('T')[0];
          const isToday = dateKey === today.toISOString().split('T')[0];
          const isSelectedDay = dateKey === selectedDate;
          const daySlots = slotData[dateKey];

          return (
            <div key={dateKey} className="text-center">
              {/* Day header */}
              <div className={`text-[10px] font-semibold mb-0.5 ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                {DAY_LABELS[day.getDay()]}
              </div>
              <div className={`text-xs mb-1 ${isToday ? 'text-blue-700 font-bold' : 'text-slate-600'}`}>
                {day.getDate()}
              </div>

              {/* Slot buttons */}
              <div className="space-y-0.5">
                {SLOTS.map((slot) => {
                  const status = daySlots?.[slot] || 'unavailable';
                  const isSelected = isSelectedDay && selectedSlot === slot;
                  const colors = statusColors[status];
                  const isPast = day < new Date(today.getFullYear(), today.getMonth(), today.getDate());

                  return (
                    <button
                      key={slot}
                      disabled={loading || status === 'unavailable' || isPast}
                      onClick={() => handleSlotClick(dateKey, slot)}
                      className={`w-full px-1 py-0.5 rounded text-[10px] font-medium transition border
                        ${isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : isPast
                            ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                            : `${colors.bg} ${colors.text} ${colors.border} cursor-pointer`
                        }
                        ${loading ? 'opacity-50' : ''}
                      `}
                      title={`${MONTHS[day.getMonth()]} ${day.getDate()} · ${slot} · ${colors.label}${isPast ? ' · Past' : ''}`}
                    >
                      {slot === 'ALL_DAY' ? 'All' : slot}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Free
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Busy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-slate-300" /> Off
        </span>
      </div>
    </div>
  );
};
