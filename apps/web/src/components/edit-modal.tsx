"use client";

import { useState } from "react";
import { ModalOverlay } from "./modal-overlay";

export type FieldDefinition = {
  name: string;
  label: string;
  type: "text" | "email" | "number" | "select" | "date" | "textarea" | "json";
  value: any;
  options?: { label: string; value: string }[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fields: FieldDefinition[];
  onSave: (data: Record<string, any>) => Promise<void>;
  submitting?: boolean;
}

export function EditModal({ isOpen, onClose, title, fields, onSave, submitting }: EditModalProps) {
  const [formData, setFormData] = useState<Record<string, any>>(
    fields.reduce((acc, field) => ({ ...acc, [field.name]: field.value ?? "" }), {})
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async () => {
    // Basic validation
    const requiredFields = fields.filter((f) => f.required);
    const missing = requiredFields.filter((f) => !formData[f.name] || formData[f.name] === "");
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        </div>

        <div className="grid gap-4">
          {fields.map((field) => (
            <div key={field.name} className="grid gap-2">
              <label className="text-sm font-medium text-slate-800">
                {field.label}
                {field.required && <span className="text-rose-500"> *</span>}
              </label>

              {field.type === "textarea" ? (
                <textarea
                  value={formData[field.name] ?? ""}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  disabled={field.disabled || saving}
                  placeholder={field.placeholder}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                />
              ) : field.type === "select" ? (
                <select
                  value={formData[field.name] ?? ""}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  disabled={field.disabled || saving}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="">Select {field.label}</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "json" ? (
                <textarea
                  value={
                    typeof formData[field.name] === "string"
                      ? formData[field.name]
                      : JSON.stringify(formData[field.name], null, 2)
                  }
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      handleChange(field.name, parsed);
                    } catch {
                      handleChange(field.name, e.target.value);
                    }
                  }}
                  disabled={field.disabled || saving}
                  placeholder={field.placeholder || "{}"}
                  rows={6}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm disabled:bg-slate-100 disabled:text-slate-500"
                />
              ) : (
                <input
                  type={field.type}
                  value={formData[field.name] ?? ""}
                  onChange={(e) =>
                    handleChange(
                      field.name,
                      field.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value
                    )
                  }
                  disabled={field.disabled || saving}
                  placeholder={field.placeholder}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || submitting}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving || submitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
