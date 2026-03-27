"use client";

import { useMemo, useState } from "react";
import { ModalOverlay } from "./modal-overlay";

export type AssistContactMethod = "chat" | "call" | "whatsapp";
export type AssistCategory = "payment" | "delay" | "quality" | "safety" | "dispute" | "general";

export type AssistRequestModalSubmit = {
  contactMethod: AssistContactMethod;
  category: AssistCategory;
  notes: string;
  requestedCallAt?: string;
  requestedCallTimezone?: string;
};

/** pre-project: assist before project exists (creation flow)
 *  active: assist on a live project (coordinator / PM request) */
export type AssistContext = "pre-project" | "active";

type AssistRequestModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: AssistRequestModalSubmit) => Promise<{ caseNumber?: string } | void>;
  isSubmitting?: boolean;
  error?: string | null;
  initialNotes?: string;
  projectName?: string;
  /** pre-project hides category picker; active shows it */
  context?: AssistContext;
  submitPrefix?: string;
};

const SLOT_INTERVAL_MINUTES = 30;

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextAllowedDate() {
  const date = new Date();
  while (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }
  return toDateInputValue(date);
}

function getAllowedTimes(dateValue: string) {
  if (!dateValue) return [] as string[];
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDay();
  if (day === 0) return [] as string[];
  const openingHour = 9;
  const closingHour = day === 6 ? 13 : 18;
  const slots: string[] = [];
  for (let hour = openingHour; hour < closingHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += SLOT_INTERVAL_MINUTES) {
      const label = `${`${hour}`.padStart(2, "0")}:${`${minute}`.padStart(2, "0")}`;
      slots.push(label);
    }
  }
  return slots;
}

