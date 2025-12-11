'use client';

import type { FormField, FormSchema } from '../data/form-schemas';

type FormData = Record<string, string | string[] | boolean>;

type DynamicFormProps = {
  schema: FormSchema;
  onSubmit: (data: FormData) => void;
  onCancel?: () => void;
  isLoading?: boolean;
};

function FormInput({ field }: { field: FormField }) {
  switch (field.type) {
    case 'text':
    case 'email':
    case 'tel':
    case 'url':
      return (
        <input
          type={field.type}
          id={field.id}
          name={field.id}
          placeholder={field.placeholder}
          required={field.required}
          maxLength={field.maxlength}
          pattern={field.pattern}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
      );

    case 'number':
      return (
        <input
          type="number"
          id={field.id}
          name={field.id}
          placeholder={field.placeholder}
          required={field.required}
          min={field.min}
          max={field.max}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
      );

    case 'textarea':
      return (
        <textarea
          id={field.id}
          name={field.id}
          placeholder={field.placeholder}
          required={field.required}
          rows={field.rows || 3}
          maxLength={field.maxlength}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
      );

    case 'select':
      return (
        <select
          id={field.id}
          name={field.id}
          required={field.required}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        >
          <option value="">Select an option...</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );

    case 'checkbox':
      return (
        <div className="space-y-2">
          {field.options?.map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input
                type="checkbox"
                name={field.id}
                value={option}
                className="rounded border-slate-300 text-slate-900"
              />
              <span className="text-sm text-slate-700">{option}</span>
            </label>
          ))}
        </div>
      );

    case 'radio':
      return (
        <div className="space-y-2">
          {field.options?.map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input
                type="radio"
                name={field.id}
                value={option}
                required={field.required}
                className="border-slate-300 text-slate-900"
              />
              <span className="text-sm text-slate-700">{option}</span>
            </label>
          ))}
        </div>
      );

    case 'checkbox_single':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name={field.id}
            required={field.required}
            className="rounded border-slate-300 text-slate-900"
          />
          <span className="text-sm text-slate-700">{field.label}</span>
        </label>
      );

    case 'file':
      return (
        <input
          type="file"
          id={field.id}
          name={field.id}
          required={field.required}
          accept={field.accept}
          multiple={field.multiple}
          className="w-full text-sm file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-900 hover:file:bg-slate-200"
        />
      );

    default:
      return null;
  }
}

export function DynamicForm({ schema, onSubmit, onCancel, isLoading }: DynamicFormProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: FormData = {};

    formData.forEach((value, key) => {
      if (key in data) {
        const existing = data[key];
        if (Array.isArray(existing)) {
          existing.push(String(value));
        } else {
          data[key] = [String(existing), String(value)];
        }
      } else {
        data[key] = String(value);
      }
    });

    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Form Header */}
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">{schema.formTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{schema.formDescription}</p>
      </div>

      {/* Sections */}
      {schema.sections.map((section) => (
        <section key={section.id} className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>

          <div className="space-y-4">
            {section.fields.map((field) => (
              <div key={field.id}>
                {field.type !== 'checkbox_single' && (
                  <label htmlFor={field.id} className="block text-sm font-medium text-slate-900">
                    {field.label}
                    {field.required && <span className="text-red-500"> *</span>}
                  </label>
                )}

                <div className="mt-1">
                  <FormInput field={field} />
                </div>

                {field.help && <p className="mt-1 text-xs text-slate-500">{field.help}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Submit Button */}
      <div className="flex gap-3 border-t border-slate-200 pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isLoading ? 'Submitting...' : 'Submit Application'}
        </button>
      </div>
    </form>
  );
}
