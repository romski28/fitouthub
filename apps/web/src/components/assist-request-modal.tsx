"use client";

import { useMemo, useState } from "react";
import { ModalOverlay } from "./modal-overlay";

export type AssistContactMethod = "chat" | "call" | "whatsapp";

export type AssistRequestModalSubmit = {
  contactMethod: AssistContactMethod;
  notes: string;
  requestedCallAt?: string;
  requestedCallTimezone?: string;
};

type AssistRequestModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: AssistRequestModalSubmit) => Promise<void> | void;
  isSubmitting?: boolean;
  error?: string | null;
  initialNotes?: string;
  projectName?: string;
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

export function AssistRequestModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  error,
  initialNotes = "",
  projectName,
  submitPrefix = "Create project & request",
}: AssistRequestModalProps) {
  const [contactMethod, setContactMethod] = useState<AssistContactMethod>("chat");
  const [notes, setNotes] = useState(initialNotes);
  const [requestedDate, setRequestedDate] = useState(getNextAllowedDate());
  const [requestedTime, setRequestedTime] = useState("09:00");
  const [localError, setLocalError] = useState<string | null>(null);

  const availableTimes = useMemo(() => getAllowedTimes(requestedDate), [requestedDate]);

  const handleDateChange = (value: string) => {
    setRequestedDate(value);
    const nextTimes = getAllowedTimes(value);
    setRequestedTime(nextTimes[0] || "");
  };

  const handleSubmit = async () => {
    setLocalError(null);

    if (!notes.trim()) {
      setLocalError("Please tell Fitout Hub how you would like us to help.");
      return;
    }

    if (contactMethod === "call") {
      const chosenDate = new Date(`${requestedDate}T00:00:00`);
      if (chosenDate.getDay() === 0) {
        setLocalError("Calls are not available on Sundays.");
        return;
      }
      if (!requestedDate || !requestedTime) {
        setLocalError("Please choose a preferred call date and time.");
        return;
      }
    }

    await onSubmit({
      contactMethod,
      notes: notes.trim(),
      requestedCallAt:
        contactMethod === "call" ? new Date(`${requestedDate}T${requestedTime}:00+08:00`).toISOString() : undefined,
      requestedCallTimezone: contactMethod === "call" ? "Asia/Hong_Kong" : undefined,
    });
  };

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Fitout Hub assistance</p>
          <h2 className="text-2xl font-bold text-slate-900">Choose how you want FoH to help</h2>
          <p className="text-sm text-slate-600">
            {projectName
              ? `For ${projectName}, choose whether you'd like to chat in-platform, request a call, or ask FoH to WhatsApp you.`
              : "Choose whether you'd like to chat in-platform, request a call, or ask FoH to WhatsApp you."}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              value: "chat",
              title: "In-platform chat",
              description: "Start with the current FoH assistance flow and continue in chat.",
              emoji: "💬",
            },
            {
              value: "call",
              title: "Book a call",
              description: "Request a call with an FoH project manager during support hours.",
              emoji: "📞",
            },
            {
              value: "whatsapp",
              title: "Please WhatsApp me",
              description: "FoH will follow up manually on WhatsApp later.",
              emoji: "🟢",
            },
          ].map((option) => {
            const active = contactMethod === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setContactMethod(option.value as AssistContactMethod)}
                className={`rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-indigo-500 bg-indigo-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="mb-3 text-2xl">{option.emoji}</div>
                <div className="text-sm font-semibold text-slate-900">{option.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{option.description}</p>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-900">
              Initial request
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder={
                contactMethod === "call"
                  ? "Tell the FoH project manager what you need help with before the call. For example: help scoping works, budgeting, tendering, or choosing trades."
                  : contactMethod === "whatsapp"
                    ? "Tell FoH what you'd like discussed on WhatsApp and anything urgent we should know."
                    : "Tell FoH how you'd like help with this project. For example: scope review, trade selection, quote comparison, negotiation, or project planning."
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
                <p className="mt-1 text-xs text-slate-500">Calls available Mon–Fri 09:00–18:00 and Sat 09:00–13:00.</p>
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
                    availableTimes.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))
                  )}
                </select>
                {requestedDate && requestedTime && availableTimes.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Requested slot: {formatRequestedSlot(requestedDate, requestedTime)} (Hong Kong)
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

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
                ? `${submitPrefix} chat`
                : contactMethod === "call"
                  ? `${submitPrefix} call`
                  : `${submitPrefix} WhatsApp`}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
