export type QuoteBreakdownCode = 'callout_fee' | 'supplies' | 'labour' | 'other_items';

export interface QuoteBreakdownItem {
  code: QuoteBreakdownCode;
  label: string;
  amount: number;
  required?: boolean;
  displayOrder?: number;
  notes?: string;
}

export interface StoredQuoteBreakdown {
  version: 1;
  projectScale?: string | null;
  isEmergency?: boolean;
  baseItems?: QuoteBreakdownItem[];
  items?: QuoteBreakdownItem[];
  baseTotal?: number;
  clientItems?: QuoteBreakdownItem[];
  clientTotal?: number;
}

export interface QuoteBreakdownFormValues {
  calloutFee: string;
  supplies: string;
  labour: string;
  otherItems: string;
  otherItemsDescription: string;
}

export interface QuoteBreakdownFieldDefinition {
  key: keyof QuoteBreakdownFormValues;
  code: QuoteBreakdownCode;
  label: string;
  required: boolean;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const toDisplayString = (value: number) => {
  const fixed = roundMoney(value).toFixed(2);
  return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

export const emptyQuoteBreakdownForm = (): QuoteBreakdownFormValues => ({
  calloutFee: '',
  supplies: '',
  labour: '',
  otherItems: '',
  otherItemsDescription: '',
});

export const getQuoteBreakdownFields = (isEmergency: boolean): QuoteBreakdownFieldDefinition[] => {
  const fields: QuoteBreakdownFieldDefinition[] = [];
  if (isEmergency) {
    fields.push({ key: 'calloutFee', code: 'callout_fee', label: 'Callout fee', required: false });
  }
  fields.push({ key: 'supplies', code: 'supplies', label: 'Supplies', required: true });
  fields.push({ key: 'labour', code: 'labour', label: 'Labour', required: true });
  fields.push({ key: 'otherItems', code: 'other_items', label: 'Other items (optional)', required: false });
  return fields;
};

export const getQuoteBreakdownBaseItems = (value?: unknown | null): QuoteBreakdownItem[] => {
  if (!value || typeof value !== 'object') return [];
  const payload = value as StoredQuoteBreakdown;
  const source = Array.isArray(payload.baseItems)
    ? payload.baseItems
    : Array.isArray(payload.items)
      ? payload.items
      : [];
  return source
    .filter((item): item is QuoteBreakdownItem => !!item && typeof item === 'object' && typeof item.code === 'string')
    .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
};

export const getQuoteBreakdownClientItems = (value?: unknown | null): QuoteBreakdownItem[] => {
  if (!value || typeof value !== 'object') return [];
  const payload = value as StoredQuoteBreakdown;
  if (Array.isArray(payload.clientItems)) {
    return payload.clientItems
      .filter((item): item is QuoteBreakdownItem => !!item && typeof item === 'object' && typeof item.code === 'string')
      .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
  }
  return getQuoteBreakdownBaseItems(value);
};

export const getQuoteBreakdownBaseTotal = (value?: unknown | null, fallback?: number | string | null): number => {
  if (value && typeof value === 'object') {
    const payload = value as StoredQuoteBreakdown;
    if (typeof payload.baseTotal === 'number' && Number.isFinite(payload.baseTotal)) {
      return roundMoney(payload.baseTotal);
    }
  }
  const numericFallback = Number(fallback || 0);
  return Number.isFinite(numericFallback) ? roundMoney(numericFallback) : 0;
};

export const getQuoteBreakdownClientTotal = (value?: unknown | null, fallback?: number | string | null): number => {
  if (value && typeof value === 'object') {
    const payload = value as StoredQuoteBreakdown;
    if (typeof payload.clientTotal === 'number' && Number.isFinite(payload.clientTotal)) {
      return roundMoney(payload.clientTotal);
    }
  }
  const numericFallback = Number(fallback || 0);
  return Number.isFinite(numericFallback) ? roundMoney(numericFallback) : 0;
};

export const parseQuoteBreakdownForm = (
  value: unknown | null | undefined,
  fallbackBaseTotal?: number | string | null,
): QuoteBreakdownFormValues => {
  const form = emptyQuoteBreakdownForm();
  const items = getQuoteBreakdownBaseItems(value);

  items.forEach((item) => {
    const amount = toDisplayString(item.amount || 0);
    if (item.code === 'callout_fee') form.calloutFee = amount;
    if (item.code === 'supplies') form.supplies = amount;
    if (item.code === 'labour') form.labour = amount;
    if (item.code === 'other_items') form.otherItems = amount;
  });

  if (!form.supplies && !form.labour) {
    const fallbackAmount = getQuoteBreakdownBaseTotal(value, fallbackBaseTotal);
    if (fallbackAmount > 0) {
      form.labour = toDisplayString(fallbackAmount);
    }
  }

  return form;
};

const parseAmount = (value: string) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric >= 0 ? roundMoney(numeric) : 0;
};

export const getQuoteBreakdownFormTotal = (form: QuoteBreakdownFormValues): number => {
  return roundMoney(parseAmount(form.calloutFee) + parseAmount(form.supplies) + parseAmount(form.labour) + parseAmount(form.otherItems));
};

export const buildQuoteBreakdownPayload = (
  form: QuoteBreakdownFormValues,
  context: { isEmergency: boolean; projectScale?: string | null },
): StoredQuoteBreakdown => {
  const fields = getQuoteBreakdownFields(context.isEmergency);
  const baseItems = fields
    .map((field, index) => {
      const item: QuoteBreakdownItem = {
        code: field.code,
        label: field.label,
        amount: parseAmount(form[field.key]),
        required: field.required,
        displayOrder: index + 1,
      };
      if (field.code === 'other_items' && form.otherItemsDescription?.trim()) {
        item.notes = form.otherItemsDescription.trim();
      }
      return item;
    })
    .filter((item) => item.required || item.amount > 0 || item.code === 'other_items');

  const baseTotal = roundMoney(baseItems.reduce((sum, item) => sum + item.amount, 0));

  return {
    version: 1,
    projectScale: context.projectScale || null,
    isEmergency: context.isEmergency,
    baseItems,
    baseTotal,
  };
};