function formatRequestedSlot(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return "";
  const slot = new Date(`${dateValue}T${timeValue}:00`);
  return slot.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CATEGORIES: { value: AssistCategory; label: string; emoji: string }[] = [
  { value: "payment",  label: "Payment issue",    emoji: "\u{1F4B0}" },
  { value: "delay",    label: "Schedule / delay", emoji: "\u{1F4C5}" },
  { value: "quality",  label: "Quality concern",  emoji: "\u{1F50D}" },
  { value: "safety",   label: "Safety concern",   emoji: "\u{26A0}\u{FE0F}" },
  { value: "dispute",  label: "Dispute",          emoji: "\u{2696}\u{FE0F}" },
  { value: "general",  label: "General advice",   emoji: "\u{1F4AC}" },
];

export function AssistRequestModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  error,
  initialNotes = "",
  projectName,
  context = "pre-project",
  submitPrefix = "Request assistance",
}: AssistRequestModalProps) {
  const [contactMethod, setContactMethod] = useState<AssistContactMethod>("chat");
  const [category, setCategory] = useState<AssistCategory>("general");
  const [notes, setNotes] = useState(initialNotes);
  const [requestedDate, setRequestedDate] = useState(getNextAllowedDate());
  const [requestedTime, setRequestedTime] = useState("09:00");
  const [localError, setLocalError] = useState<string | null>(null);
  const [caseNumber, setCaseNumber] = useState<string | null>(null);

  const isActive = context === "active";
  const availableTimes = useMemo(() => getAllowedTimes(requestedDate), [requestedDate]);

  const handleDateChange = (value: string) => {
    setRequestedDate(value);
    const nextTimes = getAllowedTimes(value);
    setRequestedTime(nextTimes[0] || "");
  };

  const handleSubmit = async () => {
    setLocalError(null);
    if (!notes.trim()) {
      setLocalError("Please describe what you need help with.");
      return;
    }
    if (contactMethod === "call") {
      if (new Date(`${requestedDate}T00:00:00`).getDay() === 0) {
        setLocalError("Calls are not available on Sundays.");
        return;
      }
      if (!requestedDate || !requestedTime) {
        setLocalError("Please choose a preferred call date and time.");
        return;
      }
    }

    const result = await onSubmit({
      contactMethod,
      category,
      notes: notes.trim(),
      requestedCallAt:
        contactMethod === "call"
          ? new Date(`${requestedDate}T${requestedTime}:00+08:00`).toISOString()
          : undefined,
      requestedCallTimezone: contactMethod === "call" ? "Asia/Hong_Kong" : undefined,
    });

    if (result && (result as any).caseNumber) {
      setCaseNumber((result as any).caseNumber);
    }
  };

  // ---- Case raised confirmation ----
  if (caseNumber) {
    return (
      <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
        <div className="space-y-5 text-center py-4">
          <div className="text-5xl">{"\u{2705}"}</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600 mb-1">Case raised</p>
            <h2 className="text-2xl font-bold text-slate-900">We are on it</h2>
            <p className="mt-2 text-sm text-slate-600">
              A coordinator will respond within <strong>1 hour</strong>.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-4">
            <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wider mb-1">Case reference</p>
            <p className="text-2xl font-mono font-bold text-emerald-800">{caseNumber}</p>
            <p className="text-xs text-emerald-600 mt-1">Quote this in any follow-up communication.</p>
          </div>
          <button
            type="button"
            onClick={() => { setCaseNumber(null); onClose(); }}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition"
          >
            Close
          </button>
        </div>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
            Fitout Hub {isActive ? "project management" : "assistance"}
          </p>
          <h2 className="text-2xl font-bold text-slate-900">
            {isActive ? "Request a project manager" : "Choose how you want FoH to help"}
          </h2>
          <p className="text-sm text-slate-600">
            {projectName
              ? isActive
                ? `Raise a support case for ${projectName}. A coordinator will respond within 1 hour.`
                : `For ${projectName} — choose whether you would like to chat, request a call, or ask FoH to WhatsApp you.`
              : isActive
                ? "A FoH coordinator will be assigned and will respond within 1 hour."
                : "Choose whether you would like to chat in-platform, request a call, or ask FoH to WhatsApp you."}
          </p>
        </div>

        {/* Category picker — active context only */}
        {isActive && (
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-2">What kind of help do you need?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    category === cat.value
                      ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-900 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="mr-1.5">{cat.emoji}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contact method */}
        <div>
          {isActive && (
            <p className="text-sm font-semibold text-slate-900 mb-2">How should we reach you?</p>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { value: "chat",      title: "In-platform chat",    description: "Continue in the FoH chat thread.",             emoji: "\u{1F4AC}" },
              { value: "call",      title: "Book a call",         description: "Request a call with a coordinator.",           emoji: "\u{1F4DE}" },
              { value: "whatsapp",  title: "Please WhatsApp me",  description: "FoH will follow up on WhatsApp.",              emoji: "\u{1F7E2}" },
            ].map((option) => {
              const active = contactMethod === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setContactMethod(option.value as AssistContactMethod)}
                  className={`rounded-xl border p-4 text-left transition ${
                    active ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="mb-3 text-2xl">{option.emoji}</div>
                  <div className="text-sm font-semibold text-slate-900">{option.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes + optional call slot */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-900">
              {isActive ? "Describe the issue" : "Initial request"}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder={
                isActive
                  ? "Please describe the situation clearly — include relevant dates, amounts, or previous communications."
                  : contactMethod === "call"
                    ? "Tell the FoH project manager what you need help with before the call."
                    : contactMethod === "whatsapp"
                      ? "Tell FoH what you would like discussed on WhatsApp."
                      : "Tell FoH how you would like help with this project."
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {contactMethod === "call" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">Preferred date</label>
                <input
                  type="date"
                  min={getNextAllowedDate()}
                  value={requestedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-500">Mon–Fri 09:00–18:00, Sat 09:00–13:00.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">Preferred time</label>
                <select
                  value={requestedTime}
                  onChange={(e) => setRequestedTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {availableTimes.length === 0 ? (
                    <option value="">No slots available</option>
                  ) : (
                    availableTimes.map((slot) => <option key={slot} value={slot}>{slot}</option>)
                  )}
                </select>
                {requestedDate && requestedTime && availableTimes.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Requested: {formatRequestedSlot(requestedDate, requestedTime)} (HKT)
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {isActive && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>Bi-lateral process:</strong> FoH will communicate with each party separately as neutral
            coordinators. Your messages will not be shared without consent.
          </div>
        )}

        {(localError || error) && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {localError || error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {isSubmitting
              ? "Submitting..."
              : contactMethod === "chat"
                ? `${submitPrefix} via chat`
                : contactMethod === "call"
                  ? `${submitPrefix} - book call`
                  : `${submitPrefix} via WhatsApp`}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